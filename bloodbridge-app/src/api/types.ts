// These mirror src/utils/enums.py and the DTOs in the FastAPI backend
// (blood_requests/dtos.py, request_matches/dtos.py, donors/dtos.py, etc.)
// exactly — keep them in sync if the backend changes.

export type BloodType = "O+" | "O-" | "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-";

export const BLOOD_TYPES: BloodType[] = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];

export type UrgencyLevel = "critical" | "urgent" | "routine";

export const URGENCY_LEVELS: UrgencyLevel[] = ["critical", "urgent", "routine"];

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

export type MatchStatus = "accepted" | "cancelled" | "completed";

export type Role = "donor" | "requestor" | "hospital" | "organization" | "admin";

export interface Donor {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  blood_type: BloodType;
  profile_pic_url: string | null;
  area_label: string | null;
  device_token: string | null;
  is_email_verified: boolean;
  is_active: boolean;
  created_at: string;
}

export interface Requestor {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  profile_pic_url: string | null;
  is_email_verified: boolean;
  is_active: boolean;
  created_at: string;
}

export interface BloodRequest {
  id: string;
  requestor_id: string | null;
  organization_id: string | null;
  patient_name: string;
  blood_type_needed: BloodType;
  units_needed: number;
  units_secured: number;
  urgency_level: UrgencyLevel;
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
}

export interface NearbyBloodRequest extends BloodRequest {
  distance_km: number;
}

export interface RequestMatch {
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
}
