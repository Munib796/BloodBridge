/**
 * Donor record updates that aren't part of the auth flow.
 *
 * AuthContext owns the session; this owns edits a signed-in donor makes to
 * their own row. Both go through the same api client, and both return
 * `DonorOut`, so the caller can adopt what the server actually stored rather
 * than assume the value it just sent.
 */

import { ApiError, api } from "./apiClient";
import type { DonorProfile } from "./apiTypes";

/**
 * PATCH /donors/me/availability — the Available/Unavailable toggle.
 *
 * Going unavailable does NOT clear the donor's stored location: the backend
 * keeps the coordinates on purpose, so flipping back on doesn't force a fresh
 * GPS fix. It does stop them being notified about new requests and stops them
 * accepting one (assert_acceptor_eligible), but any commitment they already
 * hold survives.
 */
export async function setDonorAvailability(
  isAvailable: boolean,
): Promise<DonorProfile> {
  return api.patch<DonorProfile>("/donors/me/availability", {
    is_available: isAvailable,
  });
}

/**
 * Wording for a failed toggle. The donor's state is unchanged on failure, so
 * the message says that rather than leaving them guessing which way it ended up.
 */
export function availabilityErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    // A timeout and a request that was never built both leave status at 0, so
    // they have to be picked apart before the generic connectivity message.
    // Each still carries the "wasn't changed" promise, because a failed write
    // leaves the donor unsure which way the toggle ended up either way.
    if (error.isClientError) {
      return "That couldn't be sent — your availability wasn't changed.";
    }
    if (error.isTimeout) {
      return "BloodBridge didn't answer in time — your availability wasn't changed. Try again.";
    }
    if (error.isNetworkError) {
      return "Couldn't reach BloodBridge — your availability wasn't changed.";
    }
    // 401 is handled globally by the api client (it signs the session out), so
    // anything reaching here with a message is worth showing verbatim.
    return error.detail;
  }

  return "Couldn't update your availability. Please try again.";
}
