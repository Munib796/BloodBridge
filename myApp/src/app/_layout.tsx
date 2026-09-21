import { Stack } from "expo-router";
import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { Platform } from "react-native";

import { AuthProvider } from "../context/AuthContext";

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS !== "android") return;

    void Notifications.setNotificationChannelAsync("default", {
      name: "BloodBridge notifications",
      importance: Notifications.AndroidImportance.MAX,
    }).catch((error) => {
      console.warn("[Notifications] Could not configure the Android channel.", error);
    });
  }, []);

  // AuthProvider sits above the Stack so every route — including the initial
  // one — can read the session. It renders nothing until the stored token has
  // been read, which is a single keychain lookup rather than a network call.
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </AuthProvider>
  );
}
