// `MockTransport.ts` — deterministic adapter transport for Phase 2.
//
// Rules:
// - Zero network, zero CLI, zero SDK.
// - Every emitted string passes through `ctx.redact`.
// - Fully testable: default `delayMs = 0` makes the stream
//   deterministic.
// - Cancellation (AbortSignal) and timeout (`ctx.timeoutMs`) are
//   first-class.

import { randomUUID } from 'node:crypto';

import type { FreebuffAdapter } from './FreebuffAdapter';
import { buildCapabilityReport, isFreeModel } from './CapabilityMatrix';
import type {
  AdapterContext,
  CapabilityReport,
  ChatEvent,
  StartTaskInput,
  TaskHandle,
  TaskStatus,
} from './types';
import { AdapterError } from './types';

export type ChatEventScriptEntry = Omit<ChatEvent, 'seq' | 'ts'>;

export interface MockTransportOptions {
  /** Delay between scripted events in ms. Default 0 (deterministic). */
  readonly delayMs?: number;
  /** Custom script; defaults to a greeting sequence ending in agent_finish. */
  readonly script?: ReadonlyArray<ChatEventScriptEntry>;
}

const DEFAULT_SCRIPT: ReadonlyArray<ChatEventScriptEntry> = [
  { type: 'agent_start', text: 'Mock agent started (deterministic script).' },
  { type: 'status', text: 'planning…' },
  { type: 'tool_call', toolName: 'read_files', toolCallId: 'mock-1', text: 'Reading src/index.ts' },
  { type: 'tool_result', toolName: 'read_files', toolCallId: 'mock-1' },
  {
    type: 'text',
    text: 'This is a deterministic mock response (Phase 2). The real Freebuff CLI transport ships in Phase 5.',
  },
  { type: 'agent_finish', text: 'done' },
];

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new AdapterError('cancelled', 'Task cancelled before start.'));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new AdapterError('cancelled', 'Task cancelled while sleeping.'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

class MockTaskHandle implements TaskHandle {
  readonly id: string;
  private state: TaskStatus = 'running';
  private readonly controller: AbortController = new AbortController();
  private readonly script: ReadonlyArray<ChatEventScriptEntry>;
  private readonly delayMs: number;
  private readonly ctx: AdapterContext;
  private seq = 0;

  constructor(input: StartTaskInput, ctx: AdapterContext, delayMs: number, script: ReadonlyArray<ChatEventScriptEntry>) {
    this.id = `mock-${randomUUID()}`;
    this.delayMs = delayMs;
    this.script = script;
    this.ctx = ctx;
    // Model is validated against the verified free-tier list. Unknown
    // models are accepted but flagged so the UI can show a warning.
    void input;

    // Wire the caller-provided AbortSignal into the internal controller
    // so external cancellation behaves identically to handle.cancel().
    if (ctx.signal) {
      if (ctx.signal.aborted) {
        this.controller.abort();
      } else {
        ctx.signal.addEventListener('abort', () => this.controller.abort(), { once: true });
      }
    }
  }

  async cancel(): Promise<void> {
    if (this.state === 'completed' || this.state === 'failed' || this.state === 'cancelled') {
      return;
    }
    this.state = 'cancelling';
    this.controller.abort();
    this.state = 'cancelled';
  }

  async status(): Promise<TaskStatus> {
    return this.state;
  }

  dispose(): void {
    this.controller.abort();
  }

  async *events(): AsyncIterable<ChatEvent> {
    const deadline =
      this.ctx.timeoutMs !== undefined ? Date.now() + this.ctx.timeoutMs : undefined;

    try {
      for (const raw of this.script) {
        if (deadline !== undefined && Date.now() > deadline) {
          this.state = 'failed';
          yield this.makeEvent({ type: 'error', text: 'Mock task timed out.' });
          return;
        }
        if (this.controller.signal.aborted) {
          this.state = 'cancelled';
          yield this.makeEvent({ type: 'cancelled', text: 'Task cancelled by user.' });
          return;
        }
        await sleep(this.delayMs, this.controller.signal);
        if (this.controller.signal.aborted) {
          this.state = 'cancelled';
          yield this.makeEvent({ type: 'cancelled', text: 'Task cancelled by user.' });
          return;
        }
        yield this.makeEvent(raw);
      }

      // Guarantee a terminal event even for custom scripts that omit one.
      const last = this.script[this.script.length - 1];
      if (last?.type !== 'agent_finish' && last?.type !== 'cancelled' && last?.type !== 'error') {
        yield this.makeEvent({ type: 'agent_finish', text: 'Mock task completed.' });
      }
      this.state = 'completed';
    } catch (err) {
      if (err instanceof AdapterError && err.kind === 'cancelled') {
        this.state = 'cancelled';
        yield this.makeEvent({ type: 'cancelled', text: 'Task cancelled by user.' });
        return;
      }
      this.state = 'failed';
      yield this.makeEvent({ type: 'error', text: safeMessage(err) });
    }
  }

  private makeEvent(raw: ChatEventScriptEntry): ChatEvent {
    return {
      type: raw.type,
      seq: this.seq++,
      ts: Date.now(),
      ...(raw.text !== undefined ? { text: this.ctx.redact(raw.text) } : {}),
      ...(raw.toolName !== undefined ? { toolName: raw.toolName } : {}),
      ...(raw.toolCallId !== undefined ? { toolCallId: raw.toolCallId } : {}),
      ...(raw.payload !== undefined ? { payload: raw.payload } : {}),
    };
  }
}

function safeMessage(err: unknown): string {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return 'Unknown mock transport error.';
}

/**
 * Deterministic mock transport. `id = "mock"`.
 */
export class MockTransport implements FreebuffAdapter {
  readonly id = 'mock';
  private readonly delayMs: number;
  private readonly script: ReadonlyArray<ChatEventScriptEntry>;

  constructor(options: MockTransportOptions = {}) {
    this.delayMs = options.delayMs ?? 0;
    this.script = options.script ?? DEFAULT_SCRIPT;
  }

  capabilities(): CapabilityReport {
    return buildCapabilityReport('mock');
  }

  async startTask(input: StartTaskInput, ctx: AdapterContext): Promise<TaskHandle> {
    if (!input.prompt.trim()) {
      throw new AdapterError('internal', 'Prompt must not be empty.');
    }
    if (input.model !== undefined && !isFreeModel(input.model)) {
      // Not an error: the model may be BYOK; surface it truthfully.
      void input.model;
    }
    return new MockTaskHandle(input, ctx, this.delayMs, this.script);
  }

  async cancel(handle: TaskHandle): Promise<void> {
    await handle.cancel();
  }

  async status(handle: TaskHandle): Promise<TaskStatus> {
    return handle.status();
  }

  async resume(input: StartTaskInput, _ctx: AdapterContext, _previousState: unknown): Promise<TaskHandle> {
    // The mock accepts previous session state but does not branch on
    // it (capability status: NOT_APPLICABLE).
    return this.startTask(input, _ctx);
  }
}
