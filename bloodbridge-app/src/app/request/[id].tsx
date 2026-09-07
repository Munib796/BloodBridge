import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { cancelRequest, fetchRequest, widenRadius } from "@/api/bloodRequests";
import { Button } from "@/components/Button";
import { UrgencyBadge } from "@/components/UrgencyBadge";
import { useAuthStore } from "@/store/authStore";
import { colors } from "@/theme/colors";
import { formatCountdown, formatDateTime } from "@/utils/time";

const OPEN_STATUSES = new Set(["active", "partially_matched", "fully_matched", "pending_verification"]);

export default function RequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const role = useAuthStore((s) => s.role);
  const self = useAuthStore((s) => s.self);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { data: request, isLoading, isError, error } = useQuery({
    queryKey: ["request", id],
    queryFn: () => fetchRequest(id),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (isError || !request) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error instanceof Error ? error.message : "Request not found."}</Text>
      </View>
    );
  }

  const isOwner = role === "requestor" && self && "email" in self && self.id === request.requestor_id;
  const isDonorViewer = role === "donor";
  const isOpen = OPEN_STATUSES.has(request.status);
  const unitsLeft = request.units_needed - request.units_secured;
  const progress = request.units_needed > 0 ? request.units_secured / request.units_needed : 0;
  const palette = colors.urgency[request.urgency_level];

  async function handleWiden() {
    setBusy(true);
    try {
      await widenRadius(id);
      queryClient.invalidateQueries({ queryKey: ["request", id] });
    } catch (err) {
      Alert.alert("Couldn't widen radius", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function handleCancel() {
    Alert.alert("Cancel this request?", "Donors will no longer be able to see or accept it.", [
      { text: "Never mind", style: "cancel" },
      {
        text: "Yes, cancel",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await cancelRequest(id);
            queryClient.invalidateQueries({ queryKey: ["request", id] });
          } catch (err) {
            Alert.alert("Couldn't cancel", err instanceof Error ? err.message : "Please try again.");
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.topRow}>
        <View style={styles.bloodTypeBadge}>
          <Text style={styles.bloodTypeText}>{request.blood_type_needed}</Text>
        </View>
        <UrgencyBadge level={request.urgency_level} />
      </View>

      <Text style={styles.patientName}>{request.patient_name}</Text>
      {request.hospital_name_text && (
        <Text style={styles.hospital}>
          {request.hospital_name_text}
          {request.is_hospital_backed ? " · Hospital-verified" : " · Self-reported"}
        </Text>
      )}

      <View style={styles.progressTrack}>
        <View
          style={[styles.progressFill, { width: `${Math.min(progress * 100, 100)}%`, backgroundColor: palette.solid }]}
        />
      </View>
      <Text style={styles.progressLabel}>
        {request.units_secured} of {request.units_needed} units secured
        {unitsLeft > 0 ? ` · ${unitsLeft} still needed` : ""}
      </Text>

      {isOpen && <Text style={styles.countdown}>{formatCountdown(request.required_by)}</Text>}
      <Text style={styles.metaText}>Needed by {formatDateTime(request.required_by)}</Text>
      {request.area_label && <Text style={styles.metaText}>Area: {request.area_label}</Text>}
      <Text style={styles.metaText}>Search radius: {request.current_radius_km} km</Text>

      {isDonorViewer && (
        <Pressable style={styles.callButton} onPress={() => Linking.openURL(`tel:${request.contact_phone}`)}>
          <Text style={styles.callButtonText}>Call {request.contact_phone}</Text>
        </Pressable>
      )}

      <View style={{ height: 12 }} />

      {isDonorViewer && isOpen && (
        <Button label="I can help" onPress={() => router.push(`/accept/${request.id}`)} />
      )}

      {isOwner && isOpen && (
        <>
          <Button label="Widen search radius" variant="secondary" onPress={handleWiden} loading={busy} />
          <View style={{ height: 12 }} />
          <Button label="Cancel request" variant="danger" onPress={handleCancel} loading={busy} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  errorText: { color: colors.textMuted, textAlign: "center", paddingHorizontal: 32 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  bloodTypeBadge: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  bloodTypeText: { color: "#fff", fontSize: 20, fontWeight: "800" },
  patientName: { fontSize: 22, fontWeight: "800", color: colors.text, marginBottom: 4 },
  hospital: { fontSize: 14, color: colors.textMuted, marginBottom: 16 },
  progressTrack: { height: 10, borderRadius: 5, backgroundColor: colors.border, overflow: "hidden", marginTop: 8 },
  progressFill: { height: "100%", borderRadius: 5 },
  progressLabel: { fontSize: 13, color: colors.textMuted, marginTop: 6, marginBottom: 12 },
  countdown: { fontSize: 16, fontWeight: "800", color: colors.text, marginBottom: 4 },
  metaText: { fontSize: 13, color: colors.textMuted, marginBottom: 4 },
  callButton: {
    marginTop: 16,
    backgroundColor: colors.success,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  callButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
