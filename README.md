# FreebuffVSIX

> Phase&nbsp;1 — skeleton. No Freebuff calls yet.
> Verified public surface lives in [`docs/freebuff-inventory.md`](docs/freebuff-inventory.md).

## What this extension does

`Freebuff` brings the **free** [Freebuff](https://freebuff.com/cli) coding
agent into Visual Studio Code. It is designed to be:

- **Free** — no account, no API key, no credit card.
- **Local-first** — every interaction runs against the **`freebuff`**
  CLI already installed on your machine.
- **Strict** — Phase&nbsp;1 deliberately ships **without** any
  speculative Freebuff integration. See the inventory for the
  difference between `VERIFIED`, `UNVERIFIED` and `BLOCKED`.

## Status by phase

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Source verification, inventory, threat model | ✅ complete |
| 1 | Skeleton: activation, three commands, OutputChannel | ✅ complete |
| 2 | `FreebuffAdapter` + typed models + mock transport + capability matrix | ✅ complete |
| 3 | BYOK storage (`AuthService` + `SecretStorage`) | ✅ complete |
| 4 | Chat Webview with mock streaming | ✅ complete |
| 5 | Verified `freebuff` CLI subprocess transport | ⏳ planned |
| 6 | Context selection + ignore rules | ⏳ planned |
| 7 | Diff/apply workflow | ⏳ planned |
| 8 | Tool allowlist + terminal approval | ⏳ planned |
| 9 | Tests, security docs, CI hardening | ⏳ planned |
| 10 | VSIX build + smoke test | ⏳ planned |

## Prerequisites

- Visual Studio Code **1.85.0** or newer (see `engines.vscode` in
  `package.json`).
- Node.js **18** or newer (matches the engine the Freebuff product
  page requires for the CLI).
- The **Freebuff CLI** itself — install with:

  ```bash
  npm install -g freebuff
  ```

  If the CLI is not detected, the extension shows a clear empty
  state rather than failing silently.

## What is implemented (Phase 2)

- Activation on start, **without** sign-in.
- An OutputChannel named `Freebuff` for activation status and
  release notes.
- Three commands:
  - `Freebuff: Open Chat`
  - `Freebuff: Show Status`
  - `Freebuff: Install Freebuff CLI (npm)`
- A configuration namespace (`freebuff.*`) for the model, BYOK gate
  and timeouts. Defaults are documented in the inventory.
- First-class empty-state when the CLI is missing.
- A stable internal adapter contract (`FreebuffAdapter`) decoupled
  from any SDK/CLI implementation, with a deterministic
  `MockTransport` behind it and a veracity-tagged capability matrix
  surfaced by `Freebuff: Show Status`.
- Anonymous-by-default BYOK lifecycle: `AuthService` + VS Code
  `SecretStorage`. `Freebuff: Configure BYOK Key` manages optional
  keys for Claude Code, ChatGPT (GPT-5.4), or the Codebuff SDK path.
  Keys are stored only in SecretStorage and never logged; status
  output is booleans only.

## What is *not* implemented (and why)

| Capability | Reason |
| --- | --- |
| Real chat streaming | Phase 4 — requires verified CLI wire format |
| `@codebuff/sdk` integration | Phase 5 — gated behind a BYOK opt-in and user-supplied `CODEBUFF_API_KEY` |
| Tool execution | Phase 8 — tool allowlist not finalized |
| Diff/apply workflow | Phase 7 — paths not finalized |
| Ad-supported prompts transparency | Linked from Privacy Policy; surfaced in UI in Phase 4 |

See `docs/freebuff-inventory.md` for the `VERIFIED` / `UNVERIFIED`
/ `BLOCKED` status of every capability.

## Privacy

Prompts and messages you send to the Freebuff agent may be
analyzed by Freebuff systems and service providers to personalize
advertising (see
[freebuff.com/privacy-policy](https://freebuff.com/privacy-policy)).
This extension **does not** augment that surface — every prompt
goes through your locally running `freebuff` process.

## Workspace Trust

Phase&nbsp;1 does not write files or run terminal commands outside
of VS Code's own scope. Edit-producing tools will be gated on
`vscode.workspace.isTrusted` starting in Phase&nbsp;7, per
[`docs/security.md`](docs/security.md).

## Development

```bash
npm ci        # reproducible install
npm run lint
npm run typecheck
npm run test
npm run build
npm run package
```

The shipping artifact is `dist/extension.js`, plus a `dist/webview/`
directory created in Phase&nbsp;4.

## Licensing

This project is **MIT**-licensed. See [`LICENSE`](LICENSE).
Third-party credits are listed in [`NOTICE`](NOTICE).
The Freebuff CLI (`freebuff`) is MIT; the optional `@codebuff/sdk`
is Apache-2.0. We never bundle the proprietary Freebuff Desktop
binary into this VSIX — see the inventory, section “`@codebuff/sdk`
(optionaler Pro-Pfad)” / “Freebuff Desktop Downloads”.
