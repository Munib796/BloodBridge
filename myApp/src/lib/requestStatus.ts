/**
 * How a request's status is presented, and how the statuses group.
 *
 * Three screens now render request statuses — the donor's detail screen, the
 * requestor's home, and the requestor's history — and each of them was about
 * to grow its own label table. A status renamed on the backend would then have
 * to be found in three places, and the one that got missed would show donors
 * and requestors different words for the same row.
 */

import type { RequestStatus } from "./apiTypes";

/** RequestStatus — src/utils/enums.py, in the backend's own order. */
export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  draft: "Draft",
  pending_verification: "Awaiting Verification",
  active: "Active",
  partially_matched: "Partially Matched",
  fully_matched: "Fully Matched",
  fulfilled: "Fulfilled",
  closed: "Closed",
  rejected: "Rejected",
  expired: "Expired",
  cancelled: "Cancelled",
};

/**
 * The statuses a requestor still has something to do about.
 *
 * Deliberately not the backend's `OPEN_STATUSES`, which is only
 * (ACTIVE, PARTIALLY_MATCHED) — that tuple answers "can units still be
 * released against this?", which is a different question from "is this still
 * on my plate?". Both extra members belong on the home screen:
 *
 *   pending_verification — a hospital-backed request waiting on the hospital.
 *     No donor has been told about it yet, so it needs *more* attention than
 *     an active one, not less, and hiding it would leave the poster staring at
 *     an empty screen wondering where their request went.
 *   fully_matched — every unit is committed, but nobody has donated yet. It is
 *     not finished, and the poster is the one who finds out if a donor drops
 *     out.
 *
 * A settled request leaves this set and moves to the history screen.
 */
export const IN_FLIGHT_STATUSES: readonly RequestStatus[] = [
  "pending_verification",
  "active",
  "partially_matched",
  "fully_matched",
];

const IN_FLIGHT = new Set<RequestStatus>(IN_FLIGHT_STATUSES);

export function isInFlight(status: RequestStatus): boolean {
  return IN_FLIGHT.has(status);
}

/**
 * The statuses in which the platform is actually alerting donors — the
 * backend's own `OPEN_STATUSES`, and the condition `list_nearby_for_donor` and
 * `widen_radius` both apply.
 *
 * Narrower than "in flight" in both directions, which is why it is a separate
 * set: a pending_verification request is on the poster's plate but has reached
 * nobody, and a fully_matched one has reached everybody it needs to. Copy that
 * claims to be "searching nearby donors" is only true here.
 */
export const BROADCASTING_STATUSES: readonly RequestStatus[] = ["active", "partially_matched"];

const BROADCASTING = new Set<RequestStatus>(BROADCASTING_STATUSES);

export function isBroadcasting(status: RequestStatus): boolean {
  return BROADCASTING.has(status);
}

/**
 * Statuses from which nothing more can happen — the backend's own
 * TERMINAL_STATUSES (src/utils/constants.py). No cancelling, no widening, no
 * reactivating.
 *
 * Deliberately not the complement of OPEN_STATUSES, and the gap between the two
 * is why the requestor's detail screen needs two separate gates rather than
 * one: `pending_verification` and `fully_matched` are neither open nor
 * terminal. They cannot be widened — `widen_radius` refuses anything outside
 * OPEN_STATUSES — but they can still be cancelled.
 */
export const TERMINAL_STATUSES: readonly RequestStatus[] = [
  "fulfilled",
  "closed",
  "cancelled",
  "rejected",
];

const TERMINAL = new Set<RequestStatus>(TERMINAL_STATUSES);

export function isTerminal(status: RequestStatus): boolean {
  return TERMINAL.has(status);
}

/**
 * Can the requestor's detail screen offer the Cancel action?
 *
 * Deliberately narrower than what the backend allows, and the two are worth
 * keeping straight. `cancel_request` refuses only TERMINAL_STATUSES, so it
 * would accept a cancel on an expired request, and that does real work:
 * `cancel_open_matches` releases units still held by donors who committed
 * before the deadline ran out.
 *
 * The app stops offering it there anyway. An expired request is over — it is
 * no longer broadcast, it will never be fulfilled, and a Cancel button
 * underneath "this request expired" reads as though the poster is being asked
 * to finish something that already ran out of time. Treating expiry as settled
 * is the app's call, not the API's; the server would still honour the request.
 *
 * Everything else outside TERMINAL_STATUSES keeps its Cancel. Widening is the
 * narrower action — it needs the request to still be broadcasting — so the two
 * gates are genuinely different sets, which is why they are separate functions.
 */
export function canBeCancelled(status: RequestStatus): boolean {
  return !isTerminal(status) && status !== "expired";
}

/**
 * What a request's status means, in a sentence.
 *
 * Wording rule: these describe the *status*, never what the poster may or may
 * not do about it. Two screens render them — the requestor's history as an
 * "Outcome", and the requestor's detail screen in place of a hidden action —
 * and the actions available differ per status, so a note that implied "nothing
 * can be done here" would contradict a working Cancel button on exactly the
 * statuses where only Widen is missing.
 *
 * A complete Record, so a status added on the backend is a compile error here
 * rather than a blank line where the explanation should be.
 */
export const STATUS_NOTES: Record<RequestStatus, string> = {
  draft: "This request hasn't been broadcast yet.",
  pending_verification:
    "Waiting on the hospital to verify this request — donors haven't been alerted yet.",
  active: "Broadcasting to nearby compatible donors.",
  partially_matched: "Broadcasting to nearby compatible donors.",
  fully_matched:
    "Every unit is committed, so the broadcast has stopped. The request stays open until those donations are completed.",
  fulfilled: "This request was fulfilled — every unit was donated.",
  closed: "This request was closed.",
  rejected: "This request was declined by the hospital during verification.",
  expired: "This request expired before enough donors committed, and it needs no further action.",
  cancelled: "This request was cancelled.",
};

/** The three buckets the requestor history tabs filter by. */
export type RequestOutcome = "active" | "completed" | "cancelled";

/**
 * Every status, mapped to the tab it belongs under.
 *
 * A Record rather than a switch, so a status added to the backend is a compile
 * error here rather than a request that renders in "All" but under no tab.
 *
 * The tabs are coarse on purpose — the card still prints the exact status — so
 * "cancelled" is really the bucket for "ended without a donation", which is
 * why rejected, closed and expired land there alongside cancelled itself.
 * `draft` is in it too: nothing is in flight, nothing was fulfilled, and it is
 * the only one of the three buckets that doesn't claim otherwise.
 */
export const OUTCOME_BY_STATUS: Record<RequestStatus, RequestOutcome> = {
  draft: "cancelled",
  pending_verification: "active",
  active: "active",
  partially_matched: "active",
  fully_matched: "active",
  fulfilled: "completed",
  closed: "cancelled",
  rejected: "cancelled",
  expired: "cancelled",
  cancelled: "cancelled",
};

/**
 * The word under the blood type on a requestor's card — the box's whole job is
 * to say what state that blood type is in, and "NEEDED" is only true while the
 * request is open.
 */
export function bloodBoxLabel(status: RequestStatus): string {
  switch (status) {
    case "fulfilled":
      return "SECURED";
    case "rejected":
      return "REJECTED";
    case "cancelled":
      return "CANCELLED";
    case "expired":
      return "EXPIRED";
    case "closed":
      return "CLOSED";
    case "draft":
      return "DRAFT";
    default:
      return "NEEDED";
  }
}
