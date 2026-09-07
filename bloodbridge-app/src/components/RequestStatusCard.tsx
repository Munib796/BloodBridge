import { StyleSheet, Text, View } from "react-native";

import type { BloodRequest, RequestStatus } from "@/api/types";
import { UrgencyBadge } from "@/components/UrgencyBadge";
import { colors } from "@/theme/colors";
import { formatCountdown } from "@/utils/time";

const STATUS_LABEL: Record<RequestStatus, string> = {
  draft: "Draft",
  pending_verification: "Awaiting hospital verification",
  active: "Active — visible to donors",
  partially_matched: "Partially matched",
  fully_matched: "Fully matched",
  fulfilled: "Fulfilled",
  closed: "Closed",
  rejected: "Rejected by hospital",
  expired: "Expired",
  cancelled: "Cancelled",
};

export function RequestStatusCard({ request }: { request: BloodRequest }) {
  const palette = colors.urgency[request.urgency_level];
  const progress = request.units_needed > 0 ? request.units_secured / request.units_needed : 0;
  const isOpen = ["active", "partially_matched", "fully_matched", "pending_verification"].includes(
    request.status
  );

  return (
    <View style={[styles.card, { borderColor: palette.border }]}>
      <View style={styles.topRow}>
        <View style={styles.bloodTypeBadge}>
          <Text style={styles.bloodTypeText}>{request.blood_type_needed}</Text>
        </View>
        <UrgencyBadge level={request.urgency_level} />
      </View>

      <Text style={styles.statusLine}>{STATUS_LABEL[request.status]}</Text>

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
      </Text>

      {isOpen && (
        <Text style={styles.countdown}>{formatCountdown(request.required_by)}</Text>
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
  },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  bloodTypeBadge: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  bloodTypeText: { color: "#fff", fontSize: 18, fontWeight: "800" },
  statusLine: { fontSize: 15, fontWeight: "600", color: colors.text, marginBottom: 8 },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 4 },
  progressLabel: { fontSize: 12, color: colors.textMuted, marginTop: 6 },
  countdown: { fontSize: 12, fontWeight: "700", color: colors.text, marginTop: 8 },
});
