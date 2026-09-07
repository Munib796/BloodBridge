import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { useAuthStore } from "@/store/authStore";
import { colors } from "@/theme/colors";

export default function DonorProfileScreen() {
  const self = useAuthStore((s) => s.self);
  const signOut = useAuthStore((s) => s.signOut);

  const donor = self && "blood_type" in self ? self : null;

  async function handleLogout() {
    await signOut();
    router.replace("/(auth)/welcome");
  }

  return (
    <Screen>
      <Text style={styles.title}>Profile</Text>

      <View style={styles.card}>
        <Row label="Name" value={donor?.full_name ?? "—"} />
        <Row label="Email" value={donor?.email ?? "—"} />
        <Row label="Phone" value={donor?.phone ?? "—"} />
        <Row label="Blood type" value={donor?.blood_type ?? "—"} />
        <Row label="Area" value={donor?.area_label ?? "Not set"} />
      </View>

      <Button label="Log out" variant="secondary" onPress={handleLogout} />
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: "800", color: colors.text, marginTop: 12, marginBottom: 20 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 24,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLabel: { fontSize: 14, color: colors.textMuted },
  rowValue: { fontSize: 14, fontWeight: "600", color: colors.text },
});
