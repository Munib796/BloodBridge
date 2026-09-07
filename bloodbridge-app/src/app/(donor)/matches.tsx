import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { cancelMatch, completeMatch, fetchMyMatches } from "@/api/matches";
import type { RequestMatch } from "@/api/types";
import { Screen } from "@/components/Screen";
import { colors } from "@/theme/colors";
import { formatDateTime } from "@/utils/time";

const STATUS_LABEL: Record<RequestMatch["status"], string> = {
  accepted: "On the way",
  completed: "Completed",
  cancelled: "Cancelled",
};

export default function DonorMatchesScreen() {
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["my-matches"],
    queryFn: fetchMyMatches,
  });

  async function handleComplete(matchId: string) {
    setBusyId(matchId);
    try {
      await completeMatch(matchId);
      queryClient.invalidateQueries({ queryKey: ["my-matches"] });
    } catch (err) {
      Alert.alert("Couldn't update", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  function handleCancel(matchId: string) {
    Alert.alert("Cancel this commitment?", "The requestor will be notified.", [
      { text: "Never mind", style: "cancel" },
      {
        text: "Yes, cancel",
        style: "destructive",
        onPress: async () => {
          setBusyId(matchId);
          try {
            await cancelMatch(matchId);
            queryClient.invalidateQueries({ queryKey: ["my-matches"] });
          } catch (err) {
            Alert.alert("Couldn't cancel", err instanceof Error ? err.message : "Please try again.");
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  }

  if (isLoading) {
    return (
      <Screen>
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <Text style={styles.headerTitle}>My matches</Text>
      <FlatList<RequestMatch>
        data={data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshing={isRefetching}
        onRefresh={refetch}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>You haven't accepted any requests yet.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.status}>{STATUS_LABEL[item.status]}</Text>
            <Text style={styles.detail}>{item.units_committed} unit(s) committed</Text>
            {item.eta && <Text style={styles.detail}>ETA: {formatDateTime(item.eta)}</Text>}

            {item.status === "accepted" && (
              <View style={styles.actionsRow}>
                <Pressable
                  style={styles.actionButton}
                  onPress={() => handleComplete(item.id)}
                  disabled={busyId === item.id}
                >
                  <Text style={styles.actionText}>
                    {busyId === item.id ? "Updating..." : "Mark completed"}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.actionButton, styles.cancelButton]}
                  onPress={() => handleCancel(item.id)}
                  disabled={busyId === item.id}
                >
                  <Text style={[styles.actionText, styles.cancelText]}>Cancel</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerTitle: { fontSize: 22, fontWeight: "800", color: colors.text, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  listContent: { paddingHorizontal: 20, paddingBottom: 24 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  status: { fontSize: 15, fontWeight: "700", color: colors.text, marginBottom: 4 },
  detail: { fontSize: 13, color: colors.textMuted },
  actionsRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  actionButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  cancelButton: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border },
  actionText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  cancelText: { color: colors.textMuted },
  empty: { paddingTop: 60, alignItems: "center", paddingHorizontal: 32 },
  emptyText: { color: colors.textMuted, textAlign: "center" },
});
