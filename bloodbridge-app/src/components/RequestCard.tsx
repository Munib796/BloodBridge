import { StyleSheet, Text, View } from "react-native";

import type { NearbyBloodRequest } from "@/api/types";
import { UrgencyBadge } from "@/components/UrgencyBadge";
import { colors } from "@/theme/colors";
import { formatCountdown } from "@/utils/time";

interface RequestCardProps {
  request: NearbyBloodRequest;
}

export function RequestCard({ request }: RequestCardProps) {
  const palette = colors.urgency[request.urgency_level];
  const unitsLeft = request.units_needed - request.units_secured;
  const progress = request.units_needed > 0 ? request.units_secured / request.units_needed : 0;

  return (
    <View
      style={[
        styles.card,
        { borderColor: palette.border },
        request.urgency_level === "critical" && styles.criticalCard,
      ]}
    >
      <View style={styles.topRow}>
        <View style={styles.bloodTypeBadge}>
          <Text style={styles.bloodTypeText}>{request.blood_type_needed}</Text>
        </View>
        <UrgencyBadge level={request.urgency_level} />
      </View>

      <Text style={styles.patientLine}>
        {request.units_needed} unit{request.units_needed === 1 ? "" : "s"} needed
        {request.hospital_name_text ? ` · ${request.hospital_name_text}` : ""}
      </Text>

      <View style={styles.metaRow}>
        <Text style={styles.metaText}>
          {request.area_label ?? "Nearby"} · {request.distance_km.toFixed(1)} km away
        </Text>
        <Text style={[styles.metaText, styles.countdown]}>
          {formatCountdown(request.required_by)}
        </Text>
      </View>

      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${Math.min(progress * 100, 100)}%`, backgroundColor: palette.solid },
          ]}
        />
      </View>
      <Text style={styles.progressLabel}>
        {request.units_secured} of {request.units_needed} units secured
        {unitsLeft > 0 ? ` · ${unitsLeft} still needed` : ""}
      </Text>

      {!request.is_hospital_backed && (
        <View style={styles.selfReportedRow}>
          <Text style={styles.selfReportedText}>Self-reported · not hospital-verified</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 16,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  criticalCard: {
    borderWidth: 2,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  bloodTypeBadge: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  bloodTypeText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
  },
  patientLine: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  metaText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  countdown: {
    fontWeight: "700",
    color: colors.text,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  progressLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 6,
  },
  selfReportedRow: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  selfReportedText: {
    fontSize: 11,
    color: colors.textFaint,
    fontStyle: "italic",
  },
});
