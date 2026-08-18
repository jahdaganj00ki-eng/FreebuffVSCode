# Security & Threat Model (`docs/security.md`)

> Verbindliches Bedrohungsmodell für **FreebuffVSIX**. Jede Zeile hier
> entspricht einer konkreten Mitigation in der Implementierung. Werte in
> eckigen Klammern verweisen auf die Architekturmodule.

## 1. Risikoinventar

| ID | Risiko | Hauptangriffsfläche | Schweregrad | Mitigation |
| --- | --- | --- | --- | --- |
| S-1 | Secret-Leak | API-Key, Token, Cookie | Hoch | Nur `vscode.SecretStorage` [src/auth/SecretStore.ts]. Keine JSON, keine Logs. |
| S-2 | Prompt-/Kontext-Leak | Workspace-Inhalt an Agent | Hoch | Explizite Auswahl vor Versand; Redaction von `.env*`, `id_rsa`, `*.pem`, `**/secrets/**` vor `projectFiles`. Größenlimit [src/workspace/WorkspaceContext.ts]. |
| S-3 | Command Injection | `runInTerminal` / CLI-Aufrufe | Hoch | Array-Args statt String-Concat, Allowlist [src/tools/ToolRegistry.ts], sichtbare Bestätigung [src/tools/ToolApprovalService.ts]. |
| S-4 | SSRF | Custom Tools / Fetch-Calls | Mittel | `getCustomToolDefinition` deaktiviert in UI-Tools; nur Server-seitige Built-ins nutzen. URL-Allowlist falls Erweiterung selbst ruft (`fetchHealth`). |
| S-5 | Path Traversal | `..`, absolute Pfade, UNC | Hoch | Normalisierung + Workspace-Root-Check + `realpath` Symlink-Auflösung [src/workspace/PathValidator.ts]. |
| S-6 | Symlink-Escape | Symlink zeigt außerhalb Workspace | Hoch | `lstat`/`realpath`, vor jedem Schreibvorgang neu geprüft. |
| S-7 | Untrusted Workspace | Erweiterung aktiv in nicht-vertrautem Workspace | Mittel | VS-Code-`workspace.isTrusted`-Check vor allen risikoreichen Aktionen. Konfigurations-Policy `freebuff.workspace.trustRequired`. |
| S-8 | Bösartige Repo-Dateien | `.vscode/settings.json`, postinstall scripts | Mittel | Keine impliziten `postinstall`-Skripte. Bei paketabhängigen Tasks max. human-bestätigte Ausführung. |
| S-9 | Manipulierte Tool-Argumente | Custom-Tool-Args aus Prompt | Hoch | Zod-Validation am Adapter-Rand, strikte Allowlist. |
| S-10 | Webview-Nachrichten | `postMessage` aus unsicherer Quelle | Hoch | Runtime-Schema-Validation [src/ui/webview/schema.ts], CSP, Nonce, kein Inline-Script. |
| S-11 | Übergroße Eingaben | Prompt, Kontext, Tool-Output | Mittel | Token-/Byte-Limits, Chunking, frühzeitiges Abbruch. |
| S-12 | Netzwerkfehler / MITM | TLS-Strip, Zertifikate | Mittel | `vscode-fetch` mit Default-Cert-Validation, keine benutzerdefinierten Zertifikatspools. |
| S-13 | Kompromittierte Abhängigkeiten | npm-Pakete, transitive C/C++ | Mittel | Reproduzierbare `npm ci`, Dep-Review in CI, OIDC-provenance, `npm audit` als CI-Job. |
| S-14 | Tool-Scope-Erweiterung | User gibt Schreibtools frei | Mittel | Default `disabled`. Jede Freischaltung explizit + Audit-Log. |
| S-15 | Telemetrie-Leak | OutputChannel, Errors | Mittel | Diagnostik-Export durchläuft `Redactor`. Keine `Authorization`-Header, keine Tokens in Stacktraces. |
| S-16 | Login-Bypass | UI ohne Auth trotz leerem Key | Niedrig | Klare Empty-State-Hinweise, „Sign In“-Affordanz, niemals stilles Scheitern. |
| S-17 | Branded-Asset-Leak | Fremde Logos/Marken | Niedrig | Nur generische Icons aus der Repo-DNA, Lizenz-Texte in `NOTICE`. |
| S-18 | VSIX-Geheimnisse | Release-Artefakt enthält Token | Hoch | Pre-package-Lint schließt `*.env`, `*.key`, Token-Muster aus VSIX aus. |
| S-19 | CI-Injection | GitHub-Actions-Werte | Mittel | Keine Token-Eingaben in YAML. Inputs nur über `secrets.*` referenziert. |
| S-20 | Log-Injection via Fehlermeldungen | SDK wirft Roh-Strings | Niedrig | `sanitizeErrorMessage` Wrapper, einheitlicher Error-Channel. |

## 2. Daten- und Geheimnisklassen

| Klasse | Beispiele | Behandlung |
| --- | --- | --- |
| SECRET | `CODEBUFF_API_KEY`, OAuth-Tokens | `SecretStorage`. Niemals in Logs, JSON, Tests, Benchmarks. |
| PII | Workspace-Pfade mit Nutzername | Erlaubt, aber in Diagnostik-Exporten durch Platzhalter ersetzt. |
| INTERNAL | Session-IDs, anonyme Nutzungszähler | Nur lokale Speicherung, keine externe Übertragung ohne Opt-in. |
| PUBLIC | Doku, Repo-README | Wie üblich. |

## 3. Webview-Sicherheit

- **CSP** (Default, `default-src 'none'`):
  ```text
  default-src 'none';
  script-src 'nonce-{NONCE}';
  style-src 'nonce-{NONCE}';
  img-src data:;
  connect-src vscode-resource: https:;
  font-src data:;
  object-src 'none';
  base-uri 'none';
  frame-ancestors 'none';
  ```
- Inline-Skripte: ausschließlich über die Nonce.
- `acquireVsCodeApi()` ausschließlich in `webview/main.ts`.
- Eingehende `postMessage`-Daten werden über Zod-Runtime-Schema in
  `ui/webview/schema.ts` streng typgeprüft. Unbekannte Commands
  werden ignoriert und geloggt (redacted).
- Markdown-Sanitisierung: `DOMPurify` (oder gleichwertig) —
  HTTP-Image-URLs sind standardmäßig deaktiviert.

## 4. Terminal- & Werkzeug-Policy

- Vor Ausführung: vollständige Anzeige von Befehl + Arbeitsverzeichnis
  + Exit-Verhalten.
- Default gesperrt: `rm -rf`, `curl`, `wget`, `Invoke-WebRequest`,
  `bash -c`, `&&`, `||`, `|`, `>`, `<` (Pipeline-Sonderzeichen).
  Eine Freischaltung erfolgt explizit durch den Nutzer.
- Maximale Laufzeit pro Befehl: konfigurierbar, Default `30 000 ms`.
- `cancel()` führt zu: `taskkill /T /F` (Windows) bzw.
  `process.kill('SIGTERM')` + Force-SIGKILL nach 2 s Grace.

## 5. Geheimnis-Redaction

`src/diagnostics/Redactor.ts` filtert vor jeder Ausgabe:

- Token-Formate: `sk-…`, `ghp_…`, `github_pat_…`,
  `xox[baprs]-…`, `Bearer [A-Za-z0-9._-]{20,}`,
  `CODEBUFF_API_KEY` und beliebige Inhalte mit Längen ≥ 24, die nur
  aus Base64-/Hex-Buchstaben bestehen.
- HTTP-Header: `Authorization`, `Cookie`, `Set-Cookie`,
  `X-API-Key`, `X-Auth-Token`.
- Datei-Muster in Diagnostik-Dumps: `*.env*`, `*.pem`,
  `**/.ssh/**`, `**/secrets/**`, `credentials.json`,
  gcloud/ AWS-Config-Dateien.
- Vor dem Schreiben in `OutputChannel` und in
  Diagnostik-Exporte: alle Treffer durch `«REDACTED»` ersetzt.

## 6. Workspace-Trust

- Risikoreiche Aktionen (Datei-Schreiben, Terminal,
  Patch-Anwendung) sind an `vscode.workspace.isTrusted` gebunden.
  In nicht-vertrauten Workspaces: read-only Modus, klare Hinweise.
- Allowlist-Defaults werden in nicht-vertrauten Workspaces strikter
  gefahren (nur `codebuff/thinker`, `codebuff/researcher`,
  `codebuff/file-picker`, `codebuff/code-searcher`).

## 7. Abhängigkeits- und Lieferketten-Politik

- `package-lock.json` ist Pflicht, CI nutzt `npm ci`.
- `@codebuff/sdk` ist auf eine **einzelne Version** festgepinnt
  (`0.10.x`), Bandbreiten nur bei explizitem Sicherheits-Update und
  Inventur-Update.
- `npm audit --omit=dev` als CI-Gate (Warnung, kein Hard-Fail für
  transitive Audits).
- Native/WASM-Komponenten des SDK werden über `@vscode/tree-sitter-wasm`
  und `@jitl/quickjs-wasmfile-release-sync` geladen — beide werden vom
  VSIX eingeschlossen, **nicht** zur Laufzeit aus dem Netz nachgeladen.

## 8. CI/CD-Hygiene

- `.github/workflows/ci.yml`: typecheck, lint, test, build,
  VSIX-Packaging (kein Upload).
- `.github/workflows/package.yml`: Secret-Scan
  (`gitleaks`-äquivalente Pattern), VSIX-Audit (`vsce ls`),
  Smoke-Test (headless).
- `.github/workflows/release.yml`: nur manuell auslösbar mit
  Repository-Secret `VSCE_PAT`; Tokens werden ausschließlich
  per OIDC oder als Repository-Secret gezogen.

## 9. Vorfall-Reaktion

- Secret-Leak: dokumentiertes Verfahren in `CONTRIBUTING.md`,
  sofortige Schlüsselrotation durch den Nutzer außerhalb der
  Erweiterung.
- Dependency-Kompromiss: `package-lock.json`-Pin +
  `npm ci --ignore-scripts` als Notfall-Flag.

## 10. Annahmen, Vorbehalte

- Wir gehen davon aus, dass das SDK keine versteckte Telemetrie
  einbaut. Das wird in Phase 5 gegen den veröffentlichten Quellcode
  gegengeprüft.
- Wenn das SDK jemals eine neue Authentifizierungsmethode anbietet,
  wird Phase 0 erneut durchlaufen, bevor `AuthService` erweitert wird.
