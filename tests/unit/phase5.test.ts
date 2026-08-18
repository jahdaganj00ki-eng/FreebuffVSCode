// Phase 5 unit tests — ProcessTransport against the verified CLI surface.
// No real process is spawned; the spawn implementation is injected.

import { describe, it, expect } from 'vitest';

import { ProcessTransport, CLI_TUI_ONLY_MESSAGE } from '../../src/freebuff/ProcessTransport';
import type { SpawnOutcome } from '../../src/freebuff/ProcessTransport';
import { AdapterError } from '../../src/freebuff/types';
import { createRedactor } from '../../src/diagnostics/Redactor';
import { buildCapabilityReport } from '../../src/freebuff/CapabilityMatrix';

function fakeSpawn(responses: Record<string, SpawnOutcome>) {
  return async (args: ReadonlyArray<string>, _options: { timeoutMs: number }): Promise<SpawnOutcome> => {
    const key = args.join(' ');
    const outcome = responses[key];
    if (!outcome) {
      throw new Error(`Unexpected args: ${key}`);
    }
    return outcome;
  };
}

const VERSION_OK: SpawnOutcome = {
  stdout: '0.0.150\n',
  stderr: '',
  exitCode: 0,
  signal: null,
  timedOut: false,
};

const VERSION_MISSING: SpawnOutcome = {
  stdout: '',
  stderr: 'sh: 1: freebuff: not found',
  exitCode: 127,
  signal: null,
  timedOut: false,
  spawnError: 'spawn freebuff ENOENT',
};

const HELP_OK: SpawnOutcome = {
  stdout:
    'Usage: freebuff [options] [command]\n\nOptions:\n  -v, --version                 Print the CLI version\n  --continue [conversation-id]  Continue from a previous conversation\n  --cwd <directory>             Set the working directory\n  -h, --help                    Show this help message\n',
  stderr: '',
  exitCode: 0,
  signal: null,
  timedOut: false,
};

const TIMED_OUT: SpawnOutcome = { stdout: '', stderr: '', exitCode: null, signal: 'SIGKILL', timedOut: true };

describe('ProcessTransport — CLI surface (Phase 5)', () => {
  it('reports the adapter id and truthful capabilities', () => {
    const transport = new ProcessTransport({ spawnFn: fakeSpawn({}) });
    expect(transport.id).toBe('cli');
    const report = transport.capabilities();
    const cli = report.capabilities.find((c) => c.id === 'cli-transport');
    const streaming = report.capabilities.find((c) => c.id === 'cli-agent-streaming');
    expect(cli?.status).toBe('VERIFIED');
    expect(streaming?.status).toBe('BLOCKED');
  });

  it('probes the version successfully', async () => {
    const transport = new ProcessTransport({
      spawnFn: fakeSpawn({ '--version': VERSION_OK }),
      redact: createRedactor(),
    });
    const probe = await transport.probeVersion();
    expect(probe.ok).toBe(true);
    expect(probe.version).toBe('0.0.150');
    expect(probe.raw).toContain('0.0.150');
  });

  it('reports a clean error when the binary is missing', async () => {
    const transport = new ProcessTransport({ spawnFn: fakeSpawn({ '--version': VERSION_MISSING }) });
    const probe = await transport.probeVersion();
    expect(probe.ok).toBe(false);
    expect(probe.version).toBeNull();
    expect(probe.error).toContain('Failed to start the Freebuff CLI');
  });

  it('reports a timeout', async () => {
    const transport = new ProcessTransport({ spawnFn: fakeSpawn({ '--version': TIMED_OUT }) });
    const probe = await transport.probeVersion();
    expect(probe.ok).toBe(false);
    expect(probe.error).toMatch(/timed out/i);
  });

  it('captures --help', async () => {
    const transport = new ProcessTransport({ spawnFn: fakeSpawn({ '--help': HELP_OK }) });
    const probe = await transport.probeHelp();
    expect(probe.ok).toBe(true);
    expect(probe.help).toContain('--version');
    expect(probe.help).toContain('--cwd');
  });

  it('redacts secret-looking content from captured output', async () => {
    const leaky: SpawnOutcome = {
      stdout: '0.1.0 DEBUG sk-ant-0123456789abcdef0123456789 END\n',
      stderr: '',
      exitCode: 0,
      signal: null,
      timedOut: false,
    };
    const transport = new ProcessTransport({ spawnFn: fakeSpawn({ '--version': leaky }), redact: createRedactor() });
    const probe = await transport.probeVersion();
    expect(probe.ok).toBe(true);
    expect(probe.version).toBe('0.1.0');
    expect(probe.raw).not.toContain('sk-ant-0123456789abcdef0123456789');
    expect(probe.raw).toContain('«REDACTED»');
  });

  it('rejects startTask with a BLOCKED message (no TUI scraping)', async () => {
    const transport = new ProcessTransport({ spawnFn: fakeSpawn({}) });
    await expect(
      transport.startTask({ prompt: 'hello' }, { cwd: '/tmp', redact: (s) => s }),
    ).rejects.toMatchObject({ kind: 'forbidden' });
    await expect(
      transport.startTask({ prompt: 'hello' }, { cwd: '/tmp', redact: (s) => s }),
    ).rejects.toThrow(CLI_TUI_ONLY_MESSAGE);
  });

  it('cancel() and status() are safe no-ops', async () => {
    const transport = new ProcessTransport({ spawnFn: fakeSpawn({}) });
    await transport.cancel({ id: 'x', cancel: async () => {}, status: async () => 'idle', events: () => ({} as AsyncIterable<never>), dispose: () => {} });
    expect(await transport.status({} as never)).toBe('idle');
  });

  it('builds a safe cliArgs vector with the documented --cwd flag', () => {
    const transport = new ProcessTransport({ spawnFn: fakeSpawn({}) });
    expect(transport.cliArgs('/my/project')).toEqual(['freebuff', '--cwd', '/my/project']);
    expect(transport.cliArgs('')).toEqual(['freebuff']);
  });

  it('surfaces AdapterError as the canonical error type', () => {
    const error = new AdapterError('forbidden', CLI_TUI_ONLY_MESSAGE);
    expect(error.kind).toBe('forbidden');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('CapabilityMatrix — Phase 5 additions', () => {
  it('marks CLI version probe verified and streaming blocked', () => {
    const report = buildCapabilityReport();
    const byId = new Map(report.capabilities.map((c) => [c.id, c]));
    expect(byId.get('cli-version-probe')?.status).toBe('VERIFIED');
    expect(byId.get('cli-help')?.status).toBe('VERIFIED');
    expect(byId.get('cli-agent-streaming')?.status).toBe('BLOCKED');
    expect(byId.get('cli-terminal-launch')?.status).toBe('VERIFIED');
  });
});
