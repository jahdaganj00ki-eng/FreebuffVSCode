// `SecretStore.ts` — SecretStorage-backed store for BYOK keys.
//
// VS Code persists SecretStorage in the OS keychain / credential
// manager of the user's machine. We never log, print, or persist the
// values ourselves; the only caller that may read them is
// `AuthService.getByokKey`, consumed by the Phase-5 adapter.

import * as vscode from 'vscode';
import type { SecretStore } from './types';

export class VscodeSecretStore implements SecretStore {
  private readonly secrets: vscode.SecretStorage;

  constructor(secrets: vscode.SecretStorage) {
    this.secrets = secrets;
  }

  async get(key: string): Promise<string | undefined> {
    const value = await this.secrets.get(key);
    return value ?? undefined;
  }

  async set(key: string, value: string): Promise<void> {
    await this.secrets.store(key, value);
  }

  async delete(key: string): Promise<void> {
    await this.secrets.delete(key);
  }
}
