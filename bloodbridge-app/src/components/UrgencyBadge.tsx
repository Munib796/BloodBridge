import { StyleSheet, Text, View } from "react-native";

import { colors, UrgencyKey } from "@/theme/colors";

const LABELS: Record<UrgencyKey, string> = {
  critical: "CRITICAL",
  urgent: "URGENT",
  routine: "ROUTINE",
};

export function UrgencyBadge({ level }: { level: UrgencyKey }) {
  const palette = colors.urgency[level];
  return (
    <View style={[styles.badge, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <View style={[styles.dot, { backgroundColor: palette.solid }]} />
      <Text style={[styles.text, { color: palette.text }]}>{LABELS[level]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  text: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
});
