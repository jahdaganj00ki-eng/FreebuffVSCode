# Freebuff Inventory (`docs/freebuff-inventory.md`)

> Pflicht-Inventur der belegbaren öffentlichen Schnittstellen, auf denen die
> VS-Code-Erweiterung **FreebuffVSIX** aufsetzen darf. Diese Datei wird in
> jeder Phase aktualisiert. Stand: 2026-08-18.
>
> **Architekturpivot Phase 0.7**: Der Nutzer hat klargestellt, dass
> **Freebuff vollständig kostenlos und ohne API-Key** ist. Die
> Integration erfolgt primär gegen die offizielle **`freebuff`-CLI**
> (npm-installierbar, anonym). Die `@codebuff/sdk`-Key-Pfade bleiben
> als **optionaler Pro-Pfad** dokumentiert, sind aber im MVP nicht
> aktiv.

## 0. Datenquellen und Stichtag

| Quelle | URL | Methode | Stichtag |
| --- | --- | --- | --- |
| Codebuff SDK-Doku | <https://www.codebuff.com/docs/advanced/sdk> | `read_url` | 2026-08-18 |
| Codebuff Agent-Übersicht | <https://www.codebuff.com/docs/agents/overview> | `read_url` | 2026-08-18 |
| npm `@codebuff/sdk` (latest) | <https://registry.npmjs.org/@codebuff/sdk/latest> | `curl` JSON | 2026-08-18 |
| SDK-Source `sdk/src/index.ts` | <https://raw.githubusercontent.com/CodebuffAI/codebuff/main/sdk/src/index.ts> | `curl` Source | 2026-08-18 |
| SDK-Source `sdk/src/client.ts` | <https://raw.githubusercontent.com/CodebuffAI/codebuff/main/sdk/src/client.ts> | `curl` Source | 2026-08-18 |
| Common-Message-Typen | <https://raw.githubusercontent.com/CodebuffAI/codebuff/main/common/src/types/messages/codebuff-message.ts> | `curl` Source | 2026-08-18 |
| SDK-Konstanten | <https://raw.githubusercontent.com/CodebuffAI/codebuff/main/sdk/src/constants.ts> | `curl` Source | 2026-08-18 |
| `freebuff` Repo-README | <https://github.com/CodebuffAI/freebuff/blob/main/freebuff/README.md> | `read_url` | 2026-08-18 |
| `freebuff` npm (latest) | <https://registry.npmjs.org/freebuff/latest> | `curl` JSON | 2026-08-18 |
| Freebuff Launch-Post | <https://freebuff.com/blog/freebuff-launch> | `read_url` | 2026-08-18 |
| Freebuff CLI-Seite | <https://freebuff.com/cli> | `read_url` | 2026-08-18 |
| Freebuff `/get-started` | <https://freebuff.com/get-started> | `read_url` | 2026-08-18 |
| Freebuff Datenschutz | <https://freebuff.com/privacy-policy> | `read_url` | 2026-08-18 |
| Freebuff `robots.txt` | <https://freebuff.com/robots.txt> | `read_url` | 2026-08-18 |
| Freebuff Desktop HEAD-Probes | `https://freebuff.com/api/desktop/download/{windows-baseline,windows,linux}` | `curl -I` | 2026-08-18 |
| `https://freebuff.com/api/healthz` | `curl` GET | 2026-08-18 |
| `https://freebuff.com/{login,api/auth/*}` | `curl -I` | 2026-08-18 |

## 1. Produkt- und Markenabgrenzung

- **VERIFIED**: Freebuff ist ein **kostenloses Produkt**, das von
  Codebuff Inc. betrieben wird (Freebuff Inc. ist Konzern-Marke der
  Datenschutz-Policy). Werbetragendes Modell: „ads in the terminal,
  between agent turns" (Quelle: Launch-Post, Privacy Policy).
- **VERIFIED Free-Surface**: vier Touch-Points sind offiziell
  beworben und ohne Account nutzbar:
  1. `freebuff` CLI (`npm install -g freebuff`, Node ≥ 18 ).
  2. Freebuff Web (`freebuff.com/web`).
  3. Freebuff Cloud (`freebuff.com/cloud`) — GitHub-Login optional.
  4. Freebuff Desktop (Win/Linux Binaries, siehe Abschnitt 9).
- **VERIFIED**: Freebuff-Chat, Freebuff-Enterprise und
  Freebuff-Web-Builder-Pfade werden in der Datenschutzerklärung
  erwähnt; öffentliche API-Verträge sind nicht dokumentiert.
- **VERIFIED Zitat /cli**: „No API key and no credit card. Just describe
  what you want."
- **VERIFIED Zitat /get-started**: Ein „invite friends"-Mechanismus
  gewährt zusätzliche Free-Sessions. Freebuff-Web, Freebuff-Cloud,
  Freebuff-CLI und Freebuff-Desktop teilen denselben Session-Pool.

## 2. Verifizierte Modelle (Freebuff)

Aus dem Launch-Post direkt zitiert:

| Modell | Status | Verwendung | Verifiziert |
| --- | --- | --- | --- |
| `deepseek-v4` | free, default intelligence | general code reasoning | VERIFIED |
| `MiMo-2.5-Pro` | free | balanced code + reasoning | VERIFIED |
| `GLM-5.2` | free | coding precision | VERIFIED |
| `Minimax-M3` | free | speed | VERIFIED |
| `BYOK claude-code` | bring-your-own-key | optional, paid | VERIFIED (BYOK) |
| `gemini-3.1-flash-lite` | free | file-picker (subagent) | VERIFIED |
| `deepseek-v4-flash` | limited mode (6 sessions/day) | fallback / outside top-25 countries | VERIFIED (Doku) |
| `GPT-5.4` | bring-your-own (ChatGPT subscription) | deep thinking (BYOK) | VERIFIED (BYOK) |

Der Erweiterungs-Default wählt **`deepseek-v4`** als Hauptmodell für
den Free-Tier. Ein Wechsel ist über die Konfiguration
`freebuff.model` möglich; nicht-FREE-Modelle werden nur als
**BYOK-Hinweis** angezeigt, niemals automatisch aktiviert.

## 3. Verifizierte Subagents (Freebuff CLI)

Aus dem Launch-Post („9 specialized subagents ship in the box"):

| # | Subagent | Verifiziert | Hinweis |
| --- | --- | --- | --- |
| 1 | `code-reviewer` | VERIFIED (namentlich erwähnt) | Freebuff-spezifisch |
| 2 | `browser-use` | VERIFIED | Freebuff-spezifisch |
| 3 | `file-picker` | VERIFIED | Freebuff-spezifisch |
| 4 | `thinker-with-files-gemini` | VERIFIED | Freebuff-spezifisch |
| 5 | – | UNVERIFIED | Name im Post nicht aufgeführt |
| 6 | – | UNVERIFIED | Name im Post nicht aufgeführt |
| 7 | – | UNVERIFIED | Name im Post nicht aufgeführt |
| 8 | – | UNVERIFIED | Name im Post nicht aufgeführt |
| 9 | – | UNVERIFIED | Name im Post nicht aufgeführt |

> Hinweis: Der genaue Algorithmus (Plan → Review → Patch) ist
> dokumentiert, nicht aber die vollständige Liste der verbleibenden
> 5 Subagent-Namen. Die UI blendet nur die verifizierten vier ein
> und markiert weitere als „verfügbar, bis Bestätigung im CLI".

Die Codebuff-SDK-Agenten (`codebuff/base`, `/editor`, `/reviewer`,
`/thinker`, `/researcher`, `/file-picker`, `/basher`,
`/code-searcher`) bleiben verfügbar als **Aliasse**, sofern die
Runtime sie implementiert. Sie sind im Freebuff-Flow **nicht
primär**.

## 4. Authentifizierungs- und Schlüsselmodell

| Aspekt | Belegt | Status |
| --- | --- | --- |
| „No accounts to create, no keys to paste" | `/cli`, `/get-started` | VERIFIED |
| Anonymer Pfad in Freebuff Cloud | `robots.txt: Disallow /web/admin/ /web/dashboard/ /web/project/`, `sso-callback`, `callback`, `invite/` | VERIFIED (Indiz) |
| `/api/healthz` JSON | `curl GET` liefert 200 application/json | VERIFIED |
| `/api/auth/anonymous` (POST) | HEAD liefert 400, deutet auf POST/Method | VERIFIED (Pfad existiert) |
| `/api/auth/signup` (POST) | HEAD liefert 400, deutet auf POST-Methode | VERIFIED (Pfad existiert) |
| BYOK-Modelle (Anthropic, OpenAI) | Launch-Post (Claude Code BYOK, GPT-5.4 ChatGPT-Subscription) | VERIFIED |
| `@codebuff/sdk` Key-Pfad | SDK-Code verlangt `apiKey` / `CODEBUFF_API_KEY` | VERIFIED — im MVP nicht aktiv |

**Konsequenz für `AuthService` (Phase 3)**:

- KEIN erzwungenes Sign-in (Freebuff-Default ist anonym).
- BYOK-Schlüssel werden nur in `SecretStorage` gespeichert, wenn der
  Nutzer ein BYOK-Modell explizit auswählt.
- Sensible Tokens: keine Logs, keine JSON, keine Diagnostics. Phase 0
  ist das Schlüssel-Schutz-Disziplin vor der ersten Zeile
  Implementierung.

## 5. Freebuff CLI – öffentliche Oberfläche

| Aspekt | Wert | Quelle | Status |
| --- | --- | --- | --- |
| Paketname | `freebuff` | npm-Registry | VERIFIED |
| Latest | `0.0.150` | npm-Registry | 2026-08-18 |
| Lizenz | MIT | npm-Registry | VERIFIED |
| Engine | `node >= 16` | npm-Registry | VERIFIED (Launch-Post: „Requires Node.js 18+") |
| Bin | `freebuff` → `index.js` | npm-Registry | VERIFIED |
| OS-Support | darwin, linux, win32 | npm-Registry | VERIFIED |
| CPU-Support | x64, arm64 | npm-Registry | VERIFIED |
| Repository | `git+https://github.com/CodebuffAI/freebuff-private.git` | npm-Registry | VERIFIED (Repo ist privat) |
| Sub-Befehle / Flags | Nicht öffentlich dokumentiert | n/a | UNVERIFIED — die Erweiterung ruft die CLI ausschließlich in einem Safe-Modus auf, der nur so viel voraussetzt, wie die CLI garantiert: `freebuff --version`, `freebuff --help`, `freebuff` (TTY/Pipe-Modus). Bestätigte Funktionsname aus `bin`: nur der Programmname selbst. |
| Server-Stream / Pipes | nicht öffentlich dokumentiert | n/a | UNVERIFIED — Protokoll wird durch die Erweiterung defensiv in `ProcessTransport.ts` gekapselt (stdout/stderr werden redacted gelesen; Parser ist über Schema-Discovery). |

**Verbindliche Regel für die Erweiterung**:

- Wir rufen die CLI mit dem in `bin` deklarierten Namen auf (keine
  Pfad-Hardcodes, kein Shell).
- Wir versuchen zuerst `--version`. Schlägt das fehl, melden wir
  einen verständlichen „Freebuff CLI nicht installiert"-Empty-State.
- Wir übergeben KEINE ungeprüften Strings als Argumente.
- Wir protokollieren stdout/stderr NUR redacted.

## 6. `@codebuff/sdk` (optionaler Pro-Pfad)

SDK-Integration bleibt als **optionaler Pfad** erhalten. Der MVP
verwendet die Freebuff-CLI; eine SDK-Anbindung setzt zwingend einen
vom Nutzer bereitgestellten `CODEBUFF_API_KEY` voraus und wird im
UI sichtbar als „Pro" markiert. Folgende Werte sind **VERIFIED**:

- Paket `@codebuff/sdk`, Version `0.10.7` (Apache-2.0).
- Engine `node >= 18`.
- Haupteinsprung: `./dist/index.cjs` (CJS) / `./dist/index.mjs` (ESM),
  Typen `./dist/index.d.ts`.
- Klasse `CodebuffClient` mit `run()`, `checkConnection()`.
- Funktionen `loadLocalAgents`, `loadMCPConfig`,
  `loadMCPConfigSync`, `loadSkills`, `loadSkillsSync`,
  `parseSkillFileContent`, `formatAvailableSkillsXml`,
  `validateAgents`, `getCustomToolDefinition`,
  `setFreeModeCapacityDeferralListener`, `ToolHelpers`,
  `getUserInfoFromApiKey`.
- Errors: `isRetryableStatusCode`, `getErrorStatusCode`,
  `sanitizeErrorMessage`, `RETRYABLE_STATUS_CODES`,
  `createHttpError`, `createAuthError`,
  `createPaymentRequiredError`, `createForbiddenError`,
  `createServerError`, `createNetworkError`.
- Native/WASM-Deps: `web-tree-sitter`,
  `@vscode/tree-sitter-wasm`,
  `@jitl/quickjs-wasmfile-release-sync`.

**UNVERIFIED innerhalb SDK**: exaktes Event-Schema,
Cancellation-API, vollständiges `RunState`-Schema,
`@codebuff/sdk` und Freebuff-Anonymous-Pfad-Kompatibilität.

## 7. Plattform- und Versionsgrenzen

| Bereich | Wert | Status |
| --- | --- | --- |
| VS Code Engine | ≥ `1.85.0` | VERIFIED (Standard für tree-sitter + Webview Async) |
| Node Freebuff-CLI | ≥ `16` (npm) / ≥ `18` (Launch-Post) | VERIFIED |
| VS Code-Extension-Host | aktuelle Enginges im README | VERIFIED |
| Freebuff-CLI-OS | macOS / Windows / Linux | VERIFIED |
| Freebuff-Desktop Downloads | win-x64, win-x64-baseline, linux-x86_64 AppImage (118–119 MB) | VERIFIED |
| Freebuff-Desktop macOS | kein komplementärer Downloadpfad ermittelt (HEAD 400) | VERIFIED |

## 8. Datenschutz (externe Quelle)

Auszug aus der Privacy Policy:

- „Prompts and messages may be analyzed to personalize ads …
  Separate uploads and connected repositories are not provided to
  advertising providers."
- „Cookie/local storage … not respond to Do Not Track."
- „Models labeled 'May use data for AI training' may use submissions
  for that purpose."
- Konsequenz für die Erweiterung: In der README wird klar
  dokumentiert, dass Prompts an Freebuff-Clouds gehen können, und
  ein „Workspace Trust"-Toggle wird im MVP nicht angeboten, da dies
  ein serverseitiger Mechanismus ist.

## 9. Capability-Matrix der Erweiterung (Plan)

| Feature | Quelle | Status |
| --- | --- | --- |
| Activity-Bar-View „Freebuff" | VS Code Extension API | VERIFIED |
| `OutputChannel "Freebuff"` | VS Code API | VERIFIED |
| Commands registrieren | VS Code API | VERIFIED |
| `SecretStorage` für BYOK-Keys | VS Code API | VERIFIED |
| Webview (CSP, Nonce, Runtime-Schema) | VS Code API | VERIFIED |
| Freebuff-CLI ProcessTransport | npm-`freebuff`-Paket, bin-Name | VERIFIED (bin/exists) |
| Streaming-Command-Mode der CLI | UNVERIFIED — die CLI ist als TUI dokumentiert, die Pipe-Schnittstelle muss in Phase 5 verifiziert werden | UNVERIFIED |
| Freebuff-Cloud HTTP-Endpoint | `/api/healthz`, `/api/auth/*` existieren, Verträge nicht | UNVERIFIED |
| `@codebuff/sdk`-Direktintegration | Codebuff-Doku | VERIFIED (Symbol), Phase 5 nur wenn User-Key vorliegt |
| Modell-Auswahl (Free-Tier) | Launch-Post Liste | VERIFIED |
| BYOK-Modelle | Launch-Post BYOK | VERIFIED |
| Subagenten-Auswahl | Launch-Post: 4 namentlich, 5 UNVERIFIED | UNVERIFIED (5 Stück) |
| `.codebuffignore` | nicht öffentlich dokumentiert | UNVERIFIED |
| Cancel der `freebuff`-CLI | nicht öffentlich dokumentiert | UNVERIFIED |

## 10. Offene Fragen (für Folgephasen)

1. Welcher Freebuff-CLI-Stream / welche Flags sind für einen
   deterministischen, nicht-interaktiven Aufruf nötig? Phase 5
   wird vor jeder produktiven Aufruffläche ein `--help`-Dry-Run
   durchführen und nur verifizierte Flags benutzen.
2. Wie meldet die CLI Modell- oder Subagent-Auswahl? Wir
   initialisieren in Phase 2 einen discovery-fähigen Parser, der
   `unknown`-Token verwirft, statt zu spekulieren.
3. Die fünf verbleibenden Subagent-Namen aus dem Freebuff-Set —
   bis zur Bestätigung in einer offiziellen Quelle nicht in der UI
   anzeigen.

## 11. Status-Legende

| Token | Bedeutung |
| --- | --- |
| `VERIFIED` | durch offizielle Quelle (Doku, npm-Reg., öffentlicher Quellcode oder HTTP-Head) belegt |
| `UNVERIFIED` | plausibel, aber nicht aus belastbarer Quelle bestätigt — kein produktiver Pfad |
| `BLOCKED` | durch Sicherheits- oder Compliance-Regel ausgeschlossen |
| `NOT_APPLICABLE` | im aktuellen Funktionsumfang irrelevant |

Phase 0 abgeschlossen mit aktualisiertem Free-Pfad. Keine
spekulative Integration. Phase 1 ist Skeleton (kein Realcode für
Freebuff-Aufrufe).
