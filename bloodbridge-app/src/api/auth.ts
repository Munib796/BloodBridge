import { apiClient } from "@/api/client";
import type { BloodType, Donor, Requestor } from "@/api/types";

// --- Donor -----------------------------------------------------------------

export interface DonorSignupInput {
  full_name: string;
  email: string;
  phone: string;
  password: string;
  blood_type: BloodType;
}

export async function donorSignup(input: DonorSignupInput): Promise<Donor> {
  const { data } = await apiClient.post<Donor>("/donors/signup", input);
  return data;
}

export async function donorLogin(email: string, password: string): Promise<string> {
  const { data } = await apiClient.post<{ access_token: string; token_type: string }>(
    "/donors/login",
    { email, password }
  );
  return data.access_token;
}

export async function fetchDonorMe(): Promise<Donor> {
  const { data } = await apiClient.get<Donor>("/donors/me");
  return data;
}

// --- Requestor ---------------------------------------------------------------

export interface RequestorSignupInput {
  full_name: string;
  email: string;
  phone: string;
  password: string;
}

export async function requestorSignup(input: RequestorSignupInput): Promise<Requestor> {
  const { data } = await apiClient.post<Requestor>("/requestors/signup", input);
  return data;
}

export async function requestorLogin(email: string, password: string): Promise<string> {
  const { data } = await apiClient.post<{ access_token: string; token_type: string }>(
    "/requestors/login",
    { email, password }
  );
  return data.access_token;
}

export async function fetchRequestorMe(): Promise<Requestor> {
  const { data } = await apiClient.get<Requestor>("/requestors/me");
  return data;
}
