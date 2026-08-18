// `ReleaseNotes.ts` — a hand-maintained, compile-time-tracked list
// of what the Freebuff extension has shipped. Rendered into the
// OutputChannel on activation. Kept as a const so it shows up in
// source-review without any I/O.

import { EXTENSION_VERSION } from '../version';

export const RELEASE_NOTES: ReadonlyArray<string> = [
  `FreebuffVSIX v${EXTENSION_VERSION}`,
  '- Skeleton: Activation, OutputChannel and three commands wired up.',
  '- Free-tier, anonymous: no login, no API key.',
  '- Optional BYOK models (Claude Code, ChatGPT) are gated behind SecretStorage.',
  '- Phase 1 is a deliberate skeleton — no Freebuff calls yet (see Phase 2).',
];
