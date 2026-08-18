// `AuthService.ts` — BYOK lifecycle.
//
// Freebuff is anonymous by default; this service only exists to gate
// and manage optional bring-your-own-key providers. Raw key material
// flows from SecretStorage straight to the Phase-5 adapter and is
// never printed, logged, or exposed via `status()`.

import type { AuthStatus, ByokProvider, ByokStatus, SecretStore } from './types';
import { BYOK_PROVIDERS, secretKeyForProvider } from './types';

export interface AuthServiceOptions {
  readonly store: SecretStore;
  readonly allowBringYourOwnKey: boolean;
  readonly onDidChange?: (status: AuthStatus) => void;
}

export class ByokKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ByokKeyError';
  }
}

/**
 * Minimal, provider-agnostic validation. We deliberately do NOT guess
 * provider-specific key formats — only reject clearly-invalid input.
 */
export function validateByokKey(raw: string): string {
  const key = raw.trim();
  if (key.length === 0) {
    throw new ByokKeyError('Key must not be empty.');
  }
  if (/\s/.test(key)) {
    throw new ByokKeyError('Key must not contain whitespace or newlines.');
  }
  if (key.length < 10) {
    throw new ByokKeyError('Key looks too short to be valid.');
  }
  return key;
}

export class AuthService {
  private readonly store: SecretStore;
  private allowByok: boolean;
  private readonly onDidChange: ((status: AuthStatus) => void) | undefined;
  private readonly configuredCache = new Map<ByokProvider, boolean>();

  constructor(options: AuthServiceOptions) {
    this.store = options.store;
    this.allowByok = options.allowBringYourOwnKey;
    this.onDidChange = options.onDidChange;
  }

  /** Load the configured-state cache from SecretStorage. Call once at activation. */
  async init(): Promise<void> {
    for (const provider of BYOK_PROVIDERS) {
      const raw = await this.store.get(secretKeyForProvider(provider.id));
      this.configuredCache.set(provider.id, raw !== undefined && raw.length > 0);
    }
  }

  get allowByokEnabled(): boolean {
    return this.allowByok;
  }

  setAllowByok(enabled: boolean): void {
    if (this.allowByok === enabled) {
      return;
    }
    this.allowByok = enabled;
    this.emit();
  }

  /**
   * Freebuff default. Anonymous stays true until BYOK is enabled AND
   * at least one key is configured.
   */
  isAnonymous(): boolean {
    if (!this.allowByok) {
      return true;
    }
    for (const provider of BYOK_PROVIDERS) {
      if (this.configuredCache.get(provider.id) === true) {
        return false;
      }
    }
    return true;
  }

  /** Boolean view only. Never exposes the raw value. */
  async hasByokKey(provider: ByokProvider): Promise<boolean> {
    return this.configuredCache.get(provider) === true;
  }

  /**
   * Raw key read — the ONLY consumer is the Phase-5 adapter when it
   * needs to authenticate an SDK/BYOK call. Never log this value.
   */
  async getByokKey(provider: ByokProvider): Promise<string | undefined> {
    if (!this.allowByok) {
      return undefined;
    }
    const raw = await this.store.get(secretKeyForProvider(provider));
    return raw !== undefined && raw.length > 0 ? raw : undefined;
  }

  async setByokKey(provider: ByokProvider, raw: string): Promise<void> {
    const key = validateByokKey(raw);
    await this.store.set(secretKeyForProvider(provider), key);
    this.configuredCache.set(provider, true);
    this.emit();
  }

  async clearByokKey(provider: ByokProvider): Promise<void> {
    await this.store.delete(secretKeyForProvider(provider));
    this.configuredCache.set(provider, false);
    this.emit();
  }

  async status(): Promise<AuthStatus> {
    const providers: ByokStatus[] = BYOK_PROVIDERS.map((provider) => ({
      provider: provider.id,
      configured: this.configuredCache.get(provider.id) === true,
    }));
    return {
      anonymous: this.isAnonymous(),
      byokEnabled: this.allowByok,
      providers,
    };
  }

  private emit(): void {
    if (!this.onDidChange) {
      return;
    }
    void this.status().then((status) => this.onDidChange?.(status));
  }
}
