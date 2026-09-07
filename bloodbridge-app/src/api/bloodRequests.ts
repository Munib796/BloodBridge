import { apiClient } from "@/api/client";
import type { BloodRequest, BloodType, NearbyBloodRequest, UrgencyLevel } from "@/api/types";

export async function fetchNearbyRequests(): Promise<NearbyBloodRequest[]> {
  const { data } = await apiClient.get<NearbyBloodRequest[]>("/blood-requests/nearby/for-me");
  return data;
}

export async function fetchRequest(requestId: string): Promise<BloodRequest> {
  const { data } = await apiClient.get<BloodRequest>(`/blood-requests/${requestId}`);
  return data;
}

export interface CreateRequestInput {
  patient_name: string;
  blood_type_needed: BloodType;
  units_needed: number;
  urgency_level: UrgencyLevel;
  required_by: string; // ISO datetime, must be in the future
  hospital_name?: string;
  contact_phone: string;
  latitude: number;
  longitude: number;
  area_label: string;
}

export async function createRequest(input: CreateRequestInput): Promise<BloodRequest> {
  const { data } = await apiClient.post<BloodRequest>("/blood-requests", input);
  return data;
}

export async function cancelRequest(requestId: string, reason?: string): Promise<BloodRequest> {
  const { data } = await apiClient.patch<BloodRequest>(`/blood-requests/${requestId}/cancel`, {
    reason,
  });
  return data;
}

export async function widenRadius(requestId: string, toRadiusKm?: number): Promise<BloodRequest> {
  const { data } = await apiClient.patch<BloodRequest>(
    `/blood-requests/${requestId}/widen-radius`,
    { to_radius_km: toRadiusKm }
  );
  return data;
}

export async function reactivateRequest(requestId: string): Promise<BloodRequest> {
  const { data } = await apiClient.patch<BloodRequest>(`/blood-requests/${requestId}/reactivate`);
  return data;
}

export async function closeRequestAsPoster(requestId: string): Promise<BloodRequest> {
  const { data } = await apiClient.post<BloodRequest>(`/blood-requests/poster/close/${requestId}`);
  return data;
}
