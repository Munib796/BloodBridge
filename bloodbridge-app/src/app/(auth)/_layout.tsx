import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="login" options={{ headerShown: true, title: "" }} />
      <Stack.Screen name="signup-donor" options={{ headerShown: true, title: "" }} />
      <Stack.Screen name="signup-requestor" options={{ headerShown: true, title: "" }} />
    </Stack>
  );
}
