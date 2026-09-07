import { Redirect } from "expo-router";

import { useAuthStore } from "@/store/authStore";

export default function Index() {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.role);

  if (!token || !role) {
    return <Redirect href="/(auth)/welcome" />;
  }

  if (role === "donor") {
    return <Redirect href="/(donor)/home" />;
  }

  if (role === "requestor") {
    return <Redirect href="/(requestor)/home" />;
  }

  // Hospital/Organization/Admin dashboards come in a later phase — for now,
  // fall back to the welcome screen rather than a dead end.
  return <Redirect href="/(auth)/welcome" />;
}
