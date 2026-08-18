// `FreebuffAdapter.ts` — stable internal interface between the
// extension UI and any transport (mock, CLI subprocess, optional SDK).
//
// Contract guarantees:
// - Every string the adapter returns is already redacted by the
//   caller-provided `AdapterContext.redact`.
// - Errors are always `AdapterError` with a local `kind`; raw SDK/CLI
//   errors never cross this boundary.
// - `cancel()` must be idempotent and must eventually move the task
//   to `cancelled`.
// - `resume()` is OPTIONAL. Transports that cannot resume a previous
//   session must omit it (so capability reporting stays truthful).

import type {
  AdapterContext,
  CapabilityReport,
  StartTaskInput,
  TaskHandle,
  TaskStatus,
} from './types';

export interface FreebuffAdapter {
  /** Stable transport identifier: `mock`, `cli`, or `sdk`. */
  readonly id: string;

  /** Start a new agent task and return a handle to its stream. */
  startTask(input: StartTaskInput, ctx: AdapterContext): Promise<TaskHandle>;

  /** Cancel a running task. Idempotent. */
  cancel(handle: TaskHandle): Promise<void>;

  /** Current status of a task handle. */
  status(handle: TaskHandle): Promise<TaskStatus>;

  /** Veracity-tagged report of what this transport can and cannot do. */
  capabilities(): CapabilityReport;

  /** OPTIONAL: continue a task from opaque previous session state. */
  resume?(input: StartTaskInput, ctx: AdapterContext, previousState: unknown): Promise<TaskHandle>;
}
