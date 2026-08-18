// Phase 6 tests — SDK transport (FreebuffClient) against a mocked
// @codebuff/sdk module. The SDK types are imported as type-only
// (erased at compile time), so the real SDK module never loads here.

import { describe, it, expect, beforeEach } from 'vitest';
import type { RunOptions, CodebuffClientOptions, RunState, PrintModeEvent } from '@codebuff/sdk';

import { FreebuffClient } from '../../src/freebuff/FreebuffClient';
import type { SdkClientLike, SdkModuleLike } from '../../src/freebuff/FreebuffClient';
import type { AdapterContext, ChatEvent, TaskHandle } from '../../src/freebuff/types';
import { createRedactor } from '../../src/diagnostics/Redactor';

function makeCtx(overrides: Partial<AdapterContext> = {}): AdapterContext {
  return { cwd: '/workspace', redact: createRedactor(), ...overrides };
}

interface RunRecord {
  options: RunOptions & CodebuffClientOptions;
  resolve: (value: RunState) => void;
}

function createFakeSdk(): { sdk: SdkModuleLike; runs: RunRecord[] } {
  const runs: RunRecord[] = [];
  class FakeCodebuffClient implements SdkClientLike {
    constructor(_options: CodebuffClientOptions) {}
    async run(options: RunOptions & CodebuffClientOptions): Promise<RunState> {
      return new Promise<RunState>((resolve) => {
        runs.push({ options, resolve });
      });
    }
  }
  return { sdk: { CodebuffClient: FakeCodebuffClient }, runs };
}

async function drain(handle: TaskHandle): Promise<ChatEvent[]> {
  const events: ChatEvent[] = [];
  for await (const event of handle.events()) {
    events.push(event);
  }
  return events;
}

describe('FreebuffClient (SDK transport)', () => {
  let fake: ReturnType<typeof createFakeSdk>;
  let client: FreebuffClient;

  beforeEach(() => {
    fake = createFakeSdk();
    client = new FreebuffClient({
      getApiKey: async () => 'cb-test-key-0123456789',
      sdk: fake.sdk,
      redact: createRedactor(),
    });
  });

  it('has id "sdk" and reports SDK agents + transport id', () => {
    expect(client.id).toBe('sdk');
    const report = client.capabilities();
    expect(report.transportId).toBe('sdk');
    expect(report.verifiedSubagents).toContain('codebuff/base');
    expect(report.capabilities.find((c) => c.id === 'sdk-cancellation')?.status).toBe('VERIFIED');
  });

  it('throws an auth error when no API key is available', async () => {
    const noKey = new FreebuffClient({ getApiKey: async () => undefined });
    await expect(noKey.startTask({ prompt: 'hi' }, makeCtx())).rejects.toMatchObject({ kind: 'auth' });
  });

  it('passes agent, prompt, projectFiles, maxAgentSteps and signal into client.run', async () => {
    const controller = new AbortController();
    const handle = await client.startTask(
      { prompt: 'Refactor', agent: 'codebuff/reviewer', projectFiles: { 'src/a.ts': 'x' }, maxAgentSteps: 7 },
      makeCtx({ signal: controller.signal }),
    );
    const run = fake.runs[0];
    expect(run).toBeDefined();
    expect(run?.options.agent).toBe('codebuff/reviewer');
    expect(run?.options.prompt).toBe('Refactor');
    expect(run?.options.maxAgentSteps).toBe(7);
    expect(run?.options.projectFiles).toEqual({ 'src/a.ts': 'x' });
    // The SDK receives the handle's internal AbortSignal (wired to ctx.signal).
    expect(run?.options.signal).toBeDefined();
    expect(run?.options.signal?.aborted).toBe(false);
    await handle.cancel();
    expect(run?.options.signal?.aborted).toBe(true);
    handle.dispose();
  });

  it('defaults the agent to codebuff/base@latest', async () => {
    await client.startTask({ prompt: 'hi' }, makeCtx());
    expect(fake.runs[0]?.options.agent).toBe('codebuff/base@latest');
  });

  it('passes the configured cost mode into client.run without an agent default change', async () => {
    const freeClient = new FreebuffClient({
      getApiKey: async () => 'cb-test-key-0123456789',
      sdk: fake.sdk,
      redact: createRedactor(),
      costMode: 'normal',
    });
    const handle = await freeClient.startTask({ prompt: 'hi' }, makeCtx());
    expect(fake.runs[0]?.options.costMode).toBe('normal');
    expect(fake.runs[0]?.options.agent).toBe('codebuff/base@latest');
    handle.dispose();
  });

  it('maps costMode "free" to the base_free agent and passes costMode through', async () => {
    const freeClient = new FreebuffClient({
      getApiKey: async () => 'cb-test-key-0123456789',
      sdk: fake.sdk,
      redact: createRedactor(),
      costMode: 'free',
    });
    const handle = await freeClient.startTask({ prompt: 'hi' }, makeCtx());
    const run = fake.runs[0];
    expect(run?.options.costMode).toBe('free');
    // Free mode selects the documented base_free template (0 credits).
    expect(run?.options.agent).toBe('codebuff/base_free@latest');
    handle.dispose();
  });

  it('per-task costMode overrides the configured default; explicit agent wins over free mapping', async () => {
    const freeClient = new FreebuffClient({
      getApiKey: async () => 'cb-test-key-0123456789',
      sdk: fake.sdk,
      redact: createRedactor(),
      costMode: 'normal',
    });
    const handle = await freeClient.startTask(
      { prompt: 'hi', costMode: 'free', agent: 'codebuff/reviewer' },
      makeCtx(),
    );
    const run = fake.runs[0];
    expect(run?.options.costMode).toBe('free');
    expect(run?.options.agent).toBe('codebuff/reviewer');
    handle.dispose();
  });

  it('rejects an unsupported cost mode in the constructor', () => {
    expect(
      () =>
        new FreebuffClient({
          getApiKey: async () => 'cb-test-key-0123456789',
          sdk: fake.sdk,
          redact: createRedactor(),
          costMode: 'turbo',
        }),
    ).toThrow(/Unsupported SDK cost mode/);
  });

  it('omits costMode from run options when neither input nor config set it', async () => {
    await client.startTask({ prompt: 'hi' }, makeCtx());
    expect(fake.runs[0]?.options.costMode).toBeUndefined();
  });

  it('maps PrintModeEvents into canonical ChatEvents', async () => {
    const handle = await client.startTask({ prompt: 'hi' }, makeCtx());
    const run = fake.runs[0];
    run?.options.handleEvent?.({ type: 'start', messageHistoryLength: 0 });
    run?.options.handleEvent?.({ type: 'text', text: 'Hello from SDK' });
    run?.options.handleEvent?.({ type: 'tool_call', toolCallId: 't1', toolName: 'read_files', input: { filePaths: ['a'] } });
    run?.options.handleEvent?.({ type: 'tool_result', toolCallId: 't1', toolName: 'read_files', output: [] });
    run?.resolve({ output: { type: 'lastMessage', value: [] } });

    const events = await drain(handle);
    const types = events.map((e) => e.type);
    expect(types[0]).toBe('agent_start');
    expect(types).toContain('text');
    expect(types).toContain('tool_call');
    expect(types).toContain('tool_result');
    expect(types[types.length - 1]).toBe('agent_finish');
    const text = events.find((e) => e.type === 'text');
    expect(text?.text).toContain('Hello from SDK');
    expect(await handle.status()).toBe('completed');
  });

  it('streams handleStreamChunk text into events', async () => {
    const handle = await client.startTask({ prompt: 'hi' }, makeCtx());
    const run = fake.runs[0];
    run?.options.handleStreamChunk?.('part1');
    run?.options.handleStreamChunk?.('part2');
    run?.resolve({ output: { type: 'allMessages', value: [] } });
    const events = await drain(handle);
    const texts = events.filter((e) => e.type === 'text').map((e) => e.text);
    expect(texts).toEqual(['part1', 'part2']);
  });

  it('cancellation aborts the SDK run signal and reports cancelled', async () => {
    const handle = await client.startTask({ prompt: 'hi' }, makeCtx());
    const run = fake.runs[0];
    await handle.cancel();
    expect(run?.options.signal?.aborted).toBe(true);
    run?.resolve({ output: { type: 'error', message: 'Run cancelled by user.' } });
    const events = await drain(handle);
    expect(events[events.length - 1]?.type).toBe('cancelled');
    expect(await handle.status()).toBe('cancelled');
  });

  it('reports failed when the SDK resolves with an error output', async () => {
    const handle = await client.startTask({ prompt: 'hi' }, makeCtx());
    fake.runs[0]?.resolve({ output: { type: 'error', message: 'boom' } });
    const events = await drain(handle);
    expect(events[events.length - 1]?.type).toBe('error');
    expect(events[events.length - 1]?.text).toContain('boom');
    expect(await handle.status()).toBe('failed');
  });

  it('resume() passes previousRun through and rejects malformed state', async () => {
    const handle = await client.resume(
      { prompt: 'continue' },
      makeCtx(),
      { output: { type: 'lastMessage', value: [] } },
    );
    expect(fake.runs[0]?.options.previousRun).toBeDefined();
    handle.dispose();

    await expect(client.resume({ prompt: 'x' }, makeCtx(), 'not-a-run-state')).rejects.toMatchObject({
      kind: 'internal',
    });
  });

  it('redacts secrets inside streamed and event text', async () => {
    const handle = await client.startTask({ prompt: 'hi' }, makeCtx());
    const run = fake.runs[0];
    run?.options.handleStreamChunk?.('sk-ant-0123456789abcdef0123456789');
    run?.options.handleEvent?.({ type: 'text', text: 'token ghp_1234567890abcdefghijklmnopqrstuvwx leaked' } as PrintModeEvent);
    run?.resolve({ output: { type: 'lastMessage', value: [] } });
    const events = await drain(handle);
    const allText = events.map((e) => e.text ?? '').join(' ');
    expect(allText).not.toContain('sk-ant-0123456789abcdef0123456789');
    expect(allText).not.toContain('ghp_1234567890abcdefghijklmnopqrstuvwx');
    expect(allText).toContain('«REDACTED»');
  });
});
