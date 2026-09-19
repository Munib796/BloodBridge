import { Stack } from "expo-router";

import { AuthProvider } from "../context/AuthContext";

export default function RootLayout() {
  // AuthProvider sits above the Stack so every route — including the initial
  // one — can read the session. It renders nothing until the stored token has
  // been read, which is a single keychain lookup rather than a network call.
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </AuthProvider>
  );
}
