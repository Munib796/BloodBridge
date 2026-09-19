/**
 * A match's chat thread: message history over REST, and the live
 * WebSocket connection for sending/receiving in real time.
 *
 * REST and the socket are deliberately separate paths rather than one
 * "chat client" class: history is a one-shot GET the screen awaits before it
 * renders anything, while the socket is a long-lived connection the screen
 * owns for its own lifetime. Keeping them as plain functions matches how
 * every other lib module here works (bloodRequests.ts, requestMatches.ts) —
 * the screen holds the state, this module only knows how to talk to the API.
 */

import { API_BASE_URL, ApiError, api, getAuthToken } from "./apiClient";
import { describeApiFailure, describeWriteError, type ApiFailure } from "./errors";
import type { ChatMessage, ChatThreadSummary } from "./apiTypes";

export const MAX_CHAT_MESSAGE_LENGTH = 2000;

// --- REST --------------------------------------------------------------

/** GET /chat/threads — every conversation this account is part of. */
export async function fetchThreads(): Promise<ChatThreadSummary[]> {
  return api.get<ChatThreadSummary[]>("/chat/threads");
}

/** GET /chat/{match_id}/messages — full history, oldest first. */
export async function fetchMessages(matchId: string): Promise<ChatMessage[]> {
  return api.get<ChatMessage[]>(`/chat/${encodeURIComponent(matchId)}/messages`);
}

/**
 * POST /chat/{match_id}/messages.
 *
 * The fallback path for when the socket isn't open: unlike a socket send,
 * this endpoint does not broadcast to the other participant's live
 * connection (only the WebSocket handler does), but it does persist the
 * message and hand back the saved row, which is enough for the sender's own
 * screen to show it immediately. The other side picks it up next time they
 * load history or reconnect.
 */
export async function sendMessageRest(matchId: string, content: string): Promise<ChatMessage> {
  return api.post<ChatMessage>(`/chat/${encodeURIComponent(matchId)}/messages`, { content });
}

export function describeChatLoadError(error: unknown): ApiFailure {
  return describeApiFailure(error, "Couldn't load this conversation.");
}

export function describeChatSendError(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) {
    return "This conversation is no longer available.";
  }
  return describeWriteError(error, "That message couldn't be sent.");
}

// --- WebSocket -----------------------------------------------------------

/**
 * ws(s)://.../chat/ws/{match_id}?token=...
 *
 * Browsers (and RN's WebSocket) can't set an Authorization header on the
 * handshake, so the token travels as a query param instead — the same
 * approach the backend's router comment describes. API_BASE_URL is an
 * http(s) URL because every other client in the app is REST; only the
 * scheme changes here.
 */
export function buildChatSocketUrl(matchId: string, token: string): string {
  const httpUrl = new URL(`/chat/ws/${encodeURIComponent(matchId)}`, API_BASE_URL);
  httpUrl.protocol = httpUrl.protocol === "https:" ? "wss:" : "ws:";
  httpUrl.searchParams.set("token", token);
  return httpUrl.toString();
}

/** Convenience for callers that already went through AuthContext and just
 *  want "the token to open a socket with", without importing apiClient
 *  directly. Returns null if somehow called while signed out. */
export function currentChatToken(): string | null {
  return getAuthToken();
}

/**
 * A frame the server can send down the socket that isn't a chat message —
 * the flood guard and a mid-conversation auth failure both look like this.
 */
export type ChatSocketErrorFrame = { error: string };

export function isChatSocketErrorFrame(payload: unknown): payload is ChatSocketErrorFrame {
  return (
    !!payload &&
    typeof payload === "object" &&
    typeof (payload as Record<string, unknown>).error === "string" &&
    !("id" in (payload as Record<string, unknown>))
  );
}
