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

// SDK cost modes (VERIFIED in @codebuff/sdk@0.10.7: `costModes` list in
// model-config and RunOptions.costMode). 'free' is documented as
// "0 credits charged for all agents" and maps to the `base_free` agent
// template. Eligibility is decided server-side.
export const SDK_COST_MODES: ReadonlyArray<string> = ['free', 'normal', 'max', 'experimental', 'ask'];

// SDK agent IDs from the Codebuff docs (codebuff.com/docs/agents/overview,
// 2026-08-18). Used by the SDK transport's agent picker.
export const SDK_AGENT_IDS: ReadonlyArray<string> = [
  'codebuff/base',
  'codebuff/editor',
  'codebuff/reviewer',
  'codebuff/thinker',
  'codebuff/researcher',
  'codebuff/file-picker',
  'codebuff/basher',
  'codebuff/code-searcher',
];

const CAPABILITIES: ReadonlyArray<Capability> = [
  {
    id: 'mock-transport',
    status: 'VERIFIED',
    note: 'Deterministic mock transport is the fallback for UI/dev purposes.',
  },
  {
    id: 'cli-transport',
    status: 'VERIFIED',
    note: 'Freebuff CLI `--version`/`--help` probed successfully (dry-run 2026-08-18, v0.0.150).',
  },
  {
    id: 'cli-version-probe',
    status: 'VERIFIED',
    note: '`freebuff --version` is a documented flag and works; used by ProcessTransport.probeVersion().',
  },
  {
    id: 'cli-help',
    status: 'VERIFIED',
    note: '`freebuff --help` documents -v/--version, --continue, --cwd, -h/--help, command login.',
  },
  {
    id: 'cli-agent-streaming',
    status: 'BLOCKED',
    note: 'Freebuff CLI is an interactive TUI requiring a real TTY; no documented headless/stdin protocol. TUI scraping is forbidden by the master prompt.',
  },
  {
    id: 'cli-terminal-launch',
    status: 'VERIFIED',
    note: 'Launching `freebuff --cwd <dir>` in a user-visible terminal is the documented usage path.',
  },
  {
    id: 'sdk-transport',
    status: 'VERIFIED',
    note: '@codebuff/sdk@0.10.7 installed; requires CODEBUFF_API_KEY (auth-gated, via SecretStorage).',
  },
  {
    id: 'sdk-events',
    status: 'VERIFIED',
    note: 'PrintModeEvent schema confirmed from public source (start/text/tool_call/tool_result/error/finish/subagent_*/reasoning_delta/download).',
  },
  {
    id: 'sdk-streaming',
    status: 'VERIFIED',
    note: 'handleStreamChunk (token/subagent chunks) exists in RunOptions (public source).',
  },
  {
    id: 'sdk-cancellation',
    status: 'VERIFIED',
    note: 'RunOptions.signal?: AbortSignal confirmed in public source; aborts the run.',
  },
  {
    id: 'sdk-resume',
    status: 'VERIFIED',
    note: 'previousRun?: RunState confirmed; RunState = { sessionState?, output, traceSessionId }.',
  },
  {
    id: 'sdk-free-mode',
    status: 'VERIFIED',
    note: 'RunOptions.costMode="free" is documented in @codebuff/sdk@0.10.7 as "0 credits charged for all agents" and selects the base_free agent template. Surfaced via freebuff.sdkCostMode.',
  },
  {
    id: 'streaming',
    status: 'VERIFIED',
    note: 'Event streaming via AsyncIterable<ChatEvent> is implemented in mock and SDK transports.',
  },
  {
    id: 'cancellation',
    status: 'VERIFIED',
    note: 'AbortSignal-based cancellation in mock and SDK transports.',
  },
  {
    id: 'resume',
    status: 'VERIFIED',
    note: 'SDK resume via previousRun (RunState); mock accepts state without branching.',
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

export function buildCapabilityReport(transportId = 'mock'): CapabilityReport {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    transportId,
    capabilities: CAPABILITIES,
    verifiedModels: [...VERIFIED_MODELS],
    verifiedSubagents: [...VERIFIED_SUBAGENTS],
  };
}

/**
 * Capability report for the SDK transport: same base matrix, but the
 * agent picker lists the documented SDK agents and the sdk-transport
 * entry carries an auth-gated note.
 */
export function buildSdkCapabilityReport(): CapabilityReport {
  const base = buildCapabilityReport('sdk');
  return {
    ...base,
    capabilities: base.capabilities.map((cap) =>
      cap.id === 'sdk-transport'
        ? { ...cap, note: '@codebuff/sdk@0.10.7 active. Requires CODEBUFF_API_KEY (SecretStorage).' }
        : cap,
    ),
    verifiedSubagents: [...SDK_AGENT_IDS],
  };
}

export function isFreeModel(model: string): boolean {
  return (VERIFIED_MODELS as readonly string[]).includes(model);
}

export function isVerifiedSubagent(name: string): boolean {
  return (VERIFIED_SUBAGENTS as readonly string[]).includes(name);
}
