# Architecture (`docs/architecture.md`)

> Modulare Adapter-Architektur der VS-Code-Erweiterung **FreebuffVSIX**.
> Ziele: keine direkte Kopplung an SDK-Interna, kein Tiefen-Traversal
> in undokumentierte Bereiche, reproduzierbarer Build, klar
> abgegrenzte Verantwortlichkeiten.

## 1. Modulbaum

```text
src/
  extension.ts                  # Einstiegspunkt, Activation, Contribution-Points
  auth/
    AuthService.ts              # BYOK-Lifecycle (optional, SecretStorage)
    SecretStore.ts              # Wrapper um vscode.SecretStorage
  freebuff/
    FreebuffClient.ts           # Adapter-Wrapper; primär CLI, optional SDK
    FreebuffAdapter.ts          # Stabile interne Schnittstelle
    CapabilityMatrix.ts         # Laufzeit-Capabilities (Verified vs Disabled)
    ProcessTransport.ts         # Freebuff-CLI Subprozess (primary path)
    CliDiscovery.ts             # Soft-Probing von --version/--help
    types.ts                    # Interne, vom CLI/SDK unabhängige Typen
  workspace/
    WorkspaceContext.ts         # Kontext-Sammler (Datei, Auswahl, Tabs)
    IgnoreRules.ts              # Eigene Ignore-Engine
    PathValidator.ts            # Pfad-Traversal-Schutz
  tools/
    ToolRegistry.ts             # Allowlist registrierter Tools
    ToolApprovalService.ts      # Diff-Vorschau + Nutzerbestätigung
    FileTools.ts                # read/write/apply (im Workspace gefangen)
    TerminalTools.ts            # Approval-Pflicht, Timeout, Cancellation
  chat/
    ChatProvider.ts             # Lifecycle der Webview-Sessions
    SessionStore.ts             # Lokale, redacted Sessionpersistenz
  diagnostics/
    Redactor.ts                 # Secret-Stripping vor Logs/Export
    DiagnosticService.ts        # Output-Channels, Telemetrie-Redaction
  ui/
    ChatWebviewProvider.ts      # Host-Seite der Webview (CSP, Nonce)
    webview/
      main.ts                   # bundle-finished, postMessage-Validierung
      schema.ts                 # Zod-Runtime-Schemas für Host↔Webview
  security/
    ThreatModel.ts              # Mapping der Risiken → Mitigationen
```

**Primary Path**: `FreebuffAdapter` ↔ `ProcessTransport` ↔ `freebuff` CLI.
**Optional Path**: `FreebuffAdapter` ↔ `FreebuffClient` ↔ `@codebuff/sdk`
(wird nur aktiv, wenn der Nutzer ein BYOK/Pro-Pfad-Modell wählt).


## 2. Verantwortlichkeiten der Schichten

1. **`extension.ts`** registriert ausschließlich, instanziiert die
   Services und verdrahtet `dispose()`-Hook.
2. **`freebuff/FreebuffAdapter.ts`** definiert die **stabile interne
   Schnittstelle** der Erweiterung:
   ```ts
   interface FreebuffAdapter {
     startTask(input: StartTaskInput, ctx: AdapterContext): Promise<TaskHandle>
     cancel(handle: TaskHandle): Promise<void>
     getStatus(handle: TaskHandle): Promise<TaskStatus>
     capabilities(): CapabilityReport
     resume?(handle: TaskHandle): Promise<TaskHandle>
   }
   ```
   Kein UI-Code und kein SDK-Typ überschreitet diese Grenze.
3. **`freebuff/FreebuffClient.ts`** ist der einzige Ort, der SDK-Code
   importiert. Jeder Import ist gegen die gepinnte Version
   (`@codebuff/sdk@0.10.7`, oder neue verifizierte Version) zu
   kennzeichnen.
4. **`workspace/PathValidator.ts`** normalisiert Pfade, lehnt
   Symlink-Escapes ab und beschränkt Schreibzugriffe auf den geöffneten
   Workspace. Symlinks werden mit `fs.lstat` überprüft, danach mit
   `realpath` und erneut gegen das Workspace-Root.
5. **`tools/ToolApprovalService.ts`** erzwingt, dass *jede* Datei- oder
   Terminal-Aktion eine Diff-Vorschau und Nutzerbestätigung erhält.
   Standardpolicy: explizit, niemals stillschweigend.
6. **`ui/ChatWebviewProvider.ts`** erstellt die Webview mit restriktiver
   CSP (siehe `docs/security.md`) und generiert pro Sitzung eine
   Nonce. Die Webview akzeptiert ausschließlich Nachrichten, die das
   Schema in `ui/webview/schema.ts` erfüllen.
7. **`security/ThreatModel.ts`** führt das Mapping aus
   `docs/security.md` als typsichere Runtime-Tabelle.

## 3. Transport-Layer (CLI: nur verifizierte Oberfläche)

**Phase-5-Finding (Dry-Run 2026-08-18)**: Das Freebuff-CLI ist eine
interaktive TUI ohne dokumentierte nicht-interaktive Schnittstelle.
Daher:

- **`ProcessTransport.ts`** implementiert ausschließlich die
  verifizierten CLI-Pfade:
  - `probeVersion()` — `freebuff --version` mit Timeout, Redaction,
    sauberem Kill. Ergebnis: `0.0.150` (Dry-Run).
  - `probeHelp()` — `freebuff --help` (Cap, Redaction).
  - `cliArgs(cwd)` — Argumentvektor `['freebuff', '--cwd', <dir>]`
    für den sichtbaren Terminal-Start.
  - `startTask()` → wirft `AdapterError('forbidden')` mit
    `CLI_TUI_ONLY_MESSAGE`. **Kein TUI-Scraping.**
- **Terminal-Launch** (`Freebuff: Open CLI in Terminal`): zeigt
  Befehl + Arbeitsverzeichnis, verlangt modale Bestätigung, öffnet
  dann `freebuff` im integrierten Terminal (fester Befehl, kein
  Shell-String, `cwd` über `createTerminal({ cwd })`).
- **Binary-Policy**: Die Erweiterung lädt nie selbst Binaries herunter
  und führt keine aus; der Launcher des npm-Pakets macht das bei der
  Erstausführung durch den Nutzer (`~/.config/manicode/`).
- **Primary (Chat): `FreebuffClient.ts`** (SDK, `@codebuff/sdk@0.10.7`).
  Wird aktiv, sobald ein `CODEBUFF_API_KEY` über BYOK (SecretStorage)
  konfiguriert ist; sonst fällt der Chat auf den Mock zurück. Deckt
  Streaming (`handleStreamChunk`), Events (`PrintModeEvent`),
  Cancellation (`signal: AbortSignal`) und Resume (`previousRun`)
  ab — alle VERIFIED (Quellcode 0.10.7).
- **CLI**: `ProcessTransport.ts` bleibt für die verifizierten
  `--version`/`--help`-Probes und den interaktiven
  Terminal-Launch; Agent-Streaming über die CLI bleibt BLOCKED.

## 3a. SDK-Pinning & Kompatibilitätsschicht (optional)

- `@codebuff/sdk` wird nur eingebunden, wenn Phase 5 mit User-Key
  freigegeben ist. Pin: `0.10.7`.
- `CapabilityMatrix.ts` aktiviert zur Laufzeit nur Pfade, die das
  bestätigte Export-Set unterstützt. Funktionen mit Status
  `UNVERIFIED` oder `BLOCKED` werden als deaktiviert propagiert.
- Jede Aufrufstelle gegen das SDK wird gegen lokale Adapter-
  Exceptions gekapselt (`AuthError`, `PaymentRequiredError`,
  `HttpError`, `NetworkError`) — kein direktes Re-Throwen.

## 4. Build-/Verpackungspipeline

- TypeScript mit `"strict": true`, `"noUncheckedIndexedAccess": true`.
- Bundling mit **esbuild** (kein Vite, da Vite für VSIX unnötig ist
  und das Freebuff-Webprojekt-Standardtemplate Vite ist — die hier
  verwendete VSIX-Pipeline ist isoliert).
- Vor `./scripts/package.sh` läuft:
  `tsc --noEmit && eslint && vitest run`.
- **VSIX-Bau** nutzt `@vscode/vsce package --no-dependencies` —
  keine Bundle-Dateien für nicht benötigte Module.
- `.vscodeignore` schließt Tests, Docs und Konfiguration aus, sofern
  sie nicht für das Suffix `README/LICENSE/NOTICE/icon` benötigt
  werden.

## 5. Streaming / Cancellation

- Eingehende SDK-Events werden vom Adapter in ein **kanonisches
  Event-Modell** (`ChatEvent` in `freebuff/types.ts`) übersetzt.
  `unknown` und nicht im lokalen Zod-Schema matchende Events werden
  geloggt *redacted* und verworfen.
- `cancel()` ruft die nächste verfügbare, dokumentierte Abbruch-
  API auf. Bis dahin wird `AbortController` als best-effort-Pfad
  verwendet und die UI `cancelled`-Zustand sichtbar.

## 6. Kontext und Ignore-Regeln

- `WorkspaceContext` sammelt nur das, was der Nutzer explizit erlaubt
  oder was durch öffnende Datei / Auswahl natürlich gegeben ist.
- `/send workspace` ist **deaktiviert**. Stattdessen: gezielte Auswahl
  + `path:`/`@`-Referenzen.
- `.gitignore` wird automatisch angewendet. `.codebuffignore` ist
  **UNVERIFIED** und wird erst aktiviert, sobald die Datei in der
  offiziellen Doku erwähnt wird.

## 7. Werkzeug- und Terminal-Workflow

- Kein Schreibvorgang ohne Diff-Vorschau und Bestätigung.
- Terminal-Befehle: Anzeige Befehl + Arbeitsverzeichnis, dann
  Bestätigung. Standardmäßig keine Shell-Chains, keine Netzwerk-,
  keine rekursiven Löschbefehle. Konfigurierbar über Allowlist.
- Timeout + Cancellation sind Pflicht.

## 8. Konfigurationspunkte (geplant)

| Setting | Default | Beschreibung |
| --- | --- | --- |
| `freebuff.agents.allow` | `[]` | Liste zusätzlich erlaubter Agent-IDs |
| `freebuff.context.maxBytes` | `262144` | Max. Kontextgröße in Bytes pro Lauf |
| `freebuff.terminal.timeoutMs` | `30000` | Befehls-Timeout |
| `freebuff.terminal.allowNetwork` | `false` | Netzwerk-Befehle global erlauben |
| `freebuff.workspace.trustRequired` | `true` | Risikofunktionen nur bei vertrauenswürdigen Workspaces |
| `freebuff.sdkCostMode` | `normal` | SDK-Kostenmodus (`free \| normal \| max \| experimental \| ask`). VERIFIED in `@codebuff/sdk@0.10.7`; `free` = 0 Credits für alle Agenten, nutzt `base_free`-Template. Berechtigung entscheidet der Server. |
| `freebuff.webview.csp` | Restriktiv (siehe `security.md`) | CSP-Override (nur Verschärfung) |

## 9. Erweiterungspunkte

- `CapabilityMatrix` markiert neue SDK-Versionen: niemals still-
  schweigend aktivieren, sondern erst nach expliziter Bestätigung des
  Nutzers (`freebuff.update.accept`).

## 10. Annahmen, Vorbehalte

- Diese Architektur geht davon aus, dass die offizielle Integration
  über das **`@codebuff/sdk`**-Paket erfolgt (siehe
  `freebuff-inventory.md` Abschnitt 1). Sollte sich das ändern, ist
  Phase 5 neu zu validieren.
- Annahmen über Freebuff-CLI sind auf ein Minimum reduziert — die
  Erweiterung greift nicht in die CLI ein, bis `Phase 5 +
  ProcessTransport` offiziell freigegeben ist.
