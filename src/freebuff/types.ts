// `types.ts` — canonical internal contract for the Freebuff adapter.
// These types deliberately do NOT leak `@codebuff/sdk` or Freebuff-CLI
// shapes into the rest of the extension. Every transport (mock, CLI,
// SDK) maps into this vocabulary.

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

export type CapabilityStatus = 'VERIFIED' | 'UNVERIFIED' | 'BLOCKED' | 'NOT_APPLICABLE';

export interface Capability {
  readonly id: string;
  readonly status: CapabilityStatus;
  readonly note: string;
}

export interface CapabilityReport {
  readonly version: number;
  readonly generatedAt: string;
  /** Active transport: `mock`, `sdk`, or `cli`. */
  readonly transportId: string;
  readonly capabilities: ReadonlyArray<Capability>;
  readonly verifiedModels: ReadonlyArray<string>;
  readonly verifiedSubagents: ReadonlyArray<string>;
}

// ---------------------------------------------------------------------------
// Chat events (canonical stream model)
// ---------------------------------------------------------------------------

export type ChatEventType =
  | 'agent_start'
  | 'agent_finish'
  | 'tool_call'
  | 'tool_result'
  | 'text'
  | 'status'
  | 'error'
  | 'cancelled';

export interface ChatEvent {
  readonly type: ChatEventType;
  /** Monotonic sequence number within one task stream. */
  readonly seq: number;
  /** Unix timestamp in milliseconds. */
  readonly ts: number;
  readonly text?: string;
  readonly toolName?: string;
  readonly toolCallId?: string;
  readonly payload?: Readonly<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Task lifecycle
// ---------------------------------------------------------------------------

export type TaskStatus = 'idle' | 'running' | 'cancelling' | 'cancelled' | 'completed' | 'failed';

export interface TaskHandle {
  readonly id: string;
  cancel(): Promise<void>;
  status(): Promise<TaskStatus>;
  /** Consume the event stream; resolves when the task finishes. */
  events(): AsyncIterable<ChatEvent>;
  dispose(): void;
}

export interface StartTaskInput {
  readonly prompt: string;
  /** Agent ID from the verified Freebuff/Codebuff surface. Defaults per transport. */
  readonly agent?: string;
  /** Model from the verified free-tier list (see CapabilityMatrix). */
  readonly model?: string;
  /**
   * SDK cost mode ('free' | 'normal' | 'max' | 'experimental' | 'ask').
   * VERIFIED in @codebuff/sdk@0.10.7 RunOptions; the SDK documents
   * "'free' mode means 0 credits charged for all agents". The mock
   * transport ignores it. Eligibility is decided server-side.
   */
  readonly costMode?: string;
  readonly projectFiles?: Readonly<Record<string, string>>;
  readonly maxAgentSteps?: number;
  /** Opaque session state from a previous run (mock: accepted, not branched on). */
  readonly previousSessionState?: unknown;
}

export interface AdapterContext {
  readonly cwd: string;
  /** Redactor applied to every string the adapter emits. */
  readonly redact: (s: string) => string;
  readonly signal?: AbortSignal;
  readonly maxBytes?: number;
  readonly timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Adapter errors (local vocabulary; no SDK errors leak past the adapter)
// ---------------------------------------------------------------------------

export type AdapterErrorKind =
  | 'auth'
  | 'payment-required'
  | 'forbidden'
  | 'http'
  | 'network'
  | 'timeout'
  | 'cancelled'
  | 'internal';

export interface AdapterErrorOptions {
  readonly cause?: unknown;
  readonly statusCode?: number;
}

export class AdapterError extends Error {
  readonly kind: AdapterErrorKind;
  readonly statusCode?: number;

  constructor(kind: AdapterErrorKind, message: string, options?: AdapterErrorOptions) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'AdapterError';
    this.kind = kind;
    if (options?.statusCode !== undefined) {
      this.statusCode = options.statusCode;
    }
  }
}
