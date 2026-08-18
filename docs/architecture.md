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

## 3. Transport-Layer (Freebuff-CLI bevorzugt)

- **Primary: `ProcessTransport.ts`**. Die Erweiterung startet
  `freebuff` als Kindprozess und tauscht JSON/Text über stdio aus.
  Aufruf:
  - `which freebuff` (oder gleichwertiger Lookup via Node) bei
    Aktivierung. Ergebnis wird gecached.
  - Bei Fehlen: aktivierter Empty-State („Freebuff CLI nicht
    installiert — `npm i -g freebuff`).
  - Versionsprobe: `freebuff --version`. Wenn das Ergebnis nicht in
    `engines.node >=18` liegt, wird eine Warnung gezeigt (keine
    harte Sperre — Freebuff garantiert 16+, Erweiterung erfordert
    18+).
  - Argumentliste ausschließlich als `string[]`. **Keine
    Shell-Konstrukte.**
  - stdout/stderr werden in `Redactor` geleitet, bevor sie in den
    `OutputChannel` fließen.
  - Timeout: 5 min pro Stream-Tick, abbrechbar.
- **Secondary: `FreebuffClient.ts`**. Optionaler Adapter auf
  `@codebuff/sdk`. Wird nur instanziiert, wenn der Nutzer in der
  UI Pro/BYOK aktiviert und ein Secret gespeichert wurde. Der
  MVP-Ship-Zustand ist **ohne** diesen Pfad.

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
