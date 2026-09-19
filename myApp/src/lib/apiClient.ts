/**
 * The app's single HTTP entry point.
 *
 * Every call to the BloodBridge backend goes through `apiRequest`, so the base
 * URL, the bearer header and the error shape are each defined exactly once. A
 * screen that calls `fetch` directly re-implements all three, and drifts.
 */

/**
 * Where the backend lives.
 *
 * A physical phone running Expo Go cannot reach the dev machine's "localhost"
 * — that resolves to the phone itself — so this has to be the machine's LAN
 * address, and the phone has to be on the same network. Point it elsewhere by
 * setting EXPO_PUBLIC_API_URL in myApp/.env (Expo inlines EXPO_PUBLIC_* at
 * build time, so a change needs a restart, not just a fast refresh).
 */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "http://192.168.100.5:8000";

/** How long to wait before giving up on a request. `fetch` has no default
 *  timeout, so a request to an unreachable host otherwise hangs forever and
 *  leaves the screen spinning with no error to show. */
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * How long to wait on a file upload.
 *
 * The default is sized for a JSON round trip; a multi-megabyte photo over a
 * phone's connection can take far longer than that to leave the device, and
 * aborting the request in the middle looks to the user exactly like the backend
 * being down.
 */
export const UPLOAD_TIMEOUT_MS = 60_000;

type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export type RequestOptions = {
  method?: HttpMethod;
  /** Serialised as JSON, unless it is a FormData (file uploads). */
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Set false for endpoints that must not carry a token (login, signup). */
  auth?: boolean;
};

/**
 * Why a request produced no response at all.
 *
 * `timeout`, `cancelled` and `unreachable` all leave `status` at 0, so without
 * this they are indistinguishable to a caller. Worse, `client` — a request that
 * was never sent because this side built it wrong — is also a status 0, which
 * means a bug in the app reports itself as a dead network. That conflation is
 * what makes this class of failure expensive to diagnose.
 */
export type ApiErrorReason = "timeout" | "cancelled" | "unreachable" | "client";

/**
 * A failed request, normalised.
 *
 * `status` is 0 when the request never produced a response. Callers should
 * treat that as "can't tell", not as "rejected", because the two need different
 * messages and different retry behaviour — and they should read `reason` to
 * find out which kind of nothing happened.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;
  readonly body: unknown;
  /** Set only when `status` is 0; null whenever the server actually answered. */
  readonly reason: ApiErrorReason | null;

  constructor(
    status: number,
    detail: string,
    body: unknown = null,
    reason: ApiErrorReason | null = null,
  ) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    this.body = body;
    this.reason = reason;
  }

  /** Nothing came back — for any reason, including a bug on this side. */
  get isNetworkError(): boolean {
    return this.status === 0;
  }

  /** The server didn't answer in time. */
  get isTimeout(): boolean {
    return this.reason === "timeout";
  }

  /** The caller aborted it — a screen unmounting, not a failure. */
  get isCancelled(): boolean {
    return this.reason === "cancelled";
  }

  /**
   * The request was never sent: this side built it wrong. A bug to fix, not a
   * connectivity problem to retry through.
   */
  get isClientError(): boolean {
    return this.reason === "client";
  }

  /** The token is missing, expired, or was invalidated by a password reset. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

// --- Auth token ------------------------------------------------------------
// Held in memory rather than read from SecureStore on every request: a
// keychain read per call is real latency for a value that only changes at
// login and logout. AuthContext hydrates this before it renders anything, so
// no request can be issued with the token still unset.

let currentToken: string | null = null;

export function setAuthToken(token: string | null): void {
  currentToken = token;
}

export function getAuthToken(): string | null {
  return currentToken;
}

// --- Unauthorized handler --------------------------------------------------
// A password reset invalidates every token issued before it, so a stored token
// can go stale while the app is running. Without this, the app sits in a
// zombie state: logged in as far as it knows, 401ing on every request.

let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

// --- Error message extraction ----------------------------------------------

/**
 * The field a FastAPI validation error refers to: ["body", "email"] -> "email".
 *
 * The location segment every body error carries ("body"; occasionally "query"
 * or "path") is dropped, so what comes back lines up with the DTO field name
 * the form already uses.
 */
function fieldFromLoc(loc: unknown): string | null {
  if (!Array.isArray(loc)) return null;
  const parts = loc.filter((part) => part !== "body");
  return parts.length ? parts.join(".") : null;
}

/**
 * Pull a human-readable message out of whatever the backend returned.
 *
 * Three shapes come back from this API, which is why this can't just read
 * `detail`:
 *
 *   {"detail": "Invalid credentials"}            — HTTPException
 *   {"detail": [{"loc": [...], "msg": "..."}]}   — FastAPI 422 validation
 *   {"error": "Rate limit exceeded: ..."}        — slowapi's 429 handler
 *
 * The 422 case is an array, so reading it as a string would surface
 * "[object Object]" to the user on every validation error.
 */
function extractMessage(body: unknown, status: number): string {
  if (typeof body === "string" && body.trim()) {
    return body.trim();
  }

  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;

    const detail = record.detail;
    if (typeof detail === "string" && detail.trim()) {
      return detail;
    }
    if (Array.isArray(detail)) {
      const messages = detail
        .map((entry) => {
          if (typeof entry === "string") return entry;
          if (entry && typeof entry === "object") {
            const msg = (entry as Record<string, unknown>).msg;
            // The field name is what makes a validation error actionable —
            // "Must be a timestamp in the future" alone doesn't say which field.
            const field = fieldFromLoc((entry as Record<string, unknown>).loc);
            if (typeof msg === "string") return field ? `${field}: ${msg}` : msg;
          }
          return null;
        })
        .filter((message): message is string => Boolean(message));

      if (messages.length) {
        return messages.join("\n");
      }
    }

    const error = record.error;
    if (typeof error === "string" && error.trim()) {
      return error;
    }
    if (typeof record.message === "string" && record.message.trim()) {
      return record.message;
    }
  }

  // Nothing usable — fall back to the status so the user sees something true
  // rather than an empty alert.
  return `Request failed (${status})`;
}

/**
 * Validation errors keyed by field name, for rendering against the input that
 * caused them.
 *
 * Only a 422 carries this structure. A 400 with a plain string detail — which
 * is what "Email already registered" is — returns an empty object, because
 * there is no field to attach it to; the caller should show that as a general
 * message instead.
 *
 * The field names are the backend's DTO field names (`full_name`, `email`,
 * `phone`, `password`, `blood_type`), which is why the form state uses them as
 * its keys.
 */
export function fieldErrorsFrom(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {};

  const detail = (error.body as { detail?: unknown } | null)?.detail;
  if (!Array.isArray(detail)) return {};

  const errors: Record<string, string> = {};

  for (const entry of detail) {
    if (!entry || typeof entry !== "object") continue;

    const { loc, msg } = entry as { loc?: unknown; msg?: unknown };
    if (typeof msg !== "string") continue;

    const field = fieldFromLoc(loc);
    // First message per field wins. Stacking every rule a value broke leaves
    // the user reading a paragraph to fix one input.
    if (field && !errors[field]) {
      errors[field] = msg;
    }
  }

  return errors;
}

// --- Request ---------------------------------------------------------------

/**
 * Serialise the body and declare its content type.
 *
 * Separate from `apiRequest` so a failure here — a circular object reaching
 * JSON.stringify, a malformed multipart part — can be reported as a bug on this
 * side rather than as a network error, which is what it used to look like.
 */
function buildRequestBody(
  body: unknown,
  method: HttpMethod,
  requestHeaders: Record<string, string>,
): BodyInit | undefined {
  if (body instanceof FormData) {
    // Left alone deliberately. Setting Content-Type here would omit the
    // multipart boundary fetch generates, and the upload would arrive
    // unparseable — this is how the profile-pic and logo endpoints work.
    return body;
  }

  if (body !== undefined) {
    requestHeaders["Content-Type"] = "application/json";
    return JSON.stringify(body);
  }

  if (method !== "GET") {
    // A bodyless PATCH still declares its type; FastAPI rejects some of these
    // with 422 when the header is absent.
    requestHeaders["Content-Type"] = "application/json";
  }

  return undefined;
}

type TextResponse = { status: number; ok: boolean; text: string };

function sendFormDataWithNativeXhr(
  url: string,
  method: HttpMethod,
  headers: Record<string, string>,
  body: FormData,
  signal: AbortSignal,
): Promise<TextResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();

    xhr.open(method, url, true);
    Object.entries(headers).forEach(([name, value]) => xhr.setRequestHeader(name, value));
    xhr.onload = () => resolve({ status: xhr.status, ok: xhr.status >= 200 && xhr.status < 300, text: xhr.responseText });
    xhr.onerror = () => reject(new Error("The multipart request could not reach the server."));
    xhr.ontimeout = () => reject(new Error("The multipart request timed out."));
    xhr.onabort = () => reject(new Error("The multipart request was cancelled."));
    signal.addEventListener("abort", abort, { once: true });
    xhr.send(body);
  });
}

/**
 * Call the API and return the parsed body.
 *
 * Throws ApiError on any non-2xx response and on network failure, so callers
 * only ever need one catch. `T` is the caller's assertion about the response —
 * nothing here validates it against a schema.
 */
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const {
    method = "GET",
    body,
    headers = {},
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    auth = true,
  } = options;

  // --- Build. Failures here never touch the network. -----------------------
  // url is computed outside the guard because concatenating a string cannot
  // fail; only serialising the body can.
  const url = path.startsWith("http") ? path : `${API_BASE_URL}${path}`;
  const requestHeaders: Record<string, string> = { ...headers };
  let requestBody: BodyInit | undefined;

  try {
    requestBody = buildRequestBody(body, method, requestHeaders);

    if (auth && currentToken) {
      requestHeaders.Authorization = `Bearer ${currentToken}`;
    }
  } catch (cause) {
    // Logged with the cause, because the whole point of this branch is that
    // somebody has to fix the code that produced it.
    console.warn(`[api] Could not build ${method} ${path} — the request was never sent.`, cause);
    throw new ApiError(
      0,
      `Could not build the ${method} request to ${path}, so it was never sent.`,
      cause,
      "client",
    );
  }

  // --- Send. ---------------------------------------------------------------
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  // A caller-supplied signal (screen unmount) must also cancel the request,
  // so it is chained rather than replacing the timeout's controller.
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener("abort", abortFromCaller);

  let response: TextResponse;
  try {
    if (body instanceof FormData) {
      response = await sendFormDataWithNativeXhr(url, method, requestHeaders, body, controller.signal);
    } else {
      const fetchResponse = await fetch(url, {
        method,
        headers: requestHeaders,
        body: requestBody,
        signal: controller.signal,
      });
      response = { status: fetchResponse.status, ok: fetchResponse.ok, text: await fetchResponse.text() };
    }
  } catch (cause) {
    // fetch only rejects for transport-level failures, so everything reaching
    // here is a status-0 ApiError. Which kind depends on who aborted, and on
    // whether React Native's native layer rejected the body rather than the
    // connection — the last case is why the reason is logged rather than
    // guessed at.
    const cancelledByCaller = signal?.aborted ?? false;
    const aborted = controller.signal.aborted;
    const reason: ApiErrorReason = cancelledByCaller
      ? "cancelled"
      : aborted
        ? "timeout"
        : "unreachable";

    console.warn(`[api] ${method} ${url} produced no response (${reason}).`, cause);

    throw new ApiError(
      0,
      reason === "timeout"
        ? `${method} ${path} timed out after ${Math.round(timeoutMs / 1000)}s with no response from ${API_BASE_URL}.`
        : `Could not reach the server at ${API_BASE_URL}. Check that it is running and on the same network.`,
      cause,
      reason,
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
  }

  const raw = response.text;
  let parsed: unknown = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Not JSON — an HTML error page from a proxy, most likely. Kept as a
      // string so extractMessage can still surface it.
      parsed = raw;
    }
  }

  if (!response.ok) {
    const error = new ApiError(
      response.status,
      extractMessage(parsed, response.status),
      parsed,
    );
    // Fire after the error is built, so a handler that navigates away can't
    // swallow the rejection the caller is about to see.
    if (error.isUnauthorized) {
      onUnauthorized?.();
    }
    throw error;
  }

  // 204, or a 200 with an empty body — `undefined` is the honest result.
  return parsed as T;
}

// --- Convenience wrappers --------------------------------------------------
// Thin, but they mean a screen reads `api.get<DonorOut>("/donors/me")` rather
// than restating the method on every call.

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...options, method: "GET" }),

  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...options, method: "POST", body }),

  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...options, method: "PATCH", body }),

  delete: <T>(path: string, options?: Omit<RequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...options, method: "DELETE" }),
};
