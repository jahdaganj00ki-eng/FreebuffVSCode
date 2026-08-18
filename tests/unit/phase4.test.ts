// Phase 4 unit tests — schema, session store, chat provider, redactor.
// No vscode import anywhere: everything under test is pure.

import { describe, it, expect, beforeEach } from 'vitest';

import {
  parseWebviewToHostMessage,
  parseHostToWebviewMessage,
  chatMessageSchema,
  sessionSchema,
} from '../../src/ui/webview/schema';
import type { Session } from '../../src/ui/webview/schema';
import { MemorySessionPersistence, SessionStore, SESSION_LIMITS } from '../../src/chat/SessionStore';
import { ChatProvider } from '../../src/chat/ChatProvider';
import { MockTransport } from '../../src/freebuff/MockTransport';
import { createRedactor } from '../../src/diagnostics/Redactor';
import { renderMarkdown, escapeHtml } from '../../src/ui/webview/markdown';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

describe('webview message schemas', () => {
  it('accepts valid webview→host messages', () => {
    expect(parseWebviewToHostMessage({ kind: 'ready' })).not.toBeNull();
    expect(
      parseWebviewToHostMessage({ kind: 'send-prompt', payload: { prompt: 'hi', model: 'deepseek-v4' } }),
    ).not.toBeNull();
    expect(
      parseWebviewToHostMessage({
        kind: 'send-prompt',
        payload: { prompt: 'hi', model: 'deepseek-v4', agent: 'code-reviewer' },
      }),
    ).not.toBeNull();
    expect(parseWebviewToHostMessage({ kind: 'cancel' })).not.toBeNull();
    expect(parseWebviewToHostMessage({ kind: 'new-session' })).not.toBeNull();
    expect(parseWebviewToHostMessage({ kind: 'rerun' })).not.toBeNull();
    expect(
      parseWebviewToHostMessage({ kind: 'delete-session', payload: { sessionId: 'x' } }),
    ).not.toBeNull();
  });

  it('rejects unknown kinds and malformed payloads', () => {
    expect(parseWebviewToHostMessage({ kind: 'hack-the-planet' })).toBeNull();
    expect(parseWebviewToHostMessage({ kind: 'send-prompt', payload: { prompt: '', model: 'x' } })).toBeNull();
    expect(parseWebviewToHostMessage({ kind: 'send-prompt' })).toBeNull();
    expect(parseWebviewToHostMessage(null)).toBeNull();
    expect(parseWebviewToHostMessage('string')).toBeNull();
    expect(parseWebviewToHostMessage({ kind: 'delete-session' })).toBeNull();
  });

  it('rejects oversized prompts at the schema boundary', () => {
    const huge = 'x'.repeat(100_001);
    expect(
      parseWebviewToHostMessage({ kind: 'send-prompt', payload: { prompt: huge, model: 'deepseek-v4' } }),
    ).toBeNull();
  });

  it('round-trips a valid host→webview init payload', () => {
    const payload = {
      sessions: [],
      activeSessionId: '',
      capabilities: { transportId: 'mock', verifiedModels: ['deepseek-v4'], verifiedSubagents: [] },
      theme: 'dark' as const,
      auth: { anonymous: true, byokEnabled: false },
    };
    const msg = parseHostToWebviewMessage({ kind: 'init', payload });
    expect(msg?.kind).toBe('init');
  });

  it('rejects host→webview messages with malformed sessions', () => {
    const payload = {
      sessions: [{ id: 42 }],
      activeSessionId: 'x',
      capabilities: { transportId: 'mock', verifiedModels: [], verifiedSubagents: [] },
      theme: 'dark',
      auth: { anonymous: true, byokEnabled: false },
    };
    expect(parseHostToWebviewMessage({ kind: 'init', payload })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Session store
// ---------------------------------------------------------------------------

describe('SessionStore', () => {
  let store: SessionStore;
  let persistence: MemorySessionPersistence;

  beforeEach(() => {
    persistence = new MemorySessionPersistence();
    store = new SessionStore(persistence);
  });

  it('creates a session, adds messages, derives title from the first user message', async () => {
    await store.init();
    const session = store.ensureActive();
    expect(session.id).toBeTruthy();
    store.addMessage(session.id, { role: 'user', text: 'Fix my import bug please' });
    store.addMessage(session.id, { role: 'assistant', text: 'Done.', status: 'complete' });
    expect(store.get(session.id)?.title).toBe('Fix my import bug please');
    expect(store.get(session.id)?.messages).toHaveLength(2);
    await store.persist();
    expect(await persistence.load()).not.toBeUndefined();
  });

  it('restores sessions from persistence on init', async () => {
    await store.init();
    const session = store.ensureActive();
    store.addMessage(session.id, { role: 'user', text: 'Hello' });
    await store.persist();
    const store2 = new SessionStore(persistence);
    await store2.init();
    expect(store2.list()).toHaveLength(1);
    expect(store2.get(session.id)?.messages[0]?.text).toBe('Hello');
  });

  it('recovers from corrupt persisted data', async () => {
    await (persistence as unknown as { data: unknown }).save({ bad: 'shape' });
    // MemorySessionPersistence stores `data`; save with garbage.
    await store.init();
    expect(store.list()).toHaveLength(0);
  });

  it('caps the number of sessions and messages', async () => {
    await store.init();
    for (let i = 0; i < SESSION_LIMITS.maxSessions + 5; i++) {
      store.newSession();
    }
    expect(store.list().length).toBeLessThanOrEqual(SESSION_LIMITS.maxSessions);
    const session = store.ensureActive();
    for (let i = 0; i < SESSION_LIMITS.maxMessagesPerSession + 5; i++) {
      store.addMessage(session.id, { role: 'user', text: `m${i}` });
    }
    expect(store.get(session.id)?.messages.length).toBeLessThanOrEqual(SESSION_LIMITS.maxMessagesPerSession);
  });

  it('truncates oversized message text', async () => {
    await store.init();
    const session = store.ensureActive();
    store.addMessage(session.id, { role: 'user', text: 'x'.repeat(SESSION_LIMITS.maxMessageChars + 10) });
    const text = store.get(session.id)?.messages[0]?.text ?? '';
    expect(text).toContain('…[truncated]');
  });
});

// ---------------------------------------------------------------------------
// Chat provider (mock adapter)
// ---------------------------------------------------------------------------

describe('ChatProvider', () => {
  let store: SessionStore;
  let provider: ChatProvider;

  beforeEach(() => {
    store = new SessionStore(new MemorySessionPersistence());
    provider = new ChatProvider({
      store,
      adapterProvider: () => new MockTransport(),
      redact: createRedactor(),
    });
  });

  it('streams a full mock run into the session', async () => {
    await store.init();
    await provider.sendPrompt('Refactor my auth module');
    const session = store.active();
    expect(session).toBeDefined();
    if (!session) throw new Error('unreachable');
    expect(session.taskStatus).toBe('completed');
    const roles = session.messages.map((m) => m.role);
    expect(roles).toContain('user');
    expect(roles).toContain('assistant');
    const assistant = session.messages.find((m) => m.role === 'assistant');
    expect(assistant?.status).toBe('complete');
    expect(assistant?.text.length).toBeGreaterThan(0);
  });

  it('rejects empty prompts and enforces the size limit', async () => {
    await store.init();
    await expect(provider.sendPrompt('   ')).rejects.toThrow();
    const tiny = new ChatProvider({
      store,
      adapterProvider: () => new MockTransport(),
      redact: createRedactor(),
      maxPromptBytes: 32,
    });
    await expect(tiny.sendPrompt('x'.repeat(64))).rejects.toThrow();
  });

  it('marks the session cancelled when the user cancels mid-stream', async () => {
    await store.init();
    const transport = new MockTransport({ delayMs: 30 });
    provider = new ChatProvider({ store, adapterProvider: () => transport, redact: createRedactor() });
    const run = provider.sendPrompt('Long task');
    await new Promise((resolve) => setTimeout(resolve, 5));
    await provider.cancel();
    await run;
    const session = store.active();
    expect(session?.taskStatus).toBe('cancelled');
  });

  it('reruns the last user prompt', async () => {
    await store.init();
    await provider.sendPrompt('First question');
    await provider.rerun();
    const session = store.active();
    if (!session) throw new Error('unreachable');
    const userMessages = session.messages.filter((m) => m.role === 'user');
    expect(userMessages).toHaveLength(2);
  });

  it('stores an error message when the adapter fails', async () => {
    await store.init();
    const failing = {
      id: 'failing',
      startTask: async () => {
        throw new Error('sk-ant-0123456789abcdef0123456789');
      },
      cancel: async () => {},
      status: async () => 'failed' as const,
      capabilities: () => ({
        version: 1,
        generatedAt: '',
        transportId: 'failing',
        capabilities: [],
        verifiedModels: [],
        verifiedSubagents: [],
      }),
    };
    provider = new ChatProvider({ store, adapterProvider: () => failing, redact: createRedactor() });
    await provider.sendPrompt('boom');
    const session = store.active();
    expect(session?.taskStatus).toBe('failed');
    const last = session?.messages[session.messages.length - 1];
    expect(last?.status).toBe('error');
    // The raw token must be redacted from the stored message.
    expect(last?.text).not.toContain('sk-ant-0123456789abcdef0123456789');
  });

  it('notifies subscribers on state changes', async () => {
    await store.init();
    let count = 0;
    const unsubscribe = provider.subscribe(() => {
      count++;
    });
    await provider.sendPrompt('notify me');
    expect(count).toBeGreaterThan(0);
    unsubscribe();
    const before = count;
    await provider.sendPrompt('silent now');
    expect(count).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// Redactor
// ---------------------------------------------------------------------------

describe('Redactor', () => {
  const redact = createRedactor();

  it('redacts common token shapes', () => {
    expect(redact('key=sk-ant-0123456789abcdef0123456789')).toContain('«REDACTED»');
    expect(redact('Bearer abcdefghijklmnopqrstuvwxyz123456')).toContain('«REDACTED»');
    expect(redact('github_pat_1234567890abcdefghijklmnop')).toContain('«REDACTED»');
    expect(redact('ghp_1234567890abcdefghijklmnopqrstuvwx')).toContain('«REDACTED»');
  });

  it('redacts PEM blocks', () => {
    const pem = '-----BEGIN PRIVATE KEY-----\nZm9vYmFy\n-----END PRIVATE KEY-----';
    expect(redact(pem)).toContain('«REDACTED»');
  });

  it('redacts the documented CODEBUFF_API_KEY env shape', () => {
    expect(redact('CODEBUFF_API_KEY=cb-0123456789abcdef')).toContain('«REDACTED»');
  });

  it('leaves ordinary text untouched', () => {
    const text = 'Please refactor the auth module and run the tests.';
    expect(redact(text)).toBe(text);
  });
});

// ---------------------------------------------------------------------------
// Markdown (webview client)
// ---------------------------------------------------------------------------

describe('renderMarkdown (client)', () => {
  it('escapes raw HTML', () => {
    const out = renderMarkdown('<script>alert(1)</script>');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });

  it('renders fenced code blocks safely', () => {
    const out = renderMarkdown('```ts\nconst x = 1;\n```');
    expect(out).toContain('<pre class="codeblock">');
    expect(out).toContain('data-lang="ts"');
    expect(out).toContain('const x = 1;');
  });

  it('renders inline code and bold', () => {
    const out = renderMarkdown('Use `npm ci` and **npm test**.');
    expect(out).toContain('<code>npm ci</code>');
    expect(out).toContain('<strong>npm test</strong>');
  });

  it('escapes user-supplied HTML inside code', () => {
    const out = renderMarkdown('```html\n<img src=x onerror=alert(1)>\n```');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
  });

  it('escapeHtml covers the five HTML metacharacters', () => {
    const escaped = escapeHtml(`<a href="x">&'`);
    expect(escaped).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  });
});

// ---------------------------------------------------------------------------
// Session schema guard (host-side persisted sessions)
// ---------------------------------------------------------------------------

describe('session schema guard', () => {
  it('validates a well-formed session', () => {
    const session: Session = {
      id: 's1',
      title: 'Test',
      createdAt: 1,
      updatedAt: 2,
      taskStatus: 'completed',
      messages: [
        { id: 'm1', role: 'user', text: 'hi', ts: 1 },
        { id: 'm2', role: 'assistant', text: 'yo', ts: 2, status: 'complete' },
      ],
    };
    expect(sessionSchema.safeParse(session).success).toBe(true);
  });

  it('rejects invalid roles and statuses', () => {
    expect(chatMessageSchema.safeParse({ id: 'm', role: 'admin', text: '', ts: 1 }).success).toBe(false);
    expect(
      sessionSchema.safeParse({
        id: 's',
        title: 'x',
        createdAt: 1,
        updatedAt: 2,
        taskStatus: 'exploding',
        messages: [],
      }).success,
    ).toBe(false);
  });
});
