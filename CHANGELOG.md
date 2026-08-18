# Changelog — FreebuffVSIX

All notable changes to this project are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/) and the
project follows [Semantic Versioning](https://semver.org/).

## [0.5.0] — Phase 5 — 2026-08-18

### Verified (dry-run, 2026-08-18)

- `freebuff --version` → `0.0.150` (isolated HOME; launcher downloads
  the Bun binary into `~/.config/manicode/`).
- `freebuff --help` → `-v/--version`, `--continue [id]`, `--cwd <dir>`,
  `-h/--help`, command `login`.
- The CLI is an **interactive TUI** (alternate screen, folder picker,
  requires a real TTY — per launcher source: "the TUI owns the
  terminal"). **No documented headless/stdin protocol exists.**

### Implemented

- `src/freebuff/ProcessTransport.ts` — verified CLI surface only:
  `probeVersion()`, `probeHelp()`, `cliArgs(cwd)`; `startTask()`
  rejects with `AdapterError('forbidden')` (BLOCKED: no TUI
  scraping). Arguments as `string[]`, timeout + SIGKILL, byte-capped
  and redacted capture, injectable spawn for tests.
- `Freebuff: Open CLI in Terminal` — shows command + cwd, requires
  modal confirmation, then opens the TUI in the integrated terminal.
- `Freebuff: Check CLI Version` — runs the verified `--version` probe
  and reports to the OutputChannel + notification.
- Capability matrix extended: `cli-transport`/`cli-version-probe`/
  `cli-help`/`cli-terminal-launch` → VERIFIED;
  `cli-agent-streaming` → BLOCKED.
- Inventory + architecture updated with the Phase-5 findings.

### Security

- No auto-install, no hidden binary dependency, no shell strings,
  redacted probe output (test-asserted).

## [0.4.0] — Phase 4 — 2026-08-18

### Added

- `src/ui/webview/schema.ts` — shared Zod runtime contract for
  host↔webview messages (`init`, `session-updated`, `error`;
  `ready`, `send-prompt`, `cancel`, `new-session`, `delete-session`,
  `rerun`) plus session/message payload schemas.
- `src/chat/SessionStore.ts` — pure in-memory session store with
  injectable persistence; caps on sessions/messages/text;
  title auto-derivation; corrupt-storage recovery.
- `src/chat/VscodeSessionPersistence.ts` — workspaceState-backed
  persistence (JSON-safe, redacted messages only).
- `src/chat/ChatProvider.ts` — vscode-free orchestration: prompt
  size limits, streaming via `AsyncIterable<ChatEvent>`, cancel,
  rerun, new/delete session, change notifications.
- `src/diagnostics/Redactor.ts` — deterministic secret redaction
  (tokens, headers, PEM blocks) applied to every stored/emitted
  string.
- `src/ui/webview/markdown.ts` — dependency-free, HTML-escaped
  Markdown subset (code fences, inline code, headings, lists,
  bold/italic).
- `src/ui/webview/main.ts` + `styles.css` — chat client: streaming
  cursor, copy buttons, theme classes (light/dark/high-contrast),
  ARIA labels, Enter-to-send / Shift+Enter-newline, narrow-sidebar
  responsive layout.
- `src/ui/ChatWebviewProvider.ts` — host wiring: strict CSP with
  nonce, local resource roots, schema-validated message routing,
  theme sync, provider subscriptions.
- esbuild now emits `dist/webview/main.js` + copies styles.css.
- `Freebuff: Open Chat` opens the webview (mock streaming behind
  the Phase-2 adapter).
- Tests: schema round-trips, session store caps/persistence, chat
  provider streaming/cancel/rerun/error, redactor patterns, markdown
  escaping. (Suite grows to ~60 tests.)

### Security

- CSP `default-src 'none'`, nonce-based script/style, no inline
  handlers, no external resources.
- Webview messages validated by Zod before dispatch; invalid
  messages are dropped with a warning.
- Markdown renderer escapes HTML first; user/tool text rendered
  verbatim with `textContent`.

## [0.3.0] — Phase 3 — 2026-08-18

### Added

- `src/auth/types.ts` — verified BYOK provider catalog (`claude`,
  `chatgpt`, `codebuff`) from the Freebuff launch post and
  `@codebuff/sdk` docs; `SecretStore` contract; booleans-only
  `AuthStatus`.
- `src/auth/SecretStore.ts` — `VscodeSecretStore` backed by
  `vscode.SecretStorage`. Values never logged, printed or copied.
- `src/auth/AuthService.ts` — anonymous-by-default lifecycle:
  `init`, `setAllowByok`, `isAnonymous`, `hasByokKey`, `getByokKey`
  (adapter-only), `setByokKey`, `clearByokKey`, `status`, change
  notifications. Minimal provider-agnostic `validateByokKey`
  (empty/whitespace/short rejection; no invented key formats).
- `Freebuff: Configure BYOK Key` command (QuickPick provider →
  password input → SecretStorage).
- `tests/unit/phase3.test.ts` — 13 tests: in-memory store,
  validation, anonymous default, booleans-only status, config
  toggle, notifications, init-from-storage.

### Security

- Raw keys are never logged, printed, or included in any status or
  diagnostic output; tests assert the status shape contains no key
  material.

## [0.2.0] — Phase 2 — 2026-08-18

### Added

- `src/freebuff/types.ts` — canonical internal adapter types
  (`ChatEvent`, `TaskHandle`, `StartTaskInput`, `AdapterContext`,
  `AdapterError`, `CapabilityReport`) with **no** SDK/CLI coupling.
- `src/freebuff/FreebuffAdapter.ts` — stable internal interface
  (`startTask`, `cancel`, `status`, `capabilities`, optional
  `resume`).
- `src/freebuff/MockTransport.ts` — deterministic, fully testable
  transport: scripted events, ascending `seq`, AbortSignal
  cancellation, timeout, redaction of every emitted string.
- `src/freebuff/CapabilityMatrix.ts` — veracity-tagged runtime
  capability report; only verified free models (`deepseek-v4`,
  `MiMo-2.5-Pro`, `GLM-5.2`, `Minimax-M3`, `deepseek-v4-flash`) and
  verified subagents (`code-reviewer`, `browser-use`, `file-picker`,
  `thinker-with-files-gemini`) are advertised.
- `tests/unit/phase2.test.ts` — 11 unit tests (adapter contract,
  determinism, cancellation, timeout, redaction, capability
  matrix).
- `extension.ts`: status command now prints the active transport and
  the capability matrix.

### Security

- Mock transport emits only redacted strings; unit tests assert that
  token patterns never leave the stream.

## [0.1.0] — Phase 1 — 2026-08-18

### Added

- Skeleton extension definition (`package.json`) with strict VS Code
  `engines.vscode ^1.85.0` and `engines.node >=18`.
- Strict TypeScript build (`tsconfig.json`, `tsconfig.build.json`)
  with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `useUnknownInCatchVariables`.
- esbuild bundler pipeline (`esbuild.config.mjs`) producing
  `dist/extension.js` (CJS, target `node18`) with `vscode` external.
- Vitest unit-test setup (`vitest.config.ts`) covering `CliDiscovery`,
  `version` constants, and release-notes shape.
- ESLint + Prettier baselines (`.eslintrc.cjs`, `.prettierrc`).
- Activation, three commands, OutputChannel `Freebuff` and a global
  empty-state notification.
- Configuration namespace `freebuff.*` (model, BYOK gate, timeout,
  workspace trust).
- Threat model (`docs/security.md`), architecture
  (`docs/architecture.md`) and Freebuff public-surface inventory
  (`docs/freebuff-inventory.md`).

### Not yet in this release (deferred per master prompt)

- Real Freebuff CLI subprocess transport — Phase&nbsp;5
- BYOK secret lifecycle — Phase&nbsp;3
- Chat Webview — Phase&nbsp;4
- Diff/apply workflow — Phase&nbsp;7
- Tool allowlist — Phase&nbsp;8
- GitHub Actions CI workflow — Phase&nbsp;9

### Security

- No secrets, tokens, or credentials are read, logged, persisted,
  or committed anywhere in this release.
- All configured defaults are conservative. BYOK is **off** by
  default and requires explicit user action.
