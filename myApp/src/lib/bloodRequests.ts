/**
 * Reading blood requests as a donor, and posting/reading them as a requestor.
 *
 * The donor calls take no location. GET /blood-requests/nearby/for-me reads the
 * donor's own stored coordinates, filters to blood types that can be given to
 * each request's recipient, keeps only requests whose current radius reaches
 * that location, and drops any the donor has already committed to.
 *
 * So there is nothing to send: "the donor's location" is whatever was last
 * saved to their record via PATCH /donors/me/location — not something the app
 * supplies, and not something it can substitute for.
 */

import { ApiError, api } from "./apiClient";
import { describeApiFailure, type ApiFailureKind } from "./errors";
import type {
  BloodRequest,
  NearbyBloodRequest,
  RequestMatchDetail,
  UrgencyLevel,
} from "./apiTypes";

export async function fetchNearbyRequests(): Promise<NearbyBloodRequest[]> {
  return api.get<NearbyBloodRequest[]>("/blood-requests/nearby/for-me");
}

/**
 * GET /blood-requests/{request_id} — one request, for the detail screen.
 *
 * Returns `BloodRequestOut`, which is the nearby shape minus `distance_km`.
 * There are no coordinates on either, so the detail screen has nothing to plot;
 * the distance it shows is the one the listing call measured, handed over as a
 * route param.
 */
export async function fetchRequest(requestId: string): Promise<BloodRequest> {
  return api.get<BloodRequest>(`/blood-requests/${encodeURIComponent(requestId)}`);
}

/**
 * Why the feed is empty of data, in a form the screen can branch on.
 *
 * `no-location` is worth its own kind because it is the one failure the donor
 * can actually fix, and the fix lives on a different screen. Everything else
 * keeps the kind `describeApiFailure` assigned — a timeout and a request that
 * was never sent are not the same problem as an unreachable backend.
 */
export type FeedErrorKind = "no-location" | ApiFailureKind;

export type FeedError = {
  kind: FeedErrorKind;
  message: string;
};

/**
 * Turn a failed feed request into something renderable.
 *
 * There is deliberately no fallback to the old hardcoded requests: a feed that
 * silently shows invented data during an outage is worse than one that admits
 * it failed, because a donor will act on it.
 */
export function describeFeedError(error: unknown): FeedError {
  // Keyed on the status, not on the message text: this endpoint's controller
  // has exactly one 400 (the missing-location guard), and matching a string
  // would break the branch the day someone rewords it.
  if (error instanceof ApiError && error.status === 400) {
    return { kind: "no-location", message: error.detail };
  }

  const failure = describeApiFailure(error, "Something went wrong loading nearby requests.");
  return { kind: failure.kind, message: failure.message };
}

/**
 * Why the single-request fetch failed.
 *
 * `unavailable` is separate from `server` because it is a settled answer rather
 * than a fault: retrying will not help, and the screen says so instead of
 * offering a button that cannot succeed.
 */
export type RequestDetailErrorKind = "unavailable" | ApiFailureKind;

export type RequestDetailError = {
  kind: RequestDetailErrorKind;
  message: string;
};

export function describeRequestError(error: unknown): RequestDetailError {
  // 404 covers everything the viewer may not see: never existed, already
  // fulfilled or cancelled, outside the radius, or a blood type this donor
  // cannot give. The backend answers 404 rather than 403 on purpose, so a
  // request ID can't be probed to confirm a patient exists — which means this
  // branch is a real state, not an exceptional one: a request can be filled
  // by someone else while the donor is sitting on this screen.
  if (error instanceof ApiError && error.status === 404) {
    return { kind: "unavailable", message: error.detail };
  }

  const failure = describeApiFailure(error, "Something went wrong loading this request.");
  return { kind: failure.kind, message: failure.message };
}

// --- Requestor side --------------------------------------------------------

/**
 * GET /blood-requests/mine — the requests this requestor/organization posted,
 * newest first.
 *
 * No `status` filter is sent: the two screens want different slices of the same
 * list (home takes the in-flight ones, history takes everything and buckets
 * them), so one unfiltered fetch serves both and the split happens in the app.
 * Re-requesting on every tab press would be a round trip to learn what the
 * screen already holds.
 *
 * `limit` is the endpoint's maximum of 100. There is no pagination here, so a
 * poster with more than 100 requests would silently lose the oldest from the
 * tail of their history — worth wiring to an actual pager before that is a
 * realistic number.
 */
export async function fetchMyRequests(): Promise<BloodRequest[]> {
  return api.get<BloodRequest[]>("/blood-requests/mine?limit=100");
}

/**
 * BloodRequestCreate — src/blood_requests/dtos.py, the body of POST
 * /blood-requests.
 *
 * Field-by-field, the backend is stricter than it looks:
 *
 *   hospital_name — `Name | None`, and `Name` strips then rejects a blank
 *     string. So "no hospital" has to be `null`; sending "" is a 422, not a
 *     request that quietly goes out unverified.
 *   required_by — `FutureDatetime`, rejected if it is not later than the
 *     server's clock. Built at submit time from `Date.now()`, not at render,
 *     so a form left open for an hour doesn't submit an already-past deadline.
 *   area_label — `Label`, min length 1 after stripping. The reverse geocoder
 *     returns "" when it fails, so this must be caught before submitting.
 */
export type NewBloodRequest = {
  patient_name: string;
  blood_type_needed: string;
  units_needed: number;
  urgency_level: UrgencyLevel;
  required_by: string;
  hospital_name: string | null;
  contact_phone: string;
  latitude: number;
  longitude: number;
  area_label: string;
};

/**
 * POST /blood-requests.
 *
 * The status it comes back with is not the caller's to choose: the controller
 * matches `hospital_name` against approved hospitals, and a request that names
 * one is created as PENDING_VERIFICATION — donors are told nothing until that
 * hospital approves it. An unmatched or absent name goes out as ACTIVE
 * immediately.
 */
export async function createBloodRequest(payload: NewBloodRequest): Promise<BloodRequest> {
  return api.post<BloodRequest>("/blood-requests", payload);
}

/**
 * GET /blood-requests/{request_id}/matches — who committed to this request.
 *
 * Poster-facing: `assert_can_view_commitments` narrows this to the poster, the
 * verifying hospital and an admin, answering 404 (not 403) for anyone else so
 * a request ID can't be probed. A donor never reaches this — they get their own
 * commitment from /request-matches/mine, and are never shown who else signed up.
 *
 * Unfiltered on status: settled commitments come back alongside open ones, so
 * the screen can show a donor who dropped out rather than having them vanish.
 */
export async function fetchRequestCommitments(
  requestId: string,
): Promise<RequestMatchDetail[]> {
  return api.get<RequestMatchDetail[]>(
    `/blood-requests/${encodeURIComponent(requestId)}/matches`,
  );
}

/**
 * PATCH /blood-requests/{request_id}/widen-radius.
 *
 * An empty body on purpose. `WidenRadiusRequest.to_radius_km` is optional, and
 * omitting it is what makes the backend apply its own step
 * (RADIUS_WIDEN_STEP_KM, 10 km) and clamp the result — sending a number would
 * take the other branch, which rejects any value below the current radius with
 * a 400. The `{}` is not decorative: FastAPI requires the body to be present,
 * since the DTO itself is a required parameter even though every field in it
 * has a default.
 *
 * Only an open request can be widened. A fulfilled, fully-matched or
 * pending-verification one answers 400 with the status named in the detail.
 */
export async function widenRequestRadius(requestId: string): Promise<BloodRequest> {
  return api.patch<BloodRequest>(
    `/blood-requests/${encodeURIComponent(requestId)}/widen-radius`,
    {},
  );
}

/**
 * PATCH /blood-requests/{request_id}/cancel.
 *
 * `reason` is optional (`CancelRequest.reason: Reason | None`), so an empty box
 * becomes null rather than a blank string that reads as a reason on the
 * donors' side. Cancelling also cancels every open commitment on the request
 * — which is a real consequence for people who agreed to donate, hence the
 * confirmation in front of this.
 */
export async function cancelBloodRequest(
  requestId: string,
  reason: string,
): Promise<BloodRequest> {
  const trimmed = reason.trim();

  return api.patch<BloodRequest>(
    `/blood-requests/${encodeURIComponent(requestId)}/cancel`,
    { reason: trimmed.length > 0 ? trimmed : null },
  );
}

// Failures for the two writes above are worded by `describeWriteError` in
// ./errors — the same "nothing was changed" phrasing every other write uses.
// The backend's `detail` is passed through verbatim there because these
// endpoints answer 400 with the specific reason ("Only an open request can be
// widened (status: fulfilled)"), and assuming success is exactly what these
// messages exist to prevent: a poster who believes a broadcast was widened
// stops looking for donors.
