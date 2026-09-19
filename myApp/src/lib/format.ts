/**
 * Date and distance wording, shared by the screens that show a request or a
 * commitment against one.
 *
 * These started life inside DonorHomeScreen; the request detail screen needs
 * the same phrasing, and two copies of "Needed within N hrs" would drift the
 * first time one of them was reworded. The commitment history screen pulls the
 * same trick with "Accepted 10 minutes ago".
 *
 * Every timestamp the backend sends is DateTime(timezone=True), so it arrives
 * as ISO 8601 with an offset and `new Date()` parses it without help. Nothing
 * here uses Intl: Hermes ships it inconsistently across platforms, and a
 * locale-aware month name is not worth a crash on a screen showing an
 * emergency request.
 */

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const MS_PER_HOUR = 3_600_000;
const MS_PER_MINUTE = 60_000;

function parse(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Metres below a kilometre, so a close match doesn't read as "0.4 km away". */
export function formatDistanceKm(distanceKm: number): string {
  if (!Number.isFinite(distanceKm)) return "Distance unknown";
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m away`;
  return `${distanceKm.toFixed(1)} km away`;
}

/**
 * How long is left, in the rough terms a donor actually plans around.
 *
 * A past deadline is reachable: requests are only moved to EXPIRED by a sweep
 * that runs on a schedule, so an overdue one can still be sitting in an open
 * status and appearing in the feed.
 */
export function formatDeadlineCountdown(requiredBy: string): string {
  const deadline = parse(requiredBy);
  if (!deadline) return "Deadline unknown";

  const hoursRemaining = (deadline.getTime() - Date.now()) / MS_PER_HOUR;
  if (hoursRemaining <= 0) return "Past due";
  if (hoursRemaining < 1) return "Due within the hour";
  return `Needed within ${Math.round(hoursRemaining)} hrs`;
}

/** An absolute clock time — "Tue, 16 Sep · 5:30 PM". */
export function formatAbsoluteTime(iso: string): string {
  const date = parse(iso);
  if (!date) return "Unknown";

  const hours24 = date.getHours();
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const meridiem = hours24 < 12 ? "AM" : "PM";

  return `${DAY_NAMES[date.getDay()]}, ${date.getDate()} ${MONTH_NAMES[date.getMonth()]} · ${hours12}:${minutes} ${meridiem}`;
}

/** A calendar date with no time — "16 Sep 2026". */
export function formatDate(iso: string): string {
  const date = parse(iso);
  if (!date) return "Date unknown";
  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * How long ago something happened — "12 minutes ago", "3 hours ago".
 *
 * The bare phrase, with no leading verb: two screens want it with different
 * ones ("Posted …" on a request, "Accepted …" on a commitment), and baking
 * either into the formatter would mean a second copy for the other.
 */
export function formatTimeAgo(iso: string): string {
  const then = parse(iso);
  if (!then) return "recently";

  const minutes = Math.floor((Date.now() - then.getTime()) / MS_PER_MINUTE);
  // Clock skew between the device and the backend can put this slightly in the
  // future; "-2 minutes ago" would look like a bug.
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function formatPostedAgo(createdAt: string): string {
  return `Posted ${formatTimeAgo(createdAt)}`;
}

/**
 * How long until the donor said they'd arrive — "Arriving in 22 mins".
 *
 * A commitment's `eta` is an absolute timestamp the donor chose, so unlike a
 * request deadline it is routinely in the recent past: the donor may have
 * given blood already and simply not tapped "Confirm Donation Completed". That
 * reads as "Arrival time passed" rather than a negative countdown, which is a
 * nudge to complete the commitment rather than an error.
 */
export function formatArrivalIn(eta: string): string {
  const arrival = parse(eta);
  if (!arrival) return "Arrival time unknown";

  const minutes = Math.round((arrival.getTime() - Date.now()) / MS_PER_MINUTE);
  if (minutes <= 0) return "Arrival time passed";
  if (minutes < 60) return `Arriving in ${minutes} min${minutes === 1 ? "" : "s"}`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hourLabel = `${hours} hr${hours === 1 ? "" : "s"}`;
  return rest === 0 ? `Arriving in ${hourLabel}` : `Arriving in ${hourLabel} ${rest} mins`;
}
