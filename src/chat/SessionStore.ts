// `SessionStore.ts` — in-memory session model with injectable
// persistence. Pure TypeScript (no vscode import) so it is fully
// unit-testable.
//
// Persistence contract: `save()` receives the full session list as a
// JSON-safe value. Callers must ensure messages are already redacted
// (the ChatProvider redacts before calling addMessage).

import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import type { ChatMessage, Session } from '../ui/webview/schema';
import { sessionSchema, taskStatusSchema } from '../ui/webview/schema';

export interface SessionPersistence {
  load(): Promise<unknown>;
  save(data: unknown): Promise<void>;
}

export class MemorySessionPersistence implements SessionPersistence {
  private data: unknown;

  async load(): Promise<unknown> {
    return this.data;
  }

  async save(data: unknown): Promise<void> {
    this.data = data;
  }
}

export const SESSION_LIMITS = {
  maxSessions: 20,
  maxMessagesPerSession: 500,
  maxMessageChars: 100_000,
} as const;

export class SessionStore {
  private sessions: Session[] = [];
  private activeSessionId: string | null = null;

  constructor(private readonly persistence: SessionPersistence) {}

  async init(): Promise<void> {
    const raw = await this.persistence.load();
    if (raw === undefined || raw === null) {
      return;
    }
    const parsed = z.array(sessionSchema).safeParse(raw);
    if (!parsed.success) {
      // Corrupt or stale storage — start fresh rather than crash.
      this.sessions = [];
      this.activeSessionId = null;
      return;
    }
    this.sessions = parsed.data.slice(-SESSION_LIMITS.maxSessions);
    this.activeSessionId = this.sessions[this.sessions.length - 1]?.id ?? null;
  }

  list(): ReadonlyArray<Session> {
    return this.sessions;
  }

  activeId(): string | null {
    return this.activeSessionId;
  }

  get(id: string): Session | undefined {
    return this.sessions.find((session) => session.id === id);
  }

  active(): Session | undefined {
    return this.activeSessionId !== null ? this.get(this.activeSessionId) : undefined;
  }

  newSession(title = 'New session'): Session {
    const now = Date.now();
    const session: Session = {
      id: randomUUID(),
      title,
      createdAt: now,
      updatedAt: now,
      taskStatus: 'idle',
      messages: [],
    };
    this.sessions.push(session);
    if (this.sessions.length > SESSION_LIMITS.maxSessions) {
      this.sessions.shift();
    }
    this.activeSessionId = session.id;
    void this.persist();
    return session;
  }

  /** Returns the active session, creating one if none exists. */
  ensureActive(): Session {
    return this.active() ?? this.newSession();
  }

  deleteSession(id: string): void {
    const index = this.sessions.findIndex((session) => session.id === id);
    if (index === -1) {
      return;
    }
    this.sessions.splice(index, 1);
    if (this.activeSessionId === id) {
      const last = this.sessions[this.sessions.length - 1];
      this.activeSessionId = last?.id ?? null;
    }
    void this.persist();
  }

  addMessage(sessionId: string, message: Omit<ChatMessage, 'id' | 'ts'>): ChatMessage {
    const session = this.requireSession(sessionId);
    const msg: ChatMessage = { ...message, id: randomUUID(), ts: Date.now() };
    session.messages.push(msg);
    this.trimMessages(session);
    session.updatedAt = Date.now();
    this.maybeSetTitle(session);
    void this.persist();
    return msg;
  }

  updateMessage(sessionId: string, messageId: string, patch: Partial<Omit<ChatMessage, 'id'>>): void {
    const session = this.requireSession(sessionId);
    const message = session.messages.find((m) => m.id === messageId);
    if (!message) {
      return;
    }
    // Drop undefined fields so `status`/`text` are never set to undefined.
    const clean: Partial<ChatMessage> = {};
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) {
        (clean as Record<string, unknown>)[key] = value;
      }
    }
    Object.assign(message, clean);
    session.updatedAt = Date.now();
    void this.persist();
  }

  setTaskStatus(sessionId: string, status: Session['taskStatus']): void {
    const session = this.requireSession(sessionId);
    session.taskStatus = status;
    session.updatedAt = Date.now();
    void this.persist();
  }

  async persist(): Promise<void> {
    await this.persistence.save(this.sessions);
  }

  private requireSession(sessionId: string): Session {
    const session = this.get(sessionId);
    if (!session) {
      throw new Error(`SessionStore: unknown session ${sessionId}`);
    }
    return session;
  }

  private trimMessages(session: Session): void {
    if (session.messages.length > SESSION_LIMITS.maxMessagesPerSession) {
      session.messages.splice(0, session.messages.length - SESSION_LIMITS.maxMessagesPerSession);
    }
    for (const message of session.messages) {
      if (message.text.length > SESSION_LIMITS.maxMessageChars) {
        message.text = `${message.text.slice(0, SESSION_LIMITS.maxMessageChars)}…[truncated]`;
      }
    }
  }

  private maybeSetTitle(session: Session): void {
    if (session.title !== 'New session') {
      return;
    }
    const firstUser = session.messages.find((m) => m.role === 'user');
    if (firstUser) {
      const title = firstUser.text.trim().replace(/\s+/g, ' ').slice(0, 60);
      session.title = title.length > 0 ? title : 'New session';
    }
  }
}

// Re-export the status type so consumers don't import schema.ts directly
// for status values.
export type { TaskStatus } from '../ui/webview/schema';
export { taskStatusSchema };
