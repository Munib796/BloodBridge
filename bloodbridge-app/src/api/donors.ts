import { apiClient } from "@/api/client";
import type { Donor } from "@/api/types";

export async function updateDonorLocation(
  latitude: number,
  longitude: number,
  areaLabel: string
): Promise<Donor> {
  const { data } = await apiClient.patch<Donor>("/donors/me/location", {
    latitude,
    longitude,
    area_label: areaLabel,
  });
  return data;
}

export async function updateDonorDeviceToken(deviceToken: string | null): Promise<Donor> {
  const { data } = await apiClient.patch<Donor>("/donors/me/device-token", {
    device_token: deviceToken,
  });
  return data;
}
