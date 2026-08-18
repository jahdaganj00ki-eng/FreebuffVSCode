// Phase 2 entry point for FreebuffVSIX.
//
// Goals:
// 1. Activate without requiring any login or API key.
// 2. Provide a deterministic empty-state ("Freebuff CLI not
//    installed" / "Freebuff CLI installed") via an OutputChannel
//    and three slim commands.
// 3. Run the FreebuffAdapter contract against the deterministic
//    MockTransport; real Freebuff-CLI integration is deferred to
//    Phase 5.
// 4. Hold NO secrets and make NO network calls.

import * as vscode from 'vscode';
import {
  EXTENSION_NAME,
  EXTENSION_PUBLISHER,
  EXTENSION_VERSION,
  CLI_RECOMMENDED_INSTALL,
} from './version';
import { discoverCli, candidatePaths } from './freebuff/CliDiscovery';
import { RELEASE_NOTES } from './diagnostics/ReleaseNotes';
import { MockTransport } from './freebuff/MockTransport';
import type { FreebuffAdapter } from './freebuff/FreebuffAdapter';

// Active transport for Phase 2: the deterministic mock. Phase 5 swaps
// this for the verified Freebuff-CLI subprocess transport.
let adapter: FreebuffAdapter | undefined;

function getAdapter(): FreebuffAdapter {
  if (!adapter) {
    adapter = new MockTransport();
  }
  return adapter;
}

let outputChannel: vscode.OutputChannel | undefined;

function getChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel(EXTENSION_NAME, {
      log: true,
    });
  }
  return outputChannel;
}

function releaseNotes(): string {
  return RELEASE_NOTES.join('\n');
}

function announceActivation(context: vscode.ExtensionContext): void {
  const channel = getChannel();
  channel.appendLine(releaseNotes());
  channel.appendLine('');
  channel.appendLine(`Publisher: ${EXTENSION_PUBLISHER}`);
  channel.appendLine(`Engine: ${vscode.version}`);
  channel.appendLine(`Searched CLI candidates: ${candidatePaths().join(', ')}`);
  channel.appendLine('');
  channel.appendLine('Free tier is anonymous. No account, no API key.');
  channel.appendLine(`If the Freebuff CLI is not installed, run: ${CLI_RECOMMENDED_INSTALL}`);
  void context; // accept-but-not-yet-use, keeps the API for later phases.
}

function buildStatusReport(): string {
  // We deliberately do not spawn `freebuff --version` here in Phase 1.
  // Discovery is restricted to PATH probing so the activation path
  // stays side-effect-free. Phase 5 introduces a guarded `--version`
  // probe with timeout and redaction.
  const sample = ['/usr/local/bin/freebuff', '/opt/homebrew/bin/freebuff', 'freebuff.cmd', 'freebuff'];
  const result = discoverCli(sample);
  const lines: string[] = [];
  lines.push('FreebuffVSIX status');
  lines.push('--------------------');
  lines.push(`Extension : ${EXTENSION_NAME} v${EXTENSION_VERSION}`);
  lines.push(`Transport : ${getAdapter().id} (mock until Phase 5)`);
  if (result.found && result.path) {
    lines.push(`CLI found : yes (${result.path})`);
    lines.push('Run "Freebuff: Open Chat" to start.');
  } else {
    lines.push('CLI found : no.');
    lines.push(`Install  : ${CLI_RECOMMENDED_INSTALL}`);
    lines.push('Detection is passive (PATH-only) in Phase 1; an explicit --version probe is queued for Phase 5.');
  }

  // Capability matrix (veracity-tagged).
  const report = getAdapter().capabilities();
  lines.push('');
  lines.push('Capability matrix (from docs/freebuff-inventory.md):');
  lines.push('---------------------------------------------------');
  for (const cap of report.capabilities) {
    lines.push(`  [${cap.status.padEnd(12)}] ${cap.id} — ${cap.note}`);
  }
  lines.push(`  Free models: ${report.verifiedModels.join(', ')}`);
  lines.push(`  Verified subagents: ${report.verifiedSubagents.join(', ')}`);
  return lines.join('\n');
}

async function showStatus(): Promise<void> {
  const channel = getChannel();
  channel.appendLine('');
  channel.appendLine(buildStatusReport());
  channel.show(true);
}

async function openChat(): Promise<void> {
  // Chat Webview sits in Phase 4. For now we publish the status and
  // give the user a useful place to land. This avoids launching an
  // empty Webview that pretends to work.
  await showStatus();
  void vscode.window.showInformationMessage(
    'Freebuff chat opens in a dedicated Webview in Phase 4. For now, run `npm install -g freebuff` and use Freebuff CLI directly.',
    'Copy install command',
  ).then(async (choice) => {
    if (choice === 'Copy install command') {
      await vscode.env.clipboard.writeText(CLI_RECOMMENDED_INSTALL);
    }
  });
}

async function installCli(): Promise<void> {
  // We do NOT run npm install or any shell command from this
  // extension. We surface the documented command so the user can
  // copy/paste it themselves, and report the Freebuff-pinned engine.
  const channel = getChannel();
  channel.appendLine('');
  channel.appendLine('Recommended install steps:');
  channel.appendLine(`  1. ${CLI_RECOMMENDED_INSTALL}`);
  channel.appendLine('  2. Verify: freebuff --version  (must report >= 0.x.y)');
  channel.appendLine('  3. Open VS Code command palette: "Freebuff: Open Chat".');
  channel.appendLine('');
  channel.show(true);
  await vscode.env.clipboard.writeText(CLI_RECOMMENDED_INSTALL);
  void vscode.window.showInformationMessage(
    `Install command copied to clipboard: ${CLI_RECOMMENDED_INSTALL}`,
  );
}

export function activate(context: vscode.ExtensionContext): void {
  announceActivation(context);

  context.subscriptions.push(getChannel());

  context.subscriptions.push(
    vscode.commands.registerCommand('freebuff.command.openChat', () => openChat()),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('freebuff.command.status', () => showStatus()),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('freebuff.command.installCli', () => installCli()),
  );

  // Friendly empty-state notification if the CLI is missing — but
  // only on first activation. We use `hasShownEmptyState` in
  // globalState to avoid spamming the user.
  const STATE_KEY = 'freebuff.emptyStateShown';
  if (!context.globalState.get<boolean>(STATE_KEY)) {
    void context.globalState.update(STATE_KEY, true);
    void vscode.window.showInformationMessage(
      `${EXTENSION_NAME} activated. Free tier — anonymous, no API key. Run "Freebuff: Install Freebuff CLI" to add the CLI.`,
      'Show status',
    ).then(async (choice) => {
      if (choice === 'Show status') {
        await showStatus();
      }
    });
  }
}

export function deactivate(): void {
  outputChannel?.dispose();
  outputChannel = undefined;
}
