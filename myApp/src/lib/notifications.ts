import * as Notifications from "expo-notifications";

import { api } from "./apiClient";
import type { DonorProfile, Notification, RequestorProfile } from "./apiTypes";
import type { UserRole } from "../context/AuthContext";

const EXPO_PROJECT_ID = "4931de7e-e00a-45c6-b91f-53498123e2dc";

type DeviceTokenProfile = DonorProfile | RequestorProfile;

const DEVICE_TOKEN_PATHS: Record<UserRole, string> = {
  donor: "/donors/me/device-token",
  requestor: "/requestors/me/device-token",
};

/** Register the current device for push notifications without blocking auth. */
export async function registerPushToken(role: UserRole): Promise<void> {
  try {
    const permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) {
      console.info("[Notifications] Push permission was not granted.");
      return;
    }

    const token = await Notifications.getExpoPushTokenAsync({
      projectId: EXPO_PROJECT_ID,
    });

    const profile = await api.patch<DeviceTokenProfile>(
      DEVICE_TOKEN_PATHS[role],
      { device_token: token.data },
    );

    console.info("[Notifications] Push token registered.", {
      role,
      deviceToken: profile.device_token,
    });
  } catch (error) {
    console.warn("[Notifications] Could not register the push token.", error);
  }
}

export async function fetchNotifications(limit = 50, offset = 0): Promise<Notification[]> {
  return api.get<Notification[]>(`/notifications?limit=${limit}&offset=${offset}`);
}

export async function fetchUnreadCount(): Promise<number> {
  const response = await api.get<{ unread_count: number }>("/notifications/unread-count");
  return response.unread_count;
}

export async function markNotificationRead(notificationId: string): Promise<Notification> {
  return api.patch<Notification>(
    `/notifications/${encodeURIComponent(notificationId)}/read`,
  );
}

export async function markAllRead(): Promise<number> {
  const response = await api.post<{ updated_count: number }>("/notifications/read-all");
  return response.updated_count;
}
