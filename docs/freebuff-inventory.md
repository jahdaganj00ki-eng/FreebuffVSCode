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
| `deepseek-v4` (Wire-ID `deepseek/deepseek-v4-pro`) | free, default intelligence | general code reasoning | VERIFIED |
| `MiMo-2.5-Pro` | free | balanced code + reasoning | VERIFIED |
| `GLM-5.2` | free | coding precision | VERIFIED |
| `Minimax-M3` (Wire-ID `minimax/minimax-m3`) | free | speed | VERIFIED |
| `BYOK claude-code` | bring-your-own-key | optional, paid | VERIFIED (BYOK) |
| `gemini-3.1-flash-lite` | free | file-picker (subagent) | VERIFIED |
| `deepseek-v4-flash` (Wire-ID `deepseek/deepseek-v4-flash`) | limited mode (6 sessions/day) | fallback / outside top-25 countries | VERIFIED (Doku) |
| `GPT-5.4` | bring-your-own (ChatGPT subscription) | deep thinking (BYOK) | VERIFIED (BYOK) |

**VERIFIED Wire-Modell-IDs** (aus `common/src/constants/freebuff-model-ids.ts`, 2026-08-18):
`deepseek/deepseek-v4-flash`, `deepseek/deepseek-v4-pro`, `minimax/minimax-m3`
— Kommentar im Quellcode: „Matches the model id passed to the
chat-completions endpoint“. Diese IDs gehören zum **Free-Tier-Wire-Protokoll
der CLI** (Endpunkt nicht öffentlich dokumentiert); sie sind NICHT
als SDK-`run()`-Option nutzbar (Modell wählt der Agent).

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

## 5. Freebuff CLI – öffentliche Oberfläche (Phase 5: Dry-Run belegt)

| Aspekt | Wert | Quelle | Status |
| --- | --- | --- | --- |
| Paketname | `freebuff` | npm-Registry | VERIFIED |
| Latest | `0.0.150` | npm-Registry | 2026-08-18 |
| Lizenz | MIT | npm-Registry | VERIFIED |
| Engine | `node >= 16` | npm-Registry | VERIFIED (Launch-Post: „Requires Node.js 18+") |
| Bin | `freebuff` → `index.js` (Launcher) | npm-Registry | VERIFIED |
| OS-Support | darwin, linux, win32 | npm-Registry | VERIFIED |
| CPU-Support | x64, arm64 | npm-Registry | VERIFIED |
| Repository | `git+https://github.com/CodebuffAI/freebuff-private.git` | npm-Registry | VERIFIED (Repo privat) |
| Launcher-Verhalten | lädt beim ersten Aufruf ein Bun-kompiliertes Binary aus `codebuff.com/api/releases/download/{version}/{target}.tar.gz` nach `~/.config/manicode/` und startet es mit geerbtem stdio | Launcher-Source (öffentlich im npm-Tarball) | VERIFIED |
| `freebuff --version` | liefert `0.0.150` (Dry-Run 2026-08-18, isolierter HOME) | Dry-Run | VERIFIED |
| `freebuff --help` | `-v/--version`, `--continue [id]`, `--cwd <dir>`, `-h/--help`, command `login` | Dry-Run + `cli/src/cli-args.ts` (public) | VERIFIED |
| Prompt-Argument | Freebuff ist „simplified CLI — no prompt args" (Codebuff hat `[prompt...]`) | `cli-args.ts` | VERIFIED |
| Interaktiver Modus | TUI mit Alternate Screen, Ordner-Picker; braucht ein echtes TTY („the TUI owns the terminal") | Dry-Run + Launcher-Source | VERIFIED |
| Headless-/Print-Modus | **nicht vorhanden / nicht dokumentiert** | Dry-Run + Doku | **BLOCKED** — TUI-Scraping ist per Master-Prompt verboten |
| Agent-Streaming über stdio | **nicht vorhanden** | siehe oben | **BLOCKED** |

**Verbindliche Regeln für die Erweiterung (Phase-5-Entscheid)**:

- `ProcessTransport.ts` implementiert ausschließlich die verifizierte
  Oberfläche: `--version`-Probe, `--help`-Probe und das sichtbare,
  bestätigte Öffnen des CLIs im integrierten Terminal
  (`freebuff --cwd <dir>`).
- `startTask()` über die CLI wird mit einem klaren
  `AdapterError('forbidden')` abgelehnt — es gibt keine dokumentierte
  nicht-interaktive Schnittstelle.
- Kein Auto-Install des CLIs durch die Erweiterung; der Nutzer
  installiert über das dokumentierte `npm install -g freebuff`.
- Argumente immer als `string[]`, nie Shell-Strings; stdout/stderr
  redacted; Timeout + Kill auf jeder Probe.

## 6. `@codebuff/sdk` (Integrations-Grundlage, Phase 6)

Der Nutzer hat **„Verwende Freebuff SDK als Grundlage"** angeordnet.
Das offizielle SDK ist `@codebuff/sdk` — es gibt kein separates
Freebuff-SDK-Paket (verifiziert: npm-Registry). Die SDK-Integration
ist damit die **primäre Chat-Transportebene** (key-gated); die
Freebuff-CLI bleibt als interaktiver Terminal-Pfad erhalten. Folgende Werte sind **VERIFIED**:

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

**VERIFIED-Upgrades (Quellcode + installierte Typen 0.10.7)**:

- Event-Schema `PrintModeEvent` (Discriminated Union): `start`,
  `text`, `tool_call`, `tool_result`, `error`, `finish`,
  `subagent_start`, `subagent_finish`, `reasoning_delta`,
  `download` — Shapes bestätigt.
- Cancellation: `RunOptions.signal?: AbortSignal` — bestätigt.
- Streaming: `handleStreamChunk` (string- + subagent/reasoning
  chunks) — bestätigt.
- Resume: `previousRun?: RunState`; `RunState = { sessionState?,
  output }` (0.10.7, ohne `traceSessionId`).
- Auth: `apiKey`-Konstruktor oder `CODEBUFF_API_KEY`-Env; kein
  dokumentierter anonymer SDK-Pfad.
- Free-Agents: Template-Liste enthält `base_free` (Free-Modus im
  SDK verankert); Agent-Auswahl via dokumentierter `agent`-Option
  (`codebuff/base@latest` Default).
- **Kostenloser Modus (NEU, 0.7.0)**: `RunOptions.costMode?: string`
  ist in den installierten Typen 0.10.7 exportiert (d.ts Zeile 2423);
  der SDK-eigene Doc-Kommentar lautet wörtlich *"Cost mode - 'free'
  mode means 0 credits charged for all agents"*. Die `costModes`-
  Liste (`free | normal | max | experimental | ask`) und die
  Zuordnung `free → AgentTemplateTypes.base_free` sind im
  öffentlichen Source (model-config, main-prompt) bestätigt. Das SDK
  sendet `cost_mode` an den Provider; die Berechtigung entscheidet
  der Server (402 → `payment-required`).
- BYOK: `CODEBUFF_BYOK_OPENROUTER` dokumentiert.

**Packaging-Hinweise (Phase 10 offen)**:

- WASM-Assets (`tree-sitter.wasm`, QuickJS-WASM) müssen in die VSIX
  kopiert und per `CODEBUFF_WASM_DIR`/`setTreeSitterWasmPath`
  verdrahtet werden (im Bundle referenziert, nicht eingebettet).
- Bundle enthält einen guarded `require("esprima")` (json5 via
  `confbox`); esprima ist nicht Teil der VSIX — der Try/Catch-Guard
  fällt auf json5s eigenen Parser zurück (sicher).

**UNVERIFIED**: exakter Free-Tier-Auth-Flow über die SDK-API (nur
Key-Pfad dokumentiert); E2E-Verifikation ohne Nutzer-Key nicht
möglich (Tests mocken das SDK); ob ein konkreter Account `cost_mode:
free` serverseitig akzeptiert (Freischaltung), ist nicht clientseitig
abfragbar (User-Schema enthält keine Plan-/Free-Flags).

**Umsetzung in der Erweiterung (0.7.0)**:

- Setting `freebuff.sdkCostMode` (Enum, Default `normal`).
- `StartTaskInput.costMode` + `FreebuffClientOptions.costMode`;
  `costMode: "free"` setzt ohne explizite Agent-Wahl automatisch
  `agent: "codebuff/base_free@latest"` (SDK-Template `base_free`,
  VERIFIED) und reicht `costMode` an `client.run()` durch.
- Ohne BYOK-Key bleibt der Chat im Mock-Transport (ehrlich
  gekennzeichnet); der Free-Modus ist dann nicht erreichbar, weil
  der SDK-Pfad zwingend einen API-Key verlangt.

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

## 11. Antwort: Gleiche Endpunkte wie die Freebuff-CLI?

**Nein.** Zwei getrennte, verifizierte Pfade:

| Pfad | Auth | Backend | Agent-API | Status in der Erweiterung |
| --- | --- | --- | --- | --- |
| Freebuff CLI (TUI-Binary) | Free-Tier, anonym (eigene Credentials, `~/.config/manicode/`) | Freebuff-Backend, Modell-Queue je Modell | Wire-Protokoll **nicht öffentlich dokumentiert** | `Freebuff: Open CLI in Terminal` (interaktiv); headless **BLOCKED** |
| `@codebuff/sdk` (Chat der Erweiterung) | `Authorization: Bearer <CODEBUFF_API_KEY>` | Codebuff-Backend (key-gated) | `PrintModeEvent`/`run()` **dokumentiert** | `FreebuffClient` (Phase 6) |

**Kostenlose Modelle nutzen** — heute belegt:

1. **Anonym & kostenlos, sofort**: Freebuff-CLI im integrierten
   Terminal (Free-Tier-Modelle DeepSeek V4 Pro/Flash, MiniMax M3,
   MiMo; GLM über verdiente Sessions; Limited Mode in manchen
   Ländern). Modellauswahl übernimmt die CLI selbst.
2. **Im Chat-Webview (SDK)**: benötigt `CODEBUFF_API_KEY` (BYOK).
   Das Modell wählt der Agent (`codebuff/base@latest`); der Picker
   in der Webview ist informativ.
3. **Nicht implementierbar (belegt UNVERIFIED/BLOCKED)**:
   - Free-Tier headless über die CLI treiben (kein dokumentiertes
     Protokoll, TUI-Scraping verboten).
   - Anonymer SDK-Flow: `x-freebuff-acting-user-id`
     (`FREEBUFF_ACTING_USER_HEADER`) ist ein Server-Header,
     `setFreeModeCapacityDeferralListener` behandelt 429-
     Deferrals — beides ist KEINE dokumentierte Auth-Methode.
   - `base_free`-Agenten existieren in der SDK-Template-Liste,
     aber das Agent-Store-Format dafür ist nicht dokumentiert.

## 12. Status-Legende

| Token | Bedeutung |
| --- | --- |
| `VERIFIED` | durch offizielle Quelle (Doku, npm-Reg., öffentlicher Quellcode oder HTTP-Head) belegt |
| `UNVERIFIED` | plausibel, aber nicht aus belastbarer Quelle bestätigt — kein produktiver Pfad |
| `BLOCKED` | durch Sicherheits- oder Compliance-Regel ausgeschlossen |
| `NOT_APPLICABLE` | im aktuellen Funktionsumfang irrelevant |

Phase 0 abgeschlossen mit aktualisiertem Free-Pfad. Keine
spekulative Integration. Phase 1 ist Skeleton (kein Realcode für
Freebuff-Aufrufe).
