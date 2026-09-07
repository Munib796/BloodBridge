import { Tabs } from "expo-router";

import { colors } from "@/theme/colors";

export default function DonorLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen name="home" options={{ title: "Nearby" }} />
      <Tabs.Screen name="matches" options={{ title: "My Matches" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
