// Phase 2 unit tests — adapter contract and mock transport.
// No network, no CLI, no SDK.

import { describe, it, expect } from 'vitest';

import { MockTransport, type ChatEventScriptEntry } from '../../src/freebuff/MockTransport';
import { buildCapabilityReport, isFreeModel, isVerifiedSubagent } from '../../src/freebuff/CapabilityMatrix';
import { AdapterError } from '../../src/freebuff/types';
import type { AdapterContext, ChatEvent, TaskHandle } from '../../src/freebuff/types';

const NOOP_REDACT = (s: string): string => s;

function makeCtx(overrides: Partial<AdapterContext> = {}): AdapterContext {
  return { cwd: '/workspace', redact: NOOP_REDACT, ...overrides };
}

async function drain(handle: TaskHandle): Promise<ChatEvent[]> {
  const events: ChatEvent[] = [];
  for await (const event of handle.events()) {
    events.push(event);
  }
  return events;
}

describe('FreebuffAdapter contract (MockTransport)', () => {
  it('has id "mock" and a truthful capability report', () => {
    const transport = new MockTransport();
    expect(transport.id).toBe('mock');
    const report = transport.capabilities();
    expect(report.version).toBeGreaterThanOrEqual(1);
    expect(report.generatedAt.length).toBeGreaterThan(0);
    // Only free-tier models are advertised.
    expect(report.verifiedModels).toContain('deepseek-v4');
    expect(report.verifiedModels).not.toContain('gpt-5.4');
    // Verified subagents only.
    expect(report.verifiedSubagents).toContain('code-reviewer');
  });

  it('rejects an empty prompt with an AdapterError', async () => {
    const transport = new MockTransport();
    await expect(transport.startTask({ prompt: '   ' }, makeCtx())).rejects.toBeInstanceOf(AdapterError);
  });

  it('produces a deterministic stream: agent_start … agent_finish, ascending seq', async () => {
    const transport = new MockTransport();
    const handle = await transport.startTask({ prompt: 'Hello' }, makeCtx());
    const events = await drain(handle);
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events[0]?.type).toBe('agent_start');
    expect(events[events.length - 1]?.type).toBe('agent_finish');
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (!ev) throw new Error('unreachable');
      expect(ev.seq).toBe(i);
    }
    expect(await handle.status()).toBe('completed');
  });

  it('redacts text through the context redactor', async () => {
    const script: ReadonlyArray<ChatEventScriptEntry> = [
      { type: 'text', text: 'Found token sk-1234567890abcdefghijklmnop' },
      { type: 'agent_finish' },
    ];
    const transport = new MockTransport({ script });
    const handle = await transport.startTask(
      { prompt: 'x' },
      makeCtx({ redact: (s) => s.replace(/sk-[A-Za-z0-9]{20,}/g, '«REDACTED»') }),
    );
    const events = await drain(handle);
    expect(events.some((e) => e.text?.includes('«REDACTED»'))).toBe(true);
    expect(events.some((e) => e.text?.includes('sk-1234567890abcdefghijklmnop'))).toBe(false);
  });

  it('cancellation is idempotent and yields a cancelled terminal event', async () => {
    const script: ReadonlyArray<ChatEventScriptEntry> = [
      { type: 'text', text: 'first' },
      { type: 'text', text: 'second' },
      { type: 'agent_finish' },
    ];
    const transport = new MockTransport({ delayMs: 25, script });
    const handle = await transport.startTask({ prompt: 'x' }, makeCtx());
    await handle.cancel();
    await handle.cancel(); // idempotent
    const events = await drain(handle);
    expect(events[events.length - 1]?.type).toBe('cancelled');
    expect(await handle.status()).toBe('cancelled');
  });

  it('respects AbortSignal cancellation mid-stream', async () => {
    const controller = new AbortController();
    const script: ReadonlyArray<ChatEventScriptEntry> = [
      { type: 'text', text: 'first' },
      { type: 'text', text: 'second' },
      { type: 'agent_finish' },
    ];
    const transport = new MockTransport({ delayMs: 25, script });
    const handle = await transport.startTask({ prompt: 'x' }, makeCtx({ signal: controller.signal }));
    const iterator = handle.events()[Symbol.asyncIterator]();
    await iterator.next(); // consume first event
    controller.abort();
    const rest: ChatEvent[] = [];
    for await (const event of iterator) {
      rest.push(event);
    }
    expect(rest[rest.length - 1]?.type).toBe('cancelled');
    expect(await handle.status()).toBe('cancelled');
  });

  it('fails with an error event when the deadline elapses', async () => {
    const script: ReadonlyArray<ChatEventScriptEntry> = [
      { type: 'text', text: 'slow' },
      { type: 'text', text: 'slower' },
      { type: 'agent_finish' },
    ];
    const transport = new MockTransport({ delayMs: 40, script });
    const handle = await transport.startTask({ prompt: 'x' }, makeCtx({ timeoutMs: 10 }));
    const events = await drain(handle);
    const terminal = events[events.length - 1];
    expect(terminal?.type).toBe('error');
    expect(terminal?.text).toMatch(/timed out/i);
    expect(await handle.status()).toBe('failed');
  });

  it('exposes cancel()/status() through the adapter interface', async () => {
    const transport = new MockTransport();
    const handle = await transport.startTask({ prompt: 'x' }, makeCtx());
    expect(await transport.status(handle)).toBe('running');
    await transport.cancel(handle);
    expect(await transport.status(handle)).toBe('cancelled');
  });
});

describe('CapabilityMatrix', () => {
  it('treats only verified free models as free', () => {
    expect(isFreeModel('deepseek-v4')).toBe(true);
    expect(isFreeModel('MiMo-2.5-Pro')).toBe(true);
    expect(isFreeModel('gpt-5.4')).toBe(false);
  });

  it('recognizes verified subagents only', () => {
    expect(isVerifiedSubagent('code-reviewer')).toBe(true);
    expect(isVerifiedSubagent('browser-use')).toBe(true);
    expect(isVerifiedSubagent('not-a-real-subagent')).toBe(false);
  });

  it('never advertises BLOCKED capabilities as usable', () => {
    const report = buildCapabilityReport();
    for (const cap of report.capabilities) {
      if (cap.id === 'tool-allowlist' || cap.id === 'file-writes' || cap.id === 'terminal') {
        expect(cap.status).toBe('BLOCKED');
      }
    }
  });
});
