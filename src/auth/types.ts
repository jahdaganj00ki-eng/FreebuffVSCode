// `types.ts` (auth) — BYOK provider catalog and storage contract.
//
// Freebuff is anonymous by default. "BYOK" (bring-your-own-key) is
// the only secret-bearing path and it is gated behind
// `freebuff.allowBringYourOwnKey` (default false).
//
// Provider names come from the Freebuff launch post
// (freebuff.com/blog/freebuff-launch, 2026-08-18) and the
// @codebuff/sdk documentation (codebuff.com/docs/advanced/sdk).

export type ByokProvider = 'claude' | 'chatgpt' | 'codebuff';

export interface ByokProviderInfo {
  readonly id: ByokProvider;
  readonly label: string;
  readonly description: string;
  /** Whether BYOK for this provider is documented in official sources. */
  readonly verified: boolean;
}

export const BYOK_PROVIDERS: ReadonlyArray<ByokProviderInfo> = [
  {
    id: 'claude',
    label: 'Claude Code (BYOK)',
    description: 'Bring your own Anthropic / Claude Code access. Key is stored in VS Code SecretStorage.',
    verified: true,
  },
  {
    id: 'chatgpt',
    label: 'ChatGPT — GPT-5.4 deep thinking (BYOK)',
    description: 'Connect a ChatGPT subscription for the deep-thinking subagent. Key is stored in VS Code SecretStorage.',
    verified: true,
  },
  {
    id: 'codebuff',
    label: 'Codebuff SDK (CODEBUFF_API_KEY)',
    description: 'Optional @codebuff/sdk path. Requires a key from codebuff.com/api-keys. Stored in VS Code SecretStorage.',
    verified: true,
  },
];

export const BYOK_PROVIDER_IDS: ReadonlyArray<ByokProvider> = BYOK_PROVIDERS.map((p) => p.id);

export function isByokProvider(value: string): value is ByokProvider {
  return (BYOK_PROVIDER_IDS as readonly string[]).includes(value);
}

/** SecretStorage key namespace. Values live only in SecretStorage. */
export function secretKeyForProvider(provider: ByokProvider): string {
  return `freebuff.byok.${provider}`;
}

/**
 * Minimal storage contract. The VS Code implementation lives in
 * SecretStore.ts; tests use an in-memory implementation.
 */
export interface SecretStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface ByokStatus {
  readonly provider: ByokProvider;
  /** Boolean only. Raw values never leave SecretStorage/validation. */
  readonly configured: boolean;
}

export interface AuthStatus {
  readonly anonymous: boolean;
  readonly byokEnabled: boolean;
  readonly providers: ReadonlyArray<ByokStatus>;
}
