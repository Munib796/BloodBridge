/**
 * Failure wording shared by every module that turns an ApiError into something
 * a screen can render.
 *
 * The same "couldn't reach the backend" sentence was about to be written for a
 * third time — once for the nearby feed, once for a single request, once for
 * the commitment list — and three copies of a sentence drift.
 */

import { ApiError } from "./apiClient";

/** A transport failure on a read, phrased so the donor knows it is the connection. */
export const OFFLINE_MESSAGE =
  "Couldn't reach BloodBridge. Check your connection and make sure the backend is running.";

/**
 * A failed write leaves the user genuinely unsure whether their change landed,
 * so the write variants settle that instead of only reporting the connection.
 */
export const WRITE_OFFLINE_MESSAGE =
  "Couldn't reach BloodBridge — nothing was changed. Check your connection and make sure the backend is running.";

/** The server accepted the request but didn't finish answering in time. */
export const TIMEOUT_MESSAGE =
  "BloodBridge didn't finish answering in time. Check your connection and try again.";

export const WRITE_TIMEOUT_MESSAGE =
  "BloodBridge didn't finish answering in time — nothing was changed. Check your connection and try again.";

/**
 * The request was never sent — this side built it wrong.
 *
 * Worth its own wording because the fix is different in kind: there is nothing
 * the user can do, and reporting it as "couldn't reach BloodBridge" sent people
 * to check a backend that was running perfectly while the real bug sat in a
 * request that never left the app.
 */
export const CLIENT_MESSAGE =
  "That couldn't be sent — nothing was changed. This is a problem in the app, not your connection.";

export type ApiFailureKind = "offline" | "timeout" | "client" | "server";

export type ApiFailure = {
  kind: ApiFailureKind;
  message: string;
};

/** One message per way a request can produce no response at all. */
type StatusZeroMessages = Record<Exclude<ApiFailureKind, "server">, string>;

const READ_MESSAGES: StatusZeroMessages = {
  offline: OFFLINE_MESSAGE,
  timeout: TIMEOUT_MESSAGE,
  client: CLIENT_MESSAGE,
};

const WRITE_MESSAGES: StatusZeroMessages = {
  offline: WRITE_OFFLINE_MESSAGE,
  timeout: WRITE_TIMEOUT_MESSAGE,
  client: CLIENT_MESSAGE,
};

/**
 * Classify a status-0 ApiError by *why* nothing came back.
 *
 * Order matters: every one of these leaves `status` at 0, so `isNetworkError`
 * is true for all of them. Testing it first is exactly what used to collapse a
 * timeout — and a request that was never built — into "couldn't reach the
 * backend", which is the message that sends someone to check a server that is
 * running fine.
 *
 * Returns null when the server did answer, leaving the caller to handle the
 * status it actually sent.
 */
function statusZeroFailure(error: ApiError, messages: StatusZeroMessages): ApiFailure | null {
  if (error.isClientError) {
    return { kind: "client", message: messages.client };
  }
  if (error.isTimeout) {
    return { kind: "timeout", message: messages.timeout };
  }
  if (error.isNetworkError) {
    return { kind: "offline", message: messages.offline };
  }
  return null;
}

/**
 * Classify whatever a failed call threw.
 *
 * Modules with domain-specific failures to distinguish — a missing location, a
 * request that is no longer visible — branch on the status themselves and only
 * fall through to this for the generic cases.
 */
export function describeApiFailure(error: unknown, fallbackMessage: string): ApiFailure {
  if (error instanceof ApiError) {
    const statusZero = statusZeroFailure(error, READ_MESSAGES);
    if (statusZero) return statusZero;

    // Whatever the backend said. Its HTTPException details are written for a
    // person to read, and a 401 never reaches here — the api client signs the
    // session out before the caller sees it.
    return { kind: "server", message: error.detail };
  }

  return { kind: "server", message: fallbackMessage };
}

/**
 * Wording for a failed PATCH or POST whose effect matters.
 *
 * The backend's `detail` is passed through verbatim: these endpoints answer 400
 * with the specific reason, 413 for an oversized upload and 415 for a file type
 * it won't take, and all of those sentences are more useful than anything this
 * module could infer from the status code. Callers that need the per-field
 * breakdown use `fieldErrorsFrom` from the api client instead, and fall back to
 * this for everything else.
 *
 * The one exception is 429, where slowapi's raw detail reads like a log line —
 * see RATE_LIMIT_MESSAGE.
 */
export function describeWriteError(error: unknown, fallbackMessage: string): string {
  if (error instanceof ApiError) {
    const statusZero = statusZeroFailure(error, WRITE_MESSAGES);
    if (statusZero) return statusZero.message;

    if (error.status === 429) {
      return RATE_LIMIT_MESSAGE;
    }
    return error.detail;
  }

  return fallbackMessage;
}

/**
 * slowapi answers 429 for every rate-limited endpoint, and apiClient unwraps
 * its `{"error": "Rate limit exceeded: 3 per 1 minute"}` into ApiError.detail.
 * That is accurate but reads like a log line, and it doesn't say what to do —
 * so every rate-limited call the app makes shares this wording.
 */
export const RATE_LIMIT_MESSAGE =
  "Too many requests. Please wait a minute before trying again.";
