import { Tabs } from "expo-router";

import { colors } from "@/theme/colors";

export default function RequestorLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen name="home" options={{ title: "My Requests" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
