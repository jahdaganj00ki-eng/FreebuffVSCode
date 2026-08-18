// Phase 3 unit tests — AuthService + SecretStorage semantics.
// No vscode import: the store is injected.

import { describe, it, expect, beforeEach } from 'vitest';

import {
  AuthService,
  ByokKeyError,
  validateByokKey,
} from '../../src/auth/AuthService';
import type { SecretStore, ByokProvider } from '../../src/auth/types';
import { BYOK_PROVIDERS, secretKeyForProvider } from '../../src/auth/types';

class MemorySecretStore implements SecretStore {
  private readonly data = new Map<string, string>();

  async get(key: string): Promise<string | undefined> {
    return this.data.get(key);
  }

  async set(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }

  dumpKeys(): string[] {
    return [...this.data.keys()];
  }
}

function makeService(store: MemorySecretStore, allowByok = false) {
  return new AuthService({ store, allowBringYourOwnKey: allowByok });
}

describe('validateByokKey', () => {
  it('trims surrounding whitespace', () => {
    expect(validateByokKey('  my-key-123  ')).toBe('my-key-123');
  });

  it('rejects empty and whitespace-only values', () => {
    expect(() => validateByokKey('')).toThrow(ByokKeyError);
    expect(() => validateByokKey('   ')).toThrow(ByokKeyError);
  });

  it('rejects embedded whitespace / newlines', () => {
    expect(() => validateByokKey('a b\ncdefghijkl')).toThrow(ByokKeyError);
  });

  it('rejects implausibly short keys', () => {
    expect(() => validateByokKey('short')).toThrow(ByokKeyError);
  });

  it('accepts a plausible key', () => {
    expect(validateByokKey('sk-ant-0123456789abcdef')).toBe('sk-ant-0123456789abcdef');
  });
});

describe('AuthService', () => {
  let store: MemorySecretStore;
  let service: AuthService;

  beforeEach(() => {
    store = new MemorySecretStore();
    service = makeService(store);
  });

  it('is anonymous by default and reports it', async () => {
    await service.init();
    const status = await service.status();
    expect(status.anonymous).toBe(true);
    expect(status.byokEnabled).toBe(false);
    for (const provider of status.providers) {
      expect(provider.configured).toBe(false);
    }
  });

  it('stores and reports a key as configured — boolean only', async () => {
    await service.init();
    await service.setByokKey('claude', 'sk-ant-0123456789abcdef0123456789');
    const status = await service.status();
    const claude = status.providers.find((p) => p.provider === 'claude');
    expect(claude?.configured).toBe(true);
    // The raw value must never appear in the status shape.
    expect(JSON.stringify(status)).not.toContain('sk-ant');
    // The store holds it under the namespaced key.
    expect(store.dumpKeys()).toEqual([secretKeyForProvider('claude')]);
  });

  it('keeps anonymous=true while BYOK is disabled even with a stored key', async () => {
    await service.init();
    await service.setByokKey('claude', 'sk-ant-0123456789abcdef0123456789');
    expect((await service.status()).anonymous).toBe(true);
  });

  it('flips to non-anonymous once BYOK is enabled with a key', async () => {
    await service.init();
    await service.setByokKey('claude', 'sk-ant-0123456789abcdef0123456789');
    service.setAllowByok(true);
    const status = await service.status();
    expect(status.anonymous).toBe(false);
    expect(status.byokEnabled).toBe(true);
  });

  it('does not return a raw key when BYOK is disabled', async () => {
    await service.init();
    await service.setByokKey('chatgpt', 'chatgpt-secret-key-12345');
    expect(await service.getByokKey('chatgpt')).toBeUndefined();
  });

  it('returns a raw key only to the adapter when BYOK is enabled', async () => {
    await service.init();
    await service.setByokKey('chatgpt', 'chatgpt-secret-key-12345');
    service.setAllowByok(true);
    expect(await service.getByokKey('chatgpt')).toBe('chatgpt-secret-key-12345');
    expect(await service.getByokKey('codebuff')).toBeUndefined();
  });

  it('clears a key and reports configured=false', async () => {
    await service.init();
    await service.setByokKey('codebuff', 'cb-0123456789abcdef0123456789');
    await service.clearByokKey('codebuff');
    const status = await service.status();
    const codebuff = status.providers.find((p) => p.provider === 'codebuff');
    expect(codebuff?.configured).toBe(false);
    expect(store.dumpKeys()).toHaveLength(0);
  });

  it('init() picks up pre-existing keys', async () => {
    await store.set(secretKeyForProvider('claude'), 'sk-ant-0123456789abcdef0123456789');
    service = makeService(store, true);
    await service.init();
    expect(await service.hasByokKey('claude')).toBe(true);
    expect((await service.status()).anonymous).toBe(false);
  });

  it('emits change notifications with booleans only', async () => {
    const seen: Array<{ anonymous: boolean; byokEnabled: boolean }> = [];
    service = new AuthService({
      store,
      allowBringYourOwnKey: false,
      onDidChange: (status) => {
        seen.push({ anonymous: status.anonymous, byokEnabled: status.byokEnabled });
      },
    });
    await service.init();
    await service.setByokKey('claude', 'sk-ant-0123456789abcdef0123456789');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(seen.length).toBeGreaterThan(0);
    for (const entry of seen) {
      expect(typeof entry.anonymous).toBe('boolean');
    }
  });

  it('exposes the full verified provider catalog', () => {
    const ids = BYOK_PROVIDERS.map((p) => p.id);
    expect(ids).toEqual(['claude', 'chatgpt', 'codebuff']);
    for (const provider of BYOK_PROVIDERS) {
      expect(provider.verified).toBe(true);
    }
  });

  it('guards against unknown providers in the secret key namespace', () => {
    const unknown = 'github' as ByokProvider;
    expect(secretKeyForProvider(unknown)).toBe('freebuff.byok.github');
  });
});
