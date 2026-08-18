// `ChatWebviewProvider.ts` — host side of the Freebuff chat Webview.
//
// Security:
// - Strict CSP with `default-src 'none'`, nonce-based script/style.
// - No inline event handlers; all scripts live in the bundled
//   dist/webview/main.js, loaded through a vscode-resource URI.
// - Every message from the webview is validated with the shared Zod
//   schema before dispatch; unknown kinds are dropped.

import * as vscode from 'vscode';
import type { FreebuffAdapter } from '../freebuff/FreebuffAdapter';
import type { AuthService } from '../auth/AuthService';
import type { ChatProvider } from '../chat/ChatProvider';
import type { InitPayload } from './webview/schema';
import { parseWebviewToHostMessage, sessionUpdatePayloadSchema } from './webview/schema';

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  const cryptoObj = globalThis.crypto;
  const bytes = cryptoObj.getRandomValues(new Uint8Array(32));
  for (const byte of bytes) {
    out += chars[byte % chars.length] ?? '';
  }
  return out;
}

type ThemeName = InitPayload['theme'];

function themeName(kind: vscode.ColorThemeKind): ThemeName {
  switch (kind) {
    case vscode.ColorThemeKind.Light:
      return 'light';
    case vscode.ColorThemeKind.HighContrast:
    case vscode.ColorThemeKind.HighContrastLight:
      return 'high-contrast';
    default:
      return 'dark';
  }
}

export class ChatWebviewProvider {
  private panel: vscode.WebviewPanel | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly adapter: FreebuffAdapter,
    private readonly chat: ChatProvider,
    private readonly auth: AuthService,
  ) {}

  open(): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'freebuff.chat',
      'Freebuff',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview')],
      },
    );

    this.panel.webview.html = this.buildHtml(this.panel.webview);

    this.panel.onDidDispose(
      () => {
        this.panel = undefined;
        for (const disposable of this.disposables) {
          disposable.dispose();
        }
        this.disposables.length = 0;
      },
      undefined,
      this.disposables,
    );

    this.panel.webview.onDidReceiveMessage(
      (raw: unknown) => {
        this.handleMessage(raw);
      },
      undefined,
      this.disposables,
    );

    // Re-render on any provider change.
    this.disposables.push(
      new vscode.Disposable(
        this.chat.subscribe(() => {
          void this.postSessionUpdate();
        }),
      ),
    );

    // Keep the theme class current.
    this.disposables.push(
      vscode.window.onDidChangeActiveColorTheme(() => {
        this.postInit();
      }),
    );
  }

  private handleMessage(raw: unknown): void {
    const message = parseWebviewToHostMessage(raw);
    if (!message) {
      void vscode.window.showWarningMessage(
        'Freebuff: dropped a webview message that failed schema validation.',
      );
      return;
    }
    switch (message.kind) {
      case 'ready':
        this.postInit();
        break;
      case 'send-prompt': {
        const sendOptions: { model?: string; agent?: string } = { model: message.payload.model };
        if (message.payload.agent !== undefined) {
          sendOptions.agent = message.payload.agent;
        }
        void this.chat.sendPrompt(message.payload.prompt, sendOptions);
        break;
      }
      case 'cancel':
        void this.chat.cancel();
        break;
      case 'rerun':
        void this.chat.rerun();
        break;
      case 'new-session':
        this.chat.newSession();
        break;
      case 'delete-session':
        this.chat.deleteSession(message.payload.sessionId);
        break;
    }
  }

  private async postInit(): Promise<void> {
    if (!this.panel) {
      return;
    }
    const { sessions, activeSessionId } = this.chat.state();
    const capabilities = this.adapter.capabilities();
    const auth = await this.auth.status();
    const payload: InitPayload = {
      sessions: [...sessions],
      activeSessionId,
      capabilities: {
        transportId: this.adapter.id,
        verifiedModels: [...capabilities.verifiedModels],
        verifiedSubagents: [...capabilities.verifiedSubagents],
      },
      theme: themeName(vscode.window.activeColorTheme.kind),
      auth: { anonymous: auth.anonymous, byokEnabled: auth.byokEnabled },
    };
    await this.panel.webview.postMessage({ kind: 'init', payload });
  }

  private async postSessionUpdate(): Promise<void> {
    if (!this.panel) {
      return;
    }
    const { sessions, activeSessionId } = this.chat.state();
    const payload = { sessions: [...sessions], activeSessionId };
    const parsed = sessionUpdatePayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return;
    }
    await this.panel.webview.postMessage({ kind: 'session-updated', payload: parsed.data });
  }

  private buildHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'main.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'styles.css'),
    );

    const csp = [
      "default-src 'none'",
      `script-src 'nonce-${nonce}'`,
      `style-src 'nonce-${nonce}'`,
      'img-src data:',
      'font-src data:',
      'connect-src https:',
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <link rel="stylesheet" nonce="${nonce}" href="${styleUri}">
  <title>Freebuff</title>
</head>
<body>
  <div id="freebuff-chat">
    <header id="freebuff-header">
      <div id="freebuff-session-title">Freebuff</div>
      <div id="freebuff-controls">
        <label for="freebuff-model">Model
          <select id="freebuff-model" aria-label="Model"></select>
        </label>
        <label for="freebuff-agent">Agent
          <select id="freebuff-agent" aria-label="Agent"></select>
        </label>
        <button id="freebuff-new" class="icon-btn" aria-label="New session" title="New session">＋</button>
        <button id="freebuff-delete" class="icon-btn" aria-label="Delete current session" title="Delete session">🗑</button>
      </div>
    </header>
    <div id="freebuff-banner" hidden></div>
    <main id="freebuff-messages" role="log" aria-live="polite" aria-label="Freebuff messages"></main>
    <footer id="freebuff-composer">
      <textarea id="freebuff-input" rows="1" aria-label="Message Freebuff" placeholder="Ask Freebuff… (Enter to send, Shift+Enter for newline)"></textarea>
      <button id="freebuff-send">Send</button>
      <button id="freebuff-cancel" hidden>Cancel</button>
      <button id="freebuff-rerun" hidden title="Re-run last prompt">↻ Rerun</button>
    </footer>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
