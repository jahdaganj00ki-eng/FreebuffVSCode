// `VscodeSessionPersistence.ts` — persistence for SessionStore backed
// by VS Code `workspaceState` (per-workspace, non-secret storage).
// Sessions are already redacted before they reach the store, so no
// secret material is written here.

import * as vscode from 'vscode';
import type { SessionPersistence } from './SessionStore';

const STORAGE_KEY = 'freebuff.sessions.v1';

export class VscodeSessionPersistence implements SessionPersistence {
  private readonly state: vscode.Memento;

  constructor(state: vscode.Memento) {
    this.state = state;
  }

  async load(): Promise<unknown> {
    return this.state.get<unknown>(STORAGE_KEY);
  }

  async save(data: unknown): Promise<void> {
    await this.state.update(STORAGE_KEY, data);
  }
}
