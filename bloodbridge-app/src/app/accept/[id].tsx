import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { fetchRequest } from "@/api/bloodRequests";
import { acceptRequest } from "@/api/matches";
import { Button } from "@/components/Button";
import { colors } from "@/theme/colors";

const ETA_PRESETS = [
  { label: "30 min", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "2 hours", minutes: 120 },
  { label: "Today, later", minutes: 360 },
];

export default function AcceptRequestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [units, setUnits] = useState(1);
  const [etaMinutes, setEtaMinutes] = useState(60);
  const [submitting, setSubmitting] = useState(false);

  const { data: request, isLoading } = useQuery({
    queryKey: ["request", id],
    queryFn: () => fetchRequest(id),
    enabled: !!id,
  });

  const maxUnits = request ? Math.max(1, request.units_needed - request.units_secured) : 1;

  async function handleConfirm() {
    setSubmitting(true);
    try {
      const eta = new Date(Date.now() + etaMinutes * 60 * 1000).toISOString();
      await acceptRequest(id, units, eta);
      queryClient.invalidateQueries({ queryKey: ["request", id] });
      queryClient.invalidateQueries({ queryKey: ["my-matches"] });
      queryClient.invalidateQueries({ queryKey: ["nearby-requests"] });
      Alert.alert("Thank you", "The requestor has been notified. Your commitment is now visible in My Matches.");
      router.replace(`/request/${id}`);
    } catch (err) {
      Alert.alert("Couldn't confirm", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading || !request) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.summary}>
        {request.patient_name} needs {request.blood_type_needed} blood
      </Text>

      <Text style={styles.label}>How many units can you commit to?</Text>
      <View style={styles.stepperRow}>
        <Pressable style={styles.stepperButton} onPress={() => setUnits((u) => Math.max(1, u - 1))}>
          <Text style={styles.stepperButtonText}>−</Text>
        </Pressable>
        <Text style={styles.stepperValue}>{units}</Text>
        <Pressable style={styles.stepperButton} onPress={() => setUnits((u) => Math.min(maxUnits, u + 1))}>
          <Text style={styles.stepperButtonText}>+</Text>
        </Pressable>
      </View>

      <Text style={styles.label}>When can you get there?</Text>
      <View style={styles.etaRow}>
        {ETA_PRESETS.map((preset) => {
          const active = etaMinutes === preset.minutes;
          return (
            <Pressable
              key={preset.minutes}
              style={[styles.etaChip, active && styles.etaChipActive]}
              onPress={() => setEtaMinutes(preset.minutes)}
            >
              <Text style={[styles.etaChipText, active && styles.etaChipTextActive]}>{preset.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ flex: 1 }} />

      <Button label="Confirm — I'll be there" onPress={handleConfirm} loading={submitting} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 20 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  summary: { fontSize: 17, fontWeight: "700", color: colors.text, marginBottom: 24 },
  label: { fontSize: 14, fontWeight: "600", color: colors.text, marginBottom: 10 },
  stepperRow: { flexDirection: "row", alignItems: "center", gap: 20, marginBottom: 28 },
  stepperButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperButtonText: { fontSize: 24, fontWeight: "700", color: colors.text },
  stepperValue: { fontSize: 22, fontWeight: "800", color: colors.text, minWidth: 32, textAlign: "center" },
  etaRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  etaChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  etaChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  etaChipText: { fontSize: 13, fontWeight: "600", color: colors.text },
  etaChipTextActive: { color: "#fff" },
});
