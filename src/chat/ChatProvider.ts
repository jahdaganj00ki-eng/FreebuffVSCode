// `ChatProvider.ts` — session + task orchestration.
//
// Pure TypeScript (no vscode import). The webview host wires this to
// UI events; the adapter is injected so tests can drive it with the
// MockTransport (or a scripted fake).
//
// Security invariants:
// - All strings are redacted before they are stored or emitted.
// - Prompts are size-limited (maxPromptBytes).
// - Task cancellation is delegated to the adapter and is idempotent.

import type { FreebuffAdapter } from '../freebuff/FreebuffAdapter';
import { AdapterError } from '../freebuff/types';
import type { StartTaskInput, TaskHandle } from '../freebuff/types';
import type { ChatMessage } from '../ui/webview/schema';
import type { SessionStore } from './SessionStore';

export interface ChatProviderOptions {
  readonly store: SessionStore;
  readonly adapter: FreebuffAdapter;
  readonly redact: (s: string) => string;
  readonly maxPromptBytes?: number;
  readonly taskTimeoutMs?: number;
}

export const DEFAULT_MAX_PROMPT_BYTES = 64 * 1024;
export const DEFAULT_TASK_TIMEOUT_MS = 120_000;

export type ChatProviderListener = () => void;

export class ChatProvider {
  private readonly store: SessionStore;
  private readonly adapter: FreebuffAdapter;
  private readonly redact: (s: string) => string;
  private readonly maxPromptBytes: number;
  private readonly taskTimeoutMs: number;
  private readonly handles = new Map<string, TaskHandle>();
  private readonly listeners = new Set<ChatProviderListener>();

  constructor(options: ChatProviderOptions) {
    this.store = options.store;
    this.adapter = options.adapter;
    this.redact = options.redact;
    this.maxPromptBytes = options.maxPromptBytes ?? DEFAULT_MAX_PROMPT_BYTES;
    this.taskTimeoutMs = options.taskTimeoutMs ?? DEFAULT_TASK_TIMEOUT_MS;
  }

  subscribe(listener: ChatProviderListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  state(): { sessions: ReadonlyArray<import('../ui/webview/schema').Session>; activeSessionId: string } {
    return { sessions: this.store.list(), activeSessionId: this.store.activeId() ?? '' };
  }

  isRunning(sessionId: string): boolean {
    const session = this.store.get(sessionId);
    return session?.taskStatus === 'running' || session?.taskStatus === 'cancelling';
  }

  async sendPrompt(
    prompt: string,
    options?: { model?: string; agent?: string },
  ): Promise<void> {
    const trimmed = prompt.trim();
    if (trimmed.length === 0) {
      throw new AdapterError('internal', 'Prompt must not be empty.');
    }
    const bytes = Buffer.byteLength(trimmed, 'utf8');
    if (bytes > this.maxPromptBytes) {
      throw new AdapterError('internal', `Prompt exceeds the ${this.maxPromptBytes}-byte limit.`);
    }

    const session = this.store.ensureActive();
    this.store.addMessage(session.id, { role: 'user', text: this.redact(trimmed) });
    this.store.setTaskStatus(session.id, 'running');
    this.emit();

    const assistantMsg = this.store.addMessage(session.id, {
      role: 'assistant',
      text: '',
      status: 'streaming',
    });
    let streamed = '';

    const startInput: StartTaskInput = {
      prompt: trimmed,
      ...(options?.model !== undefined ? { model: options.model } : {}),
      ...(options?.agent !== undefined ? { agent: options.agent } : {}),
    };

    try {
      const handle = await this.adapter.startTask(
        startInput,
        {
          cwd: process.cwd(),
          redact: this.redact,
          maxBytes: this.maxPromptBytes,
          timeoutMs: this.taskTimeoutMs,
        },
      );
      this.handles.set(session.id, handle);

      for await (const event of handle.events()) {
        switch (event.type) {
          case 'text':
          case 'status': {
            streamed += event.text ?? '';
            this.store.updateMessage(session.id, assistantMsg.id, {
              text: streamed,
              status: 'streaming',
            });
            this.emit();
            break;
          }
          case 'tool_call':
          case 'tool_result': {
            this.store.addMessage(session.id, {
              role: 'tool',
              text: event.text ?? '',
              toolName: event.toolName,
              seq: event.seq,
            });
            this.emit();
            break;
          }
          case 'error': {
            this.store.updateMessage(session.id, assistantMsg.id, {
              text: event.text ?? 'The agent reported an error.',
              status: 'error',
            });
            this.store.setTaskStatus(session.id, 'failed');
            this.emit();
            return;
          }
          case 'cancelled': {
            this.store.updateMessage(session.id, assistantMsg.id, {
              text: streamed.length > 0 ? streamed : 'Cancelled.',
              status: 'cancelled',
            });
            this.store.setTaskStatus(session.id, 'cancelled');
            this.emit();
            return;
          }
          case 'agent_finish': {
            this.store.updateMessage(session.id, assistantMsg.id, {
              text: streamed.length > 0 ? streamed : event.text ?? '',
              status: 'complete',
            });
            this.store.setTaskStatus(session.id, 'completed');
            this.emit();
            break;
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? this.redact(err.message) : 'Unexpected adapter error.';
      this.store.updateMessage(session.id, assistantMsg.id, {
        text: message,
        status: 'error',
      });
      this.store.setTaskStatus(session.id, 'failed');
      this.emit();
    } finally {
      this.handles.delete(session.id);
    }
  }

  async cancel(sessionId?: string): Promise<void> {
    const id = sessionId ?? this.store.activeId();
    if (id === null) {
      return;
    }
    const handle = this.handles.get(id);
    if (!handle) {
      // No live task — mark cancelled anyway so the UI state settles.
      this.store.setTaskStatus(id, 'cancelled');
      this.emit();
      return;
    }
    await this.adapter.cancel(handle);
    this.handles.delete(id);
  }

  async rerun(sessionId?: string): Promise<void> {
    const id = sessionId ?? this.store.activeId();
    const session = id !== null ? this.store.get(id) : undefined;
    if (!session) {
      return;
    }
    const lastUser = [...session.messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) {
      return;
    }
    // Note: the stored user text is already redacted. The mock is
    // non-semantic, so re-sending the redacted form is acceptable for
    // Phase 4; Phase 5 will keep a transient, non-persisted original.
    await this.sendPrompt(lastUser.text);
  }

  newSession(): void {
    this.store.newSession();
    this.emit();
  }

  deleteSession(sessionId: string): void {
    const handle = this.handles.get(sessionId);
    if (handle) {
      void this.adapter.cancel(handle);
      this.handles.delete(sessionId);
    }
    this.store.deleteSession(sessionId);
    this.emit();
  }

  /** Raw view of a session's messages (used by host + tests). */
  messages(sessionId: string): ReadonlyArray<ChatMessage> {
    return this.store.get(sessionId)?.messages ?? [];
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
