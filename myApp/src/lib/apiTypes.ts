/**
 * Mirrors of the backend's response DTOs.
 *
 * These used to sit inside AuthContext, with a note to lift them out once
 * something other than auth consumed them. The donor home feed now does, so
 * they live here instead of being duplicated.
 *
 * Field names match the JSON exactly — `blood_type`, not `bloodType` — so a
 * parsed response can be held in one of these as-is, with no mapping layer to
 * drift out of step with the API.
 */

/** UrgencyLevel — src/utils/enums.py. */
export type UrgencyLevel = "critical" | "urgent" | "routine";

/** RequestStatus — src/utils/enums.py. */
export type RequestStatus =
  | "draft"
  | "pending_verification"
  | "active"
  | "partially_matched"
  | "fully_matched"
  | "fulfilled"
  | "closed"
  | "rejected"
  | "expired"
  | "cancelled";

/** DonorOut — src/donors/dtos.py. */
export type DonorProfile = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  blood_type: string;
  profile_pic_url: string | null;
  area_label: string | null;
  device_token: string | null;
  is_email_verified: boolean;
  is_active: boolean;
  is_available: boolean;
  created_at: string;
};

/** RequestorOut — src/requestors/dtos.py. */
export type RequestorProfile = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  profile_pic_url: string | null;
  device_token: string | null;
  is_email_verified: boolean;
  is_active: boolean;
  created_at: string;
};

/** HospitalOut / OrganizationOut — the same fields; only the role differs. */
export type FacilityProfile = {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  logo_url: string | null;
  approval_status: "pending" | "approved" | "rejected";
  is_email_verified: boolean;
  created_at: string;
};

/** Whatever `/{role}/me` returns, for the role that was asked about. */
export type AuthProfile = DonorProfile | RequestorProfile | FacilityProfile;

/** MatchStatus — src/utils/enums.py. */
export type MatchStatus = "accepted" | "completed" | "cancelled";

/**
 * BloodRequestOut — src/blood_requests/dtos.py.
 *
 * Returned by GET /blood-requests/{id}. Patient name and contact number are in
 * here, but the endpoint is only reachable by someone with a reason to see
 * them: the poster, the verifying hospital, an admin, or a donor/organization
 * this request is actively reaching out to (controller.assert_can_view_request).
 * Everyone else gets a 404.
 *
 * Note what is *not* here: no latitude/longitude, and no `distance_km`. The
 * backend never sends a request's coordinates to the app — only the donor's
 * own distance is derived, on the listing endpoint below.
 */
export type BloodRequest = {
  id: string;
  requestor_id: string | null;
  organization_id: string | null;
  patient_name: string;
  blood_type_needed: string;
  units_needed: number;
  units_secured: number;
  urgency_level: UrgencyLevel;
  /** ISO 8601 with an offset — the column is DateTime(timezone=True), so this
   *  is safe to hand straight to `new Date()`. */
  required_by: string;
  hospital_name_text: string | null;
  hospital_id: string | null;
  is_hospital_backed: boolean;
  status: RequestStatus;
  current_radius_km: number;
  contact_phone: string;
  area_label: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * NearbyBloodRequestOut — src/blood_requests/dtos.py.
 *
 * `BloodRequestOut` plus `distance_km`, mirroring the backend's subclass. The
 * distance is measured from the donor's stored location, which is also what
 * decided this request was in range at all.
 */
export type NearbyBloodRequest = BloodRequest & {
  distance_km: number;
};

/** MatchRequestSummaryOut — the request a commitment belongs to, trimmed. */
export type MatchRequestSummary = {
  id: string;
  patient_name: string;
  blood_type_needed: string;
  units_needed: number;
  units_secured: number;
  urgency_level: UrgencyLevel;
  status: RequestStatus;
  required_by: string;
  hospital_name_text: string | null;
  is_hospital_backed: boolean;
  current_radius_km: number;
  area_label: string | null;
};

/**
 * RequestMatchDetailOut — src/request_matches/dtos.py.
 *
 * The body of every match endpoint: the 201 from accept, the list from
 * GET /request-matches/mine, and the updated row returned by cancel, eta and
 * complete. So one type covers both "a commitment I just made" and "a
 * commitment I settled a year ago".
 *
 * `poster_*` is the requestor/organization that created the request and
 * `acceptor_*` is whoever committed to it — so from the donor's side,
 * `poster_name` / `poster_phone` are the coordinator to call. `poster_phone` is
 * non-null by design: it is the number nominated on the request itself, not the
 * poster's account phone.
 *
 * Note the absence of `cancelled_at`: only `accepted_at` and `completed_at`
 * exist, so a cancelled commitment cannot be dated to when it was cancelled.
 */
export type RequestMatchDetail = {
  id: string;
  blood_request_id: string;
  donor_id: string | null;
  organization_id: string | null;
  units_committed: number;
  eta: string | null;
  status: MatchStatus;
  cancel_reason: string | null;
  accepted_at: string;
  completed_at: string | null;
  acceptor_name: string | null;
  acceptor_phone: string | null;
  poster_name: string | null;
  poster_phone: string;
  blood_request: MatchRequestSummary;
  /** Straight-line km from the request to whoever accepted it. Nullable: it
   *  needs a location on both sides. */
  distance_km: number | null;
};

/** SenderType — src/utils/enums.py. Whichever side of the match sent a
 *  message; matches the three roles allowed into a chat thread at all. */
export type ChatSenderType = "donor" | "requestor" | "organization";

/** NotificationType — src/utils/enums.py. */
export type NotificationType =
  | "new_nearby_request"
  | "first_donor_accepted"
  | "request_completed"
  | "requestor_cancelled"
  | "donor_cancelled"
  | "request_expired"
  | "new_chat_message"
  | "partial_accept"
  | "radius_widened"
  | "donor_eat_passed";

/** NotificationOut — src/notifications/dtos.py. */
export type Notification = {
  id: string;
  recipient_id: string;
  recipient_role: ChatSenderType;
  type: NotificationType;
  title: string;
  body: string;
  blood_request_id: string | null;
  request_match_id: string | null;
  payload: Record<string, unknown> | null;
  pushed_at: string | null;
  read_at: string | null;
  created_at: string;
};

/**
 * ChatMessageOut — src/chat/dtos.py.
 *
 * `sender_id` is the account id, not necessarily "who I'm talking to" — a
 * thread has exactly two participants, so compare it against the viewer's own
 * profile.id to tell a sent bubble from a received one. Comparing
 * `sender_type` instead breaks the one case where both sides are
 * organizations (a blood bank posting to another blood bank), since then
 * every message shares the same sender_type.
 */
export type ChatMessage = {
  id: string;
  chat_thread_id: string;
  sender_type: ChatSenderType;
  sender_id: string;
  content: string;
  sent_at: string;
};

/**
 * ChatThreadSummaryOut — src/chat/dtos.py.
 *
 * One conversation row for the inbox list. It is intentionally summary-only:
 * the app can show the thread preview and route into a full chat screen with
 * just the match id and the request context this payload already includes.
 */
export type ChatThreadSummary = {
  id: string;
  match_id: string;
  blood_request_id: string;
  counterparty_name: string | null;
  counterparty_role: ChatSenderType | null;
  blood_type_needed: string;
  urgency_level: UrgencyLevel;
  hospital_name: string | null;
  area_label: string | null;
  match_status: MatchStatus;
  created_at: string;
  last_message_at: string | null;
  last_message_preview: string | null;
};
