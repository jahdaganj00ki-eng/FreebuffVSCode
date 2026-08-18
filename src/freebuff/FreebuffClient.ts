// `FreebuffClient.ts` — SDK transport on top of `@codebuff/sdk`.
//
// Verified surface (public source, 2026-08-18):
// - `new CodebuffClient({ apiKey, cwd })`; key from constructor or
//   `CODEBUFF_API_KEY` env (client.ts).
// - `client.run(options)` with `signal?: AbortSignal` (cancellation),
//   `handleEvent?: (PrintModeEvent) => void`, `handleStreamChunk`,
//   `previousRun?: RunState` (resume), `projectFiles`, `maxAgentSteps`
//   (run.ts).
// - `PrintModeEvent` discriminated union: start / text / tool_call /
//   tool_result / error / finish / subagent_start / subagent_finish /
//   reasoning_delta / download (common/src/types/print-mode.ts).
// - `RunState = { sessionState?, output, traceSessionId }` (run-state.ts).
//
// The transport is AUTH-GATED: it requires a Codebuff API key from the
// AuthService (BYOK provider `codebuff`). Raw key material is passed
// only to the SDK constructor and never logged.

import { CodebuffClient } from '@codebuff/sdk';
import type {
  CodebuffClientOptions,
  PrintModeEvent,
  RunOptions,
  RunState,
} from '@codebuff/sdk';

import type { FreebuffAdapter } from './FreebuffAdapter';
import { buildSdkCapabilityReport } from './CapabilityMatrix';
import { AdapterError } from './types';
import type {
  AdapterContext,
  CapabilityReport,
  ChatEvent,
  StartTaskInput,
  TaskHandle,
  TaskStatus,
} from './types';

export interface SdkClientLike {
  run(options: RunOptions & CodebuffClientOptions): Promise<RunState>;
}

export interface SdkModuleLike {
  CodebuffClient: new (options: CodebuffClientOptions) => SdkClientLike;
}

export interface FreebuffClientOptions {
  /** Reads the raw API key. Only invoked when a task starts. */
  getApiKey: () => Promise<string | undefined>;
  /** Default agent for runs without an explicit agent. */
  defaultAgent?: string;
  /** Redactor for captured strings. */
  redact?: (s: string) => string;
  /** Injectable SDK module (tests). Defaults to the real @codebuff/sdk. */
  sdk?: SdkModuleLike;
}

const DEFAULT_AGENT = 'codebuff/base@latest';
const MAX_TOOL_TEXT = 300;
const MAX_SUMMARY = 2_000;

function summarizeOutput(output: unknown): string {
  if (output === null || output === undefined) {
    return '';
  }
  if (typeof output === 'string') {
    return output.slice(0, MAX_SUMMARY);
  }
  if (typeof output === 'object') {
    const record = output as { type?: unknown; message?: unknown; value?: unknown };
    if (record.type === 'error') {
      return typeof record.message === 'string' ? record.message : 'Agent error.';
    }
    try {
      const json = JSON.stringify(record.value ?? record).slice(0, MAX_SUMMARY);
      return json;
    } catch {
      return String(output).slice(0, MAX_SUMMARY);
    }
  }
  return String(output).slice(0, MAX_SUMMARY);
}

/** Loose runtime guard so `previousSessionState` (opaque) can become a RunState. */
function coercePreviousRun(previousState: unknown): RunState | undefined {
  if (previousState === null || typeof previousState !== 'object') {
    return undefined;
  }
  const record = previousState as { sessionState?: unknown; output?: unknown };
  const hasSession = record.sessionState !== undefined && typeof record.sessionState === 'object';
  const hasOutput = record.output !== undefined;
  if (!hasSession && !hasOutput) {
    return undefined;
  }
  const runState: RunState = {
    output: (record.output ?? { type: 'allMessages', value: [] }) as RunState['output'],
  };
  if (hasSession && record.sessionState !== undefined) {
    runState.sessionState = record.sessionState as NonNullable<RunState['sessionState']>;
  }
  return runState;
}

class EventChannel {
  private readonly queue: ChatEvent[] = [];
  private readonly waiters: Array<(e: ChatEvent | undefined) => void> = [];
  private closed = false;

  push(event: ChatEvent): void {
    if (this.closed) {
      return;
    }
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter(event);
    } else {
      this.queue.push(event);
    }
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) {
      waiter(undefined);
    }
  }

  async *iterate(): AsyncIterable<ChatEvent> {
    for (;;) {
      const pending = this.queue.shift();
      if (pending) {
        yield pending;
        continue;
      }
      if (this.closed) {
        return;
      }
      const next = await new Promise<ChatEvent | undefined>((resolve) => {
        this.waiters.push(resolve);
      });
      if (next) {
        yield next;
      } else {
        return;
      }
    }
  }
}

class SdkTaskHandle implements TaskHandle {
  readonly id: string;
  private state: TaskStatus = 'running';
  private readonly controller: AbortController = new AbortController();
  private readonly channel = new EventChannel();
  private lastRunState: RunState | undefined;
  private seq = 0;

  constructor(
    id: string,
    input: StartTaskInput,
    ctx: AdapterContext,
    private readonly apiKey: string,
    private readonly sdk: SdkModuleLike,
    private readonly redact: (s: string) => string,
    private readonly defaultAgent: string,
  ) {
    this.id = id;
    if (ctx.signal) {
      if (ctx.signal.aborted) {
        this.controller.abort();
      } else {
        ctx.signal.addEventListener('abort', () => this.controller.abort(), { once: true });
      }
    }
    void this.runSdk(input, ctx);
  }

  private async runSdk(input: StartTaskInput, ctx: AdapterContext): Promise<void> {
    try {
      const client = new this.sdk.CodebuffClient({ apiKey: this.apiKey, cwd: ctx.cwd });
      const runOptions: RunOptions & CodebuffClientOptions = {
        agent: input.agent ?? this.defaultAgent,
        prompt: input.prompt,
        signal: this.controller.signal,
        handleEvent: (event: PrintModeEvent) => {
          this.handleEvent(event);
        },
        handleStreamChunk: (chunk) => {
          if (typeof chunk === 'string' && chunk.length > 0) {
            this.emit({ type: 'text', text: this.redact(chunk) });
          }
        },
        ...(input.maxAgentSteps !== undefined ? { maxAgentSteps: input.maxAgentSteps } : {}),
        ...(input.projectFiles !== undefined ? { projectFiles: input.projectFiles } : {}),
        ...(input.previousSessionState !== undefined
          ? (() => {
              const previous = coercePreviousRun(input.previousSessionState);
              return previous !== undefined ? { previousRun: previous } : {};
            })()
          : {}),
      };
      const result = await client.run(runOptions);
      this.lastRunState = result;

      if (this.controller.signal.aborted) {
        this.state = 'cancelled';
        this.emit({ type: 'cancelled', text: 'Run cancelled by user.' });
        return;
      }

      const output = (result as RunState).output;
      if (output?.type === 'error') {
        this.state = 'failed';
        this.emit({ type: 'error', text: this.redact(output.message ?? 'SDK run failed.') });
        return;
      }
      if (this.state !== 'failed') {
        this.state = 'completed';
        this.emit({ type: 'agent_finish', text: summarizeOutput(output) });
      }
    } catch (err) {
      if (this.controller.signal.aborted) {
        this.state = 'cancelled';
        this.emit({ type: 'cancelled', text: 'Run cancelled by user.' });
        return;
      }
      this.state = 'failed';
      const message = err instanceof Error ? this.redact(err.message) : 'Unexpected SDK error.';
      this.emit({ type: 'error', text: message });
    } finally {
      this.channel.close();
    }
  }

  private handleEvent(event: PrintModeEvent): void {
    switch (event.type) {
      case 'start':
        this.emit({ type: 'agent_start', text: 'Agent started.' });
        break;
      case 'text':
        this.emit({ type: 'text', text: this.redact(event.text) });
        break;
      case 'tool_call': {
        const inputText = JSON.stringify(event.input ?? {});
        const text = `${event.toolName}(${inputText.slice(0, MAX_TOOL_TEXT)})`;
        this.emit({ type: 'tool_call', toolName: event.toolName, toolCallId: event.toolCallId, text: this.redact(text) });
        break;
      }
      case 'tool_result': {
        this.emit({ type: 'tool_result', toolName: event.toolName, toolCallId: event.toolCallId });
        break;
      }
      case 'error':
        this.state = 'failed';
        this.emit({ type: 'error', text: this.redact(event.message) });
        break;
      case 'finish':
        this.emit({ type: 'status', text: `totalCost: ${String(event.totalCost)}` });
        break;
      case 'subagent_start':
        this.emit({ type: 'status', text: `subagent ${event.agentType} started` });
        break;
      case 'subagent_finish':
        this.emit({ type: 'status', text: `subagent ${event.agentType} finished` });
        break;
      case 'reasoning_delta':
        // Internal reasoning — surfaced as a lightweight status, not per-delta.
        if (this.seq % 4 === 0) {
          this.emit({ type: 'status', text: 'reasoning…' });
        }
        break;
      case 'download':
        this.emit({ type: 'status', text: `download ${event.version}: ${event.status}` });
        break;
    }
  }

  private emit(event: Omit<ChatEvent, 'seq' | 'ts'>): void {
    this.channel.push({ ...event, seq: this.seq++, ts: Date.now() });
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

  events(): AsyncIterable<ChatEvent> {
    return this.channel.iterate();
  }

  dispose(): void {
    this.controller.abort();
    this.channel.close();
  }
}

/**
 * SDK transport. `id = "sdk"`. Requires an API key (AuthService BYOK
 * provider `codebuff`); without one, startTask throws AdapterError('auth').
 */
export class FreebuffClient implements FreebuffAdapter {
  readonly id = 'sdk';
  private readonly getApiKey: () => Promise<string | undefined>;
  private readonly defaultAgent: string;
  private readonly redact: (s: string) => string;
  private readonly sdk: SdkModuleLike;
  private counter = 0;

  constructor(options: FreebuffClientOptions) {
    this.getApiKey = options.getApiKey;
    this.defaultAgent = options.defaultAgent ?? DEFAULT_AGENT;
    this.redact = options.redact ?? ((s: string) => s);
    this.sdk = options.sdk ?? { CodebuffClient };
  }

  capabilities(): CapabilityReport {
    return buildSdkCapabilityReport();
  }

  async startTask(input: StartTaskInput, ctx: AdapterContext): Promise<TaskHandle> {
    if (!input.prompt.trim()) {
      throw new AdapterError('internal', 'Prompt must not be empty.');
    }
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new AdapterError(
        'auth',
        'SDK transport requires a Codebuff API key. Configure it via "Freebuff: Configure BYOK Key" (provider: codebuff) or set freebuff.allowBringYourOwnKey=true.',
      );
    }
    this.counter += 1;
    return new SdkTaskHandle(`sdk-${this.counter}`, input, ctx, apiKey, this.sdk, this.redact, this.defaultAgent);
  }

  async cancel(handle: TaskHandle): Promise<void> {
    await handle.cancel();
  }

  async status(handle: TaskHandle): Promise<TaskStatus> {
    return handle.status();
  }

  async resume(input: StartTaskInput, ctx: AdapterContext, previousState: unknown): Promise<TaskHandle> {
    const previous = coercePreviousRun(previousState);
    if (previous === undefined) {
      throw new AdapterError('internal', 'Cannot resume: previous run state is missing or malformed.');
    }
    return this.startTask({ ...input, previousSessionState: previous }, ctx);
  }
}
