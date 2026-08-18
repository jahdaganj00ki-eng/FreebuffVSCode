# Changelog — FreebuffVSIX

All notable changes to this project are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/) and the
project follows [Semantic Versioning](https://semver.org/).

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
