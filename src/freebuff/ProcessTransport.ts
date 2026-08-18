// `ProcessTransport.ts` — verified Freebuff-CLI surface.
//
// Phase 5 findings (docs/freebuff-inventory.md, 2026-08-18):
// - `freebuff --version`  → prints the version (VERIFIED by dry-run: 0.0.150).
// - `freebuff --help`     → documents `-v/--version`, `--continue [id]`,
//   `--cwd <dir>`, `-h/--help`, command `login` (VERIFIED).
// - Agent streaming       → BLOCKED. The CLI is an interactive TUI that
//   requires a real TTY ("the TUI owns the terminal" — launcher source).
//   No headless/stdin protocol is documented, and the master prompt
//   forbids TUI scraping. `startTask()` therefore rejects cleanly.
//
// Rules enforced here:
// - Arguments are always a `string[]`; never a shell string.
// - stdout/stderr are captured with a byte cap and passed through the
//   injected redactor before returning or logging.
// - Every probe has a timeout; on timeout the child is killed.
// - The CLI binary is never auto-installed by this extension; the
//   user installs it via the documented `npm install -g freebuff`.

import { spawn } from 'node:child_process';

import { AdapterError } from './types';
import type {
  AdapterContext,
  CapabilityReport,
  ChatEvent,
  StartTaskInput,
  TaskHandle,
  TaskStatus,
} from './types';
import type { FreebuffAdapter } from './FreebuffAdapter';
import { buildCapabilityReport } from './CapabilityMatrix';

export interface SpawnOutcome {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly timedOut: boolean;
  readonly spawnError?: string;
}

export type SpawnFn = (
  args: ReadonlyArray<string>,
  options: { readonly timeoutMs: number; readonly cwd?: string },
) => Promise<SpawnOutcome>;

export interface ProcessTransportOptions {
  /** Binary name (or absolute path). Defaults to the documented `freebuff`. */
  readonly binary?: string;
  /** Injectable spawn implementation; defaults to node's child_process.spawn. */
  readonly spawnFn?: SpawnFn;
  /** Timeout for version/help probes. Default 15s. */
  readonly probeTimeoutMs?: number;
  /** Redactor applied to captured output. Defaults to identity. */
  readonly redact?: (s: string) => string;
  /** Max bytes kept from stdout/stderr per probe. Default 64 KiB. */
  readonly maxCaptureBytes?: number;
}

const MAX_CAPTURE_DEFAULT = 64 * 1024;

function nodeSpawn(binary: string, maxCaptureBytes: number): SpawnFn {
  return (args, options) =>
    new Promise<SpawnOutcome>((resolve) => {
      const child = spawn(binary, [...args], {
        cwd: options.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      let settled = false;

      const finish = (partial: Partial<SpawnOutcome>): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve({
          stdout,
          stderr,
          exitCode: partial.exitCode ?? null,
          signal: partial.signal ?? null,
          timedOut: partial.timedOut ?? false,
          ...(partial.spawnError !== undefined ? { spawnError: partial.spawnError } : {}),
        });
      };

      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        finish({ timedOut: true });
      }, options.timeoutMs);

      child.stdout.on('data', (chunk: Buffer) => {
        stdout = (stdout + chunk.toString('utf8')).slice(-maxCaptureBytes);
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr = (stderr + chunk.toString('utf8')).slice(-maxCaptureBytes);
      });
      child.on('error', (err: NodeJS.ErrnoException) => {
        finish({ spawnError: err.message });
      });
      child.on('close', (code, signal) => {
        finish({ exitCode: code, signal });
      });
    });
}

export const CLI_TUI_ONLY_MESSAGE =
  'Freebuff CLI is an interactive terminal TUI with no documented headless ' +
  'interface. Agent streaming through the CLI is BLOCKED (see ' +
  'docs/freebuff-inventory.md). Use "Freebuff: Open CLI in Terminal" to run ' +
  'it interactively, or switch the transport to mock/SDK where supported.';

export interface VersionProbe {
  readonly ok: boolean;
  readonly version: string | null;
  readonly raw: string;
  readonly error?: string;
}

export class ProcessTransport implements FreebuffAdapter {
  readonly id = 'cli';
  private readonly binary: string;
  private readonly spawnFn: SpawnFn;
  private readonly probeTimeoutMs: number;
  private readonly redact: (s: string) => string;

  constructor(options: ProcessTransportOptions = {}) {
    this.binary = options.binary ?? 'freebuff';
    this.probeTimeoutMs = options.probeTimeoutMs ?? 15_000;
    this.redact = options.redact ?? ((s: string) => s);
    const maxCapture = options.maxCaptureBytes ?? MAX_CAPTURE_DEFAULT;
    this.spawnFn = options.spawnFn ?? nodeSpawn(this.binary, maxCapture);
  }

  capabilities(): CapabilityReport {
    return buildCapabilityReport();
  }

  /**
   * Agent streaming via the CLI is BLOCKED. This rejects immediately
   * with a clear, honest error instead of scraping the TUI.
   */
  async startTask(_input: StartTaskInput, _ctx: AdapterContext): Promise<TaskHandle> {
    throw new AdapterError('forbidden', CLI_TUI_ONLY_MESSAGE);
  }

  async cancel(_handle: TaskHandle): Promise<void> {
    // No tasks can start, so cancellation is a no-op.
    return;
  }

  async status(_handle: TaskHandle): Promise<TaskStatus> {
    return 'idle';
  }

  /** Runs `freebuff --version` with a timeout. Output is redacted. */
  async probeVersion(): Promise<VersionProbe> {
    const outcome = await this.spawnFn(['--version'], { timeoutMs: this.probeTimeoutMs });
    if (outcome.spawnError !== undefined) {
      return {
        ok: false,
        version: null,
        raw: '',
        error: `Failed to start the Freebuff CLI (${this.binary}): ${this.redact(outcome.spawnError)}`,
      };
    }
    if (outcome.timedOut) {
      return { ok: false, version: null, raw: '', error: '`freebuff --version` timed out.' };
    }
    const raw = this.redact(outcome.stdout.trim());
    const versionMatch = raw.match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/);
    return {
      ok: outcome.exitCode === 0 && versionMatch !== null,
      version: versionMatch?.[0] ?? null,
      raw,
      ...(outcome.exitCode !== 0 ? { error: `exit code ${String(outcome.exitCode)}` } : {}),
    };
  }

  /** Runs `freebuff --help` with a timeout. Output is redacted and capped. */
  async probeHelp(): Promise<{ ok: boolean; help: string; error?: string }> {
    const outcome = await this.spawnFn(['--help'], { timeoutMs: this.probeTimeoutMs });
    if (outcome.spawnError !== undefined) {
      return {
        ok: false,
        help: '',
        error: `Failed to start the Freebuff CLI (${this.binary}): ${this.redact(outcome.spawnError)}`,
      };
    }
    if (outcome.timedOut) {
      return { ok: false, help: '', error: '`freebuff --help` timed out.' };
    }
    const help = this.redact(outcome.stdout);
    return { ok: outcome.exitCode === 0 && help.length > 0, help };
  }

  /**
   * Returns the argument vector for launching the CLI interactively in
   * the user's terminal: `['freebuff', '--cwd', <dir>]`. Only the
   * documented `--cwd` flag is used; no shell string is constructed.
   */
  cliArgs(cwd: string): ReadonlyArray<string> {
    const args = [this.binary];
    if (cwd.length > 0) {
      args.push('--cwd', cwd);
    }
    return args;
  }
}

// Re-export for consumers that need to build the terminal command line.
export type { ChatEvent };
