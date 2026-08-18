// `main.ts` — chat Webview client (bundled separately from the host).
//
// Security model:
// - No inline handlers; every event is wired with addEventListener.
// - All host messages are validated with the shared Zod schema.
// - Assistant/system text is rendered via renderMarkdown (escaped);
//   user/tool text is rendered with textContent (verbatim, safe).

import {
  hostToWebviewSchema,
  type InitPayload,
  type Session,
  type ChatMessage,
} from './schema';
import { renderMarkdown } from './markdown';

// Provided by VS Code in the webview context.
declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

interface ClientState {
  sessions: ReadonlyArray<Session>;
  activeSessionId: string;
  transportId: string;
  verifiedModels: ReadonlyArray<string>;
  verifiedSubagents: ReadonlyArray<string>;
  theme: InitPayload['theme'];
  anonymous: boolean;
  byokEnabled: boolean;
}

const emptyState: ClientState = {
  sessions: [],
  activeSessionId: '',
  transportId: 'mock',
  verifiedModels: [],
  verifiedSubagents: [],
  theme: 'dark',
  anonymous: true,
  byokEnabled: false,
};

let state: ClientState = emptyState;

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`webview: missing element #${id}`);
  }
  return el as T;
}

const messagesEl = () => $<HTMLElement>('freebuff-messages');
const sessionTitleEl = () => $<HTMLElement>('freebuff-session-title');
const inputEl = () => $<HTMLTextAreaElement>('freebuff-input');
const sendBtn = () => $<HTMLButtonElement>('freebuff-send');
const cancelBtn = () => $<HTMLButtonElement>('freebuff-cancel');
const rerunBtn = () => $<HTMLButtonElement>('freebuff-rerun');
const modelSelect = () => $<HTMLSelectElement>('freebuff-model');
const agentSelect = () => $<HTMLSelectElement>('freebuff-agent');
const bannerEl = () => $<HTMLElement>('freebuff-banner');

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function activeSession(): Session | undefined {
  return state.sessions.find((session) => session.id === state.activeSessionId);
}

function labelForRole(role: ChatMessage['role']): string {
  switch (role) {
    case 'user':
      return 'You';
    case 'assistant':
      return 'Freebuff';
    case 'tool':
      return 'Tool';
    case 'system':
      return 'System';
  }
}

function fillSelect(select: HTMLSelectElement, values: ReadonlyArray<string>, selected: string): void {
  select.textContent = '';
  for (const value of values) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    if (value === selected) {
      option.selected = true;
    }
    select.append(option);
  }
}

function scrollToBottom(): void {
  const el = messagesEl();
  el.scrollTop = el.scrollHeight;
}

function renderMessages(): void {
  const container = messagesEl();
  container.textContent = '';
  const session = activeSession();

  if (!session) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.setAttribute('role', 'status');
    empty.textContent = 'No session yet. Ask Freebuff anything — free tier, no API key.';
    container.append(empty);
    return;
  }

  for (const message of session.messages) {
    const row = document.createElement('div');
    row.className = `msg msg-${message.role}`;
    if (message.status) {
      row.classList.add(`msg-${message.status}`);
    }

    const role = document.createElement('span');
    role.className = 'msg-role';
    role.textContent = labelForRole(message.role);

    const body = document.createElement('div');
    body.className = 'msg-body';
    if (message.role === 'assistant' || message.role === 'system') {
      body.innerHTML = renderMarkdown(message.text);
    } else {
      body.textContent = message.text;
    }

    const actions = document.createElement('div');
    actions.className = 'msg-actions';
    const copy = document.createElement('button');
    copy.className = 'msg-copy';
    copy.setAttribute('aria-label', 'Copy message text');
    copy.textContent = 'copy';
    copy.addEventListener('click', () => {
      void navigator.clipboard.writeText(message.text);
    });
    actions.append(copy);

    if (message.status === 'streaming') {
      const cursor = document.createElement('span');
      cursor.className = 'stream-cursor';
      cursor.setAttribute('aria-hidden', 'true');
      cursor.textContent = '▌';
      body.append(cursor);
    }

    row.append(role, body, actions);
    container.append(row);
  }
  scrollToBottom();
}

function renderHeader(): void {
  const session = activeSession();
  sessionTitleEl().textContent = session ? session.title : 'Freebuff';

  const transport = document.createElement('span');
  transport.className = 'transport-badge';
  transport.textContent = state.transportId === 'mock' ? 'mock transport (Phase 4)' : state.transportId;
  sessionTitleEl().append(' ', transport);

  fillSelect(modelSelect(), state.verifiedModels, modelSelect().value || 'deepseek-v4');
  const agents = ['default', ...state.verifiedSubagents];
  fillSelect(agentSelect(), agents, agentSelect().value || 'default');
}

function renderComposer(): void {
  const session = activeSession();
  const running = session?.taskStatus === 'running' || session?.taskStatus === 'cancelling';
  sendBtn().disabled = running;
  cancelBtn().hidden = !running;
  rerunBtn().hidden = running;
  inputEl().disabled = running;
}

function renderAll(): void {
  renderHeader();
  renderMessages();
  renderComposer();
}

function showBanner(text: string): void {
  const banner = bannerEl();
  banner.textContent = text;
  banner.hidden = false;
  window.setTimeout(() => {
    banner.hidden = true;
  }, 8000);
}

function applyTheme(theme: ClientState['theme']): void {
  document.body.classList.remove('theme-light', 'theme-dark', 'theme-high-contrast');
  document.body.classList.add(`theme-${theme}`);
}

// ---------------------------------------------------------------------------
// Incoming host messages
// ---------------------------------------------------------------------------

function handleInit(payload: InitPayload): void {
  state = {
    sessions: payload.sessions,
    activeSessionId: payload.activeSessionId,
    transportId: payload.capabilities.transportId,
    verifiedModels: payload.capabilities.verifiedModels,
    verifiedSubagents: payload.capabilities.verifiedSubagents,
    theme: payload.theme,
    anonymous: payload.auth.anonymous,
    byokEnabled: payload.auth.byokEnabled,
  };
  applyTheme(payload.theme);
  renderAll();
}

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  const parsed = hostToWebviewSchema.safeParse(event.data);
  if (!parsed.success) {
    console.warn('Freebuff webview: dropped message that failed schema validation.');
    return;
  }
  const message = parsed.data;
  switch (message.kind) {
    case 'init':
      handleInit(message.payload);
      break;
    case 'session-updated':
      state = { ...state, sessions: message.payload.sessions, activeSessionId: message.payload.activeSessionId };
      renderAll();
      break;
    case 'error':
      showBanner(message.payload.message);
      break;
  }
});

// ---------------------------------------------------------------------------
// Composer
// ---------------------------------------------------------------------------

function send(): void {
  const prompt = inputEl().value;
  const trimmed = prompt.trim();
  if (!trimmed) {
    return;
  }
  const payload: { prompt: string; model: string; agent?: string } = {
    prompt: trimmed,
    model: modelSelect().value,
  };
  if (agentSelect().value && agentSelect().value !== 'default') {
    payload.agent = agentSelect().value;
  }
  vscode.postMessage({ kind: 'send-prompt', payload });
  inputEl().value = '';
}

inputEl().addEventListener('keydown', (event: KeyboardEvent) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    send();
  }
});

sendBtn().addEventListener('click', send);
cancelBtn().addEventListener('click', () => {
  vscode.postMessage({ kind: 'cancel' });
});
rerunBtn().addEventListener('click', () => {
  vscode.postMessage({ kind: 'rerun' });
});
$<HTMLButtonElement>('freebuff-new').addEventListener('click', () => {
  vscode.postMessage({ kind: 'new-session' });
});
$<HTMLButtonElement>('freebuff-delete').addEventListener('click', () => {
  vscode.postMessage({ kind: 'delete-session', payload: { sessionId: state.activeSessionId } });
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  applyTheme(state.theme);
  renderAll();
  vscode.postMessage({ kind: 'ready' });
});
