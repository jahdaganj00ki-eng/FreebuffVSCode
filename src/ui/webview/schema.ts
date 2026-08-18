// `schema.ts` — runtime message contract between the extension host
// and the chat Webview. Shared by both bundles (extension host and
// webview client). Every incoming message is validated with these
// schemas before it is acted upon; unknown shapes are dropped.

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Domain payloads
// ---------------------------------------------------------------------------

export const chatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  text: z.string(),
  toolName: z.string().optional(),
  seq: z.number().int().nonnegative().optional(),
  ts: z.number().int().nonnegative(),
  status: z.enum(['streaming', 'complete', 'cancelled', 'error']).optional(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const taskStatusSchema = z.enum(['idle', 'running', 'cancelling', 'cancelled', 'completed', 'failed']);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const sessionSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  taskStatus: taskStatusSchema,
  messages: z.array(chatMessageSchema),
});
export type Session = z.infer<typeof sessionSchema>;

// ---------------------------------------------------------------------------
// Host → Webview
// ---------------------------------------------------------------------------

export const initPayloadSchema = z.object({
  sessions: z.array(sessionSchema),
  activeSessionId: z.string(),
  capabilities: z.object({
    transportId: z.string(),
    verifiedModels: z.array(z.string()),
    verifiedSubagents: z.array(z.string()),
  }),
  theme: z.enum(['light', 'dark', 'high-contrast']),
  auth: z.object({
    anonymous: z.boolean(),
    byokEnabled: z.boolean(),
  }),
});
export type InitPayload = z.infer<typeof initPayloadSchema>;

export const sessionUpdatePayloadSchema = z.object({
  sessions: z.array(sessionSchema),
  activeSessionId: z.string(),
});
export type SessionUpdatePayload = z.infer<typeof sessionUpdatePayloadSchema>;

export const hostToWebviewSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('init'), payload: initPayloadSchema }),
  z.object({ kind: z.literal('session-updated'), payload: sessionUpdatePayloadSchema }),
  z.object({ kind: z.literal('error'), payload: z.object({ message: z.string() }) }),
]);
export type HostToWebviewMessage = z.infer<typeof hostToWebviewSchema>;

// ---------------------------------------------------------------------------
// Webview → Host
// ---------------------------------------------------------------------------

export const sendPromptPayloadSchema = z.object({
  prompt: z.string().min(1).max(100_000),
  model: z.string(),
  agent: z.string().optional(),
});
export type SendPromptPayload = z.infer<typeof sendPromptPayloadSchema>;

export const webviewToHostSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ready') }),
  z.object({ kind: z.literal('send-prompt'), payload: sendPromptPayloadSchema }),
  z.object({ kind: z.literal('cancel') }),
  z.object({ kind: z.literal('new-session') }),
  z.object({ kind: z.literal('delete-session'), payload: z.object({ sessionId: z.string() }) }),
  z.object({ kind: z.literal('rerun') }),
]);
export type WebviewToHostMessage = z.infer<typeof webviewToHostSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Validates and narrows an arbitrary message; returns null if invalid. */
export function parseWebviewToHostMessage(raw: unknown): WebviewToHostMessage | null {
  const parsed = webviewToHostSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function parseHostToWebviewMessage(raw: unknown): HostToWebviewMessage | null {
  const parsed = hostToWebviewSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
