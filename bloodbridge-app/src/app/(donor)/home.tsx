import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { fetchNearbyRequests } from "@/api/bloodRequests";
import { updateDonorLocation } from "@/api/donors";
import type { NearbyBloodRequest } from "@/api/types";
import { RequestCard } from "@/components/RequestCard";
import { Screen } from "@/components/Screen";
import { useAuthStore } from "@/store/authStore";
import { colors } from "@/theme/colors";

export default function DonorHomeScreen() {
  const self = useAuthStore((s) => s.self);
  const setSelf = useAuthStore((s) => s.setSelf);
  const [goingAvailable, setGoingAvailable] = useState(false);
  const queryClient = useQueryClient();

  const isAvailable = !!self && "area_label" in self && !!self.area_label;

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ["nearby-requests"],
    queryFn: fetchNearbyRequests,
    enabled: isAvailable,
    refetchInterval: 30_000, // keep the feed fresh without the user having to pull-to-refresh
  });

  async function handleGoAvailable() {
    setGoingAvailable(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Location needed",
          "BloodBridge needs your location to show you nearby requests and let you know how far away they are."
        );
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      const places = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      const areaLabel = places[0]
        ? [places[0].district, places[0].city].filter(Boolean).join(", ")
        : "My area";

      const updated = await updateDonorLocation(
        position.coords.latitude,
        position.coords.longitude,
        areaLabel || "My area"
      );
      setSelf(updated);
      queryClient.invalidateQueries({ queryKey: ["nearby-requests"] });
    } catch (err) {
      Alert.alert("Couldn't get location", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setGoingAvailable(false);
    }
  }

  if (!isAvailable) {
    return (
      <Screen>
        <View style={styles.centeredPrompt}>
          <Text style={styles.promptTitle}>You're not visible to requests yet</Text>
          <Text style={styles.promptSubtitle}>
            Turn on availability so nearby patients can find you when they need your blood type.
          </Text>
          <Pressable style={styles.availabilityButton} onPress={handleGoAvailable} disabled={goingAvailable}>
            {goingAvailable ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.availabilityButtonText}>I'm available to donate</Text>
            )}
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Nearby requests</Text>
          <Text style={styles.headerSubtitle}>{self && "area_label" in self ? self.area_label : ""}</Text>
        </View>
        <Pressable onPress={handleGoAvailable} disabled={goingAvailable}>
          <Text style={styles.refreshLocationLink}>{goingAvailable ? "Updating..." : "Update location"}</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : isError ? (
        <View style={styles.centeredPrompt}>
          <Text style={styles.promptSubtitle}>{error instanceof Error ? error.message : "Something went wrong."}</Text>
        </View>
      ) : (
        <FlatList<NearbyBloodRequest>
          data={data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshing={isRefetching}
          onRefresh={refetch}
          ListEmptyComponent={
            <View style={styles.centeredPrompt}>
              <Text style={styles.promptTitle}>No requests nearby right now</Text>
              <Text style={styles.promptSubtitle}>
                We'll refresh automatically — pull down to check right away.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable onPress={() => router.push(`/request/${item.id}`)}>
              <RequestCard request={item} />
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
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTitle: { fontSize: 22, fontWeight: "800", color: colors.text },
  headerSubtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  refreshLocationLink: { fontSize: 13, color: colors.primary, fontWeight: "700", marginTop: 6 },
  listContent: { paddingHorizontal: 20, paddingBottom: 24 },
  centeredPrompt: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingTop: 80,
    gap: 12,
  },
  promptTitle: { fontSize: 18, fontWeight: "700", color: colors.text, textAlign: "center" },
  promptSubtitle: { fontSize: 14, color: colors.textMuted, textAlign: "center", lineHeight: 20 },
  availabilityButton: {
    marginTop: 12,
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
  },
  availabilityButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
