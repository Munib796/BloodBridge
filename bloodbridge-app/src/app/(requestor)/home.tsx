import { useQueries } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { fetchRequest } from "@/api/bloodRequests";
import { RequestStatusCard } from "@/components/RequestStatusCard";
import { Screen } from "@/components/Screen";
import { useMyRequestsStore } from "@/store/myRequestsStore";
import { colors } from "@/theme/colors";

export default function RequestorHomeScreen() {
  const ids = useMyRequestsStore((s) => s.ids);
  const isHydrated = useMyRequestsStore((s) => s.isHydrated);
  const hydrate = useMyRequestsStore((s) => s.hydrate);

  useEffect(() => {
    if (!isHydrated) hydrate();
  }, [isHydrated, hydrate]);

  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["request", id],
      queryFn: () => fetchRequest(id),
      refetchInterval: 20_000,
    })),
  });

  const requests = results
    .map((r) => r.data)
    .filter((r): r is NonNullable<typeof r> => !!r)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const isLoading = !isHydrated || (ids.length > 0 && results.every((r) => r.isLoading));

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My requests</Text>
        <Pressable style={styles.newButton} onPress={() => router.push("/new-request")}>
          <Text style={styles.newButtonText}>+ New</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No requests yet</Text>
              <Text style={styles.emptyText}>
                Tap "+ New" to post a blood request and reach nearby donors.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable onPress={() => router.push(`/request/${item.id}`)}>
              <RequestStatusCard request={item} />
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTitle: { fontSize: 22, fontWeight: "800", color: colors.text },
  newButton: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  newButtonText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  listContent: { paddingHorizontal: 20, paddingBottom: 24 },
  empty: { paddingTop: 60, alignItems: "center", paddingHorizontal: 32, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: colors.text },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: "center", lineHeight: 20 },
});
