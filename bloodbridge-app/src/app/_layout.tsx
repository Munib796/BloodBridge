import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useAuthStore } from "@/store/authStore";

// Keep the native splash screen up until we know whether the user is
// logged in — this pattern is carried over from the working template.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 15_000,
    },
  },
});

export default function RootLayout() {
  const hydrate = useAuthStore((s) => s.hydrate);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    hydrate().finally(() => setReady(true));
  }, [hydrate]);

  useEffect(() => {
    if (ready && isHydrated) {
      SplashScreen.hideAsync();
    }
  }, [ready, isHydrated]);

  if (!ready || !isHydrated) {
    // Native splash screen is still showing at this point — nothing to render.
    return null;
  }

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(donor)" />
          <Stack.Screen name="(requestor)" />
          <Stack.Screen
            name="new-request"
            options={{ presentation: "modal", headerShown: true, title: "New Blood Request" }}
          />
          <Stack.Screen
            name="request/[id]"
            options={{ headerShown: true, title: "Request Details" }}
          />
          <Stack.Screen
            name="accept/[id]"
            options={{ presentation: "modal", headerShown: true, title: "Confirm Your Help" }}
          />
        </Stack>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
