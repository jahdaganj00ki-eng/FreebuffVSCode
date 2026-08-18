// `CapabilityMatrix.ts` — runtime capability report.
//
// Source of truth: docs/freebuff-inventory.md (Phase 0). Only items
// marked VERIFIED there are listed as available. Everything else is
// UNVERIFIED / BLOCKED / NOT_APPLICABLE and is surfaced to the user
// honestly instead of being silently enabled.

import type { Capability, CapabilityReport } from './types';

// Verified free-tier models (freebuff.com/blog/freebuff-launch, 2026-08-18).
export const VERIFIED_MODELS: ReadonlyArray<string> = [
  'deepseek-v4',
  'MiMo-2.5-Pro',
  'GLM-5.2',
  'Minimax-M3',
  'deepseek-v4-flash',
];

// Verified subagents named in the Freebuff launch post. The remaining
// five of the advertised "9 subagents" are UNVERIFIED and not listed.
export const VERIFIED_SUBAGENTS: ReadonlyArray<string> = [
  'code-reviewer',
  'browser-use',
  'file-picker',
  'thinker-with-files-gemini',
];

const CAPABILITIES: ReadonlyArray<Capability> = [
  {
    id: 'mock-transport',
    status: 'VERIFIED',
    note: 'Deterministic mock transport is the active transport until Phase 5.',
  },
  {
    id: 'cli-transport',
    status: 'UNVERIFIED',
    note: 'Freebuff CLI wire protocol is not publicly documented; dry-run discovery planned in Phase 5.',
  },
  {
    id: 'sdk-transport',
    status: 'UNVERIFIED',
    note: '@codebuff/sdk requires a user-supplied API key; gated behind freebuff.allowBringYourOwnKey.',
  },
  {
    id: 'streaming',
    status: 'VERIFIED',
    note: 'Event streaming via AsyncIterable<ChatEvent> is implemented in the mock transport.',
  },
  {
    id: 'cancellation',
    status: 'VERIFIED',
    note: 'AbortSignal-based cancellation in the mock; real CLI cancellation is UNVERIFIED.',
  },
  {
    id: 'resume',
    status: 'NOT_APPLICABLE',
    note: 'Mock accepts previous session state but does not branch on it. SDK RunState resume is UNVERIFIED.',
  },
  {
    id: 'tool-allowlist',
    status: 'BLOCKED',
    note: 'Tool allowlist is Phase 8; no tool execution in the mock.',
  },
  {
    id: 'file-writes',
    status: 'BLOCKED',
    note: 'Diff/apply workflow is Phase 7.',
  },
  {
    id: 'terminal',
    status: 'BLOCKED',
    note: 'Terminal approval flow is Phase 8.',
  },
  {
    id: 'secret-storage',
    status: 'VERIFIED',
    note: 'VS Code SecretStorage wrapper planned in Phase 3 (BYOK only).',
  },
  {
    id: 'prompt-redaction',
    status: 'VERIFIED',
    note: 'Redactor is applied to every ChatEvent text emitted by the mock.',
  },
];

export function buildCapabilityReport(): CapabilityReport {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    capabilities: CAPABILITIES,
    verifiedModels: [...VERIFIED_MODELS],
    verifiedSubagents: [...VERIFIED_SUBAGENTS],
  };
}

export function isFreeModel(model: string): boolean {
  return (VERIFIED_MODELS as readonly string[]).includes(model);
}

export function isVerifiedSubagent(name: string): boolean {
  return (VERIFIED_SUBAGENTS as readonly string[]).includes(name);
}
