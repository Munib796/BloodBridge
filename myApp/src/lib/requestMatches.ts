/**
 * The donor's commitments — accepting one, listing them, and ending one.
 *
 * Accept is the heaviest write in the app: in one transaction the backend
 * reserves units against the request, records the match, and opens a chat
 * thread between the donor and the coordinator. It is rate-limited to
 * 20/minute, and a second attempt on the same request is rejected by a partial
 * unique index (409) rather than silently duplicating.
 *
 * The other three are the lifecycle of that commitment. All four return the
 * same `RequestMatchDetailOut`, so callers can adopt the response as the new
 * truth for that row rather than refetching to find out what changed —
 * `cancel` and `complete` in particular hand back the row already moved to its
 * new status.
 */

import { ApiError, api } from "./apiClient";
import { describeApiFailure, type ApiFailure } from "./errors";
import type { RequestMatchDetail } from "./apiTypes";

/** What the donor agreed to in the confirmation sheet. */
export type Commitment = {
  /** Never more than the request still needs, nor than the API's MAX_UNITS. */
  units: number;
  /** Minutes from now — turned into an absolute `eta` below. */
  arrivalMinutes: number;
};

/**
 * POST /request-matches/{request_id}/accept.
 *
 * `eta` is typed `FutureDatetime` on the backend and validated with
 * `_must_be_future`, so it has to be an absolute timestamp later than the
 * server's clock, not a duration. A relative "in 30 minutes" sent as-is would
 * 422. The offset is built from the *device* clock, so it is only as good as
 * the device's time; a badly skewed clock gets a 422 naming the field.
 */
export async function acceptRequest(
  requestId: string,
  commitment: Commitment,
): Promise<RequestMatchDetail> {
  const eta = new Date(Date.now() + commitment.arrivalMinutes * 60_000).toISOString();

  return api.post<RequestMatchDetail>(
    `/request-matches/${encodeURIComponent(requestId)}/accept`,
    { units_committed: commitment.units, eta },
  );
}

export type AcceptError = {
  message: string;
  /**
   * True when the fix is one tap away — the donor is marked unavailable, and
   * switching back on is what unblocks them.
   */
  canSwitchToAvailable: boolean;
};

/**
 * Turn a failed accept into something the sheet can render.
 *
 * The backend's `detail` is already written for a person to read, so it is
 * passed through verbatim in every case. What this adds is the one branch where
 * the donor can do something about it.
 */
export function describeAcceptError(
  error: unknown,
  options: { donorIsAvailable: boolean },
): AcceptError {
  if (!(error instanceof ApiError)) {
    return {
      message: "Something went wrong accepting this request.",
      canSwitchToAvailable: false,
    };
  }

  // Ordered deliberately. A timeout and a request that was never built both
  // leave status at 0, so they have to be picked apart before the generic
  // connectivity branch — otherwise every one of them tells the donor to go and
  // check a backend that was never asked anything.
  if (error.isClientError) {
    return {
      message: "That couldn't be sent — the request was not accepted.",
      canSwitchToAvailable: false,
    };
  }

  if (error.isTimeout) {
    return {
      message: "BloodBridge didn't answer in time — the request was not accepted.",
      canSwitchToAvailable: false,
    };
  }

  if (error.isNetworkError) {
    return {
      // Deliberately not "try again" — the request may or may not have gone
      // through, and the donor should check the feed rather than assume.
      message: "Couldn't reach BloodBridge — the request was not accepted.",
      canSwitchToAvailable: false,
    };
  }

  // Keyed on the donor's own availability rather than on the message text.
  // assert_acceptor_eligible checks availability *first*, before blood type,
  // location and radius, so an unavailable donor's 403 is always this one — and
  // matching on a string would break the day someone rewords it.
  //
  // The profile is a local copy and can be stale (a toggle made on another
  // device), so this is a best-effort hint rather than a guarantee: the real
  // reason is in `message` regardless, and the worst case is offering a button
  // that sets them available when they already are.
  const canSwitchToAvailable = error.status === 403 && !options.donorIsAvailable;

  return { message: error.detail, canSwitchToAvailable };
}

/**
 * GET /request-matches/mine — every commitment this donor holds, open or
 * settled.
 *
 * No status filter and no pagination on the backend: it returns the lot, most
 * recently accepted first. The screen splits them into Live / Completed /
 * Cancelled itself.
 *
 * A settled commitment stays readable here for good — `_get_owned_match` scopes
 * on the donor's own id, so a match does not vanish when its request closes or
 * is fulfilled. That is the point: this is the donor's record of what they did.
 */
export async function fetchMyMatches(): Promise<RequestMatchDetail[]> {
  return api.get<RequestMatchDetail[]>("/request-matches/mine");
}

/**
 * PATCH /request-matches/{match_id}/cancel.
 *
 * `reason` is optional on the backend (`MatchCancel.reason: Reason | None`).
 * Whitespace is trimmed here rather than sent through, and an empty box becomes
 * null instead of "" — so the database stores "no reason given", not a blank
 * string that reads as one on the coordinator's side.
 *
 * Cancelling releases the reserved units back to the request, which reopens it
 * for other donors. That is a real consequence for a patient, which is why the
 * screen confirms before calling this.
 */
export async function cancelMatch(matchId: string, reason: string): Promise<RequestMatchDetail> {
  const trimmed = reason.trim();

  return api.patch<RequestMatchDetail>(
    `/request-matches/${encodeURIComponent(matchId)}/cancel`,
    { reason: trimmed.length > 0 ? trimmed : null },
  );
}

/**
 * PATCH /request-matches/{match_id}/complete.
 *
 * No body: the endpoint takes none. Completion is what marks the parent request
 * FULFILLED once nothing is outstanding against it, so this is the donor's
 * "I've given blood" signal, not just a status flag.
 */
export async function completeMatch(matchId: string): Promise<RequestMatchDetail> {
  return api.patch<RequestMatchDetail>(
    `/request-matches/${encodeURIComponent(matchId)}/complete`,
  );
}

/**
 * Turn a failed cancel or complete into something renderable.
 *
 * 400 is worth its own branch because it is not a fault: `_assert_open` answers
 * `"Match is already cancelled"` when the donor has already settled this
 * commitment, most likely on another device or in a stale tab. Retrying can
 * never fix that, and the right move is to re-read the list.
 */
export type MatchActionError = ApiFailure & {
  /** True when the row moved under us — refetch rather than retry. */
  stale: boolean;
};

export function describeMatchActionError(
  error: unknown,
  fallbackMessage: string,
): MatchActionError {
  const failure = describeApiFailure(error, fallbackMessage);

  return { ...failure, stale: error instanceof ApiError && error.status === 400 };
}
