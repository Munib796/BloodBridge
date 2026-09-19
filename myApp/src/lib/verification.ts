/**
 * "I never got the verification email" — resending it.
 *
 * Only donors and requestors verify by email. Hospitals and organizations are
 * gated on admin approval instead and have no resend endpoint at all, which is
 * why the role here is its own narrow type rather than the app-wide UserRole:
 * it makes the unsupported case unrepresentable rather than a 404 at runtime.
 */

import { ApiError, api } from "./apiClient";
import { RATE_LIMIT_MESSAGE, describeWriteError } from "./errors";

export type ResendableRole = "donor" | "requestor";

const RESEND_PATHS: Record<ResendableRole, string> = {
  donor: "/donors/resend-verification",
  requestor: "/requestors/resend-verification",
};

/**
 * Ask the backend to send another verification link.
 *
 * Resolves on success. The endpoint answers the same way whether or not the
 * address exists — deliberately, so it can't be used to find out who has an
 * account — so a resolved promise means "the request was accepted", not "an
 * email is definitely on its way".
 */
export async function resendVerificationEmail(
  role: ResendableRole,
  email: string,
): Promise<void> {
  // Unauthenticated: the whole point is that this person can't log in yet.
  await api.post(RESEND_PATHS[role], { email }, { auth: false });
}

/**
 * Turn a failed resend into something worth showing a user.
 *
 * The 429 gets its own wording because this endpoint is limited to 3 requests
 * a minute; apiClient already unwraps slowapi's `{"error": "Rate limit
 * exceeded: 3 per 1 minute"}` into ApiError.detail — accurate, but it reads
 * like a log line and doesn't say what to do about it.
 *
 * Everything else goes through the shared write wording, so an unreachable
 * backend, a timeout and a request that was never sent each say which they were
 * instead of all surfacing as one connectivity message.
 */
export function resendErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 429) {
    return RATE_LIMIT_MESSAGE;
  }

  return describeWriteError(error, "Could not send the verification email. Please try again.");
}
