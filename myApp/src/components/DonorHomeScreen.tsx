import { MaterialIcons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect, useRouter, type RelativePathString } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import BrandLogo from "./BrandLogo";
import { useAuth } from "../context/AuthContext";
import type { NearbyBloodRequest, UrgencyLevel } from "../lib/apiTypes";
import { describeFeedError, fetchNearbyRequests, type FeedError } from "../lib/bloodRequests";
import { formatDeadlineCountdown, formatDistanceKm } from "../lib/format";
import { donorHomeStyles as styles } from "../styles/donorHomeStyles";
import { colors } from "../theme/colors";

/**
 * The feed has three states and no fourth. There is deliberately no "show the
 * old hardcoded list" fallback: a donor acting on invented requests during an
 * outage is worse than a donor seeing that the feed failed.
 */
type FeedState =
  | { status: "loading" }
  | { status: "ready"; requests: NearbyBloodRequest[] }
  | { status: "error"; error: FeedError };

/**
 * Per-urgency styling, as a complete record rather than a chain of ternaries.
 *
 * Routine is a real third level — the mock feed typed urgency as
 * "critical" | "urgent" and silently dropped it, so a routine request would
 * have rendered as urgent.
 */
const URGENCY_APPEARANCE: Record<
  UrgencyLevel,
  { label: string; badge: ViewStyle; dot: ViewStyle; text: TextStyle; accent: ViewStyle | null }
> = {
  critical: { label: "Critical", badge: styles.criticalBadge, dot: styles.criticalDot, text: styles.criticalText, accent: styles.criticalAccent },
  // The base accent bar is already amber, which is what urgent wants.
  urgent: { label: "Urgent", badge: styles.urgentBadge, dot: styles.urgentDot, text: styles.urgentText, accent: null },
  routine: { label: "Routine", badge: styles.routineBadge, dot: styles.routineDot, text: styles.routineText, accent: styles.routineAccent },
};

function RequestCard({ request, onPress }: { request: NearbyBloodRequest; onPress: () => void }) {
  const critical = request.urgency_level === "critical";
  const appearance = URGENCY_APPEARANCE[request.urgency_level];

  // units_needed is constrained > 0 in the DB, but a divide-by-zero would
  // render a broken bar rather than an error, so it is guarded anyway.
  const ratio = request.units_needed > 0 ? request.units_secured / request.units_needed : 0;
  const progress = Math.max(0, Math.min(100, ratio * 100));

  return (
    <Pressable onPress={onPress} style={[styles.requestCard, critical && styles.criticalCard]}>
      <View style={[styles.accent, appearance.accent]} />
      <View style={styles.cardInner}>
        <View style={styles.cardHeader}>
          <View style={styles.cardIdentity}>
            <View style={[styles.neededBadge, critical && styles.neededBadgeCritical]}>
              <Text style={[styles.neededType, critical && styles.neededTypeCritical]}>{request.blood_type_needed}</Text>
              <Text style={[styles.neededLabel, critical && styles.neededLabelCritical]}>Needed</Text>
            </View>
            <View style={styles.cardDetails}>
              <View style={styles.badgeRow}>
                <View style={[styles.urgencyBadge, appearance.badge]}>
                  <View style={[styles.urgencyDot, appearance.dot]} />
                  <Text style={[styles.urgencyText, appearance.text]}>{appearance.label}</Text>
                </View>
                <View style={[styles.verifiedBadge, !request.is_hospital_backed && styles.unverifiedBadge]}>
                  <Text style={[styles.verifiedText, !request.is_hospital_backed && styles.unverifiedText]}>{request.is_hospital_backed ? "Verified" : "Unverified"}</Text>
                </View>
              </View>
              <View style={styles.locationRow}>
                <MaterialIcons name="location-on" size={14} color="#94a3b8" />
                <Text style={styles.area} numberOfLines={1}>{request.area_label ?? "Area not specified"}</Text>
                <Text style={styles.distance}>· {formatDistanceKm(request.distance_km)}</Text>
              </View>
            </View>
          </View>
          <MaterialIcons name="chevron-right" size={21} color="#94a3b8" style={styles.chevron} />
        </View>
        <View style={styles.divider} />
        <View style={styles.progressRow}><Text style={styles.progressLabel}>Progress</Text><Text style={styles.progressValue}>{request.units_secured} of {request.units_needed} units secured</Text></View>
        <View style={styles.progressTrack}><View style={[styles.progressFill, critical && styles.progressFillCritical, { width: `${progress}%` }]} /></View>
        <View style={styles.deadlineRow}>
          <View style={styles.deadline}><MaterialIcons name="schedule" size={14} color={critical ? colors.crimson : colors.amberText} /><Text style={[styles.deadlineText, critical ? styles.deadlineCritical : styles.deadlineUrgent]}>{formatDeadlineCountdown(request.required_by)}</Text></View>
          <Text style={styles.detailsLink}>View Details →</Text>
        </View>
      </View>
    </Pressable>
  );
}

function LoadingState() {
  return (
    <View style={styles.loadingState}>
      <ActivityIndicator color={colors.crimson} />
      <Text style={styles.loadingText}>Checking for requests near you…</Text>
    </View>
  );
}

function ErrorState({
  error,
  onRetry,
  onOpenProfile,
}: {
  error: FeedError;
  onRetry: () => void;
  onOpenProfile: () => void;
}) {
  // The one failure the donor can fix, and the fix is on another screen.
  const needsLocation = error.kind === "no-location";

  return (
    <View style={styles.errorState}>
      <View style={styles.errorIcon}>
        <MaterialIcons name={needsLocation ? "location-off" : "cloud-off"} size={30} color={colors.crimson} />
      </View>
      <Text style={styles.errorTitle}>{needsLocation ? "Set Your Location First" : "Couldn't Load Requests"}</Text>
      <Text style={styles.errorText}>{error.message}</Text>
      <View style={styles.errorActions}>
        {needsLocation ? (
          <Pressable accessibilityRole="button" onPress={onOpenProfile} style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}>
            <MaterialIcons name="edit-location-alt" size={16} color="#ffffff" />
            <Text style={styles.retryText}>Go to Profile</Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => (needsLocation ? [styles.secondaryButton, pressed && styles.pressed] : [styles.retryButton, pressed && styles.pressed])}>
          <Text style={needsLocation ? styles.secondaryText : styles.retryText}>Try Again</Text>
        </Pressable>
      </View>
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}><MaterialIcons name="check-circle-outline" size={32} color={colors.crimson} /></View>
      <Text style={styles.emptyTitle}>All Quiet in Your Area</Text>
      <Text style={styles.emptyText}>No urgent requests nearby right now - we&apos;ll notify you the moment someone needs your blood type.</Text>
    </View>
  );
}

export default function DonorHomeScreen() {
  const router = useRouter();
  const { state } = useAuth();
  const [view, setView] = useState<"list" | "map">("list");
  const [feed, setFeed] = useState<FeedState>({ status: "loading" });

  // Bumping this re-runs the focus effect below — which is all "Try Again" is.
  const [reloadToken, setReloadToken] = useState(0);

  const profile = state.status === "signedIn" && state.role === "donor" ? state.profile : null;

  // Refetch on focus, not just on mount: accepting a request in the detail
  // screen is exactly what should remove it from this list, and the backend
  // already excludes anything the donor has committed to.
  //
  // reloadToken is never read in here — it is in the dependency list so that
  // "Try Again" can force a new callback identity, which is what makes the
  // focus effect run again while the screen is already focused.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function load() {
        setFeed({ status: "loading" });
        try {
          const requests = await fetchNearbyRequests();
          if (!cancelled) setFeed({ status: "ready", requests });
        } catch (error) {
          if (!cancelled) setFeed({ status: "error", error: describeFeedError(error) });
        }
      }

      void load();

      return () => {
        cancelled = true;
      };
    }, [reloadToken]),
  );

  const requestCount = feed.status === "ready" ? feed.requests.length : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.brand}><BrandLogo size={36} /><View><Text style={styles.brandName}>BloodBridge</Text><Text style={styles.portalLabel}>Donor Portal</Text></View></View>
        </View>

        <View style={styles.content}>
          <View style={styles.summary}>
            <View style={styles.summaryCopy}>
              <View style={styles.summaryLabelRow}>
                <Text style={styles.summaryLabel}>Your Blood Group</Text>
                <View style={styles.bloodBadge}><Text style={styles.bloodBadgeText}>{profile?.blood_type ?? "—"}</Text></View>
              </View>
              <Text style={styles.summaryText}>
                {requestCount === null ? "Checking for requests near you" : <>Compatible with <Text style={styles.summaryAccent}>{requestCount} active request{requestCount === 1 ? "" : "s"}</Text> nearby</>}
              </Text>
            </View>
            <Pressable onPress={() => router.push("/profile" as RelativePathString)} style={styles.locationButton}><MaterialIcons name="location-on" size={15} color="#475569" /><Text style={styles.locationText}>Update location</Text></Pressable>
          </View>
          <View style={styles.segmented}>
            <Pressable onPress={() => setView("list")} style={[styles.segment, view === "list" && styles.segmentActive]}><MaterialIcons name="format-list-bulleted" size={15} color={view === "list" ? colors.text : "#64748b"} /><Text style={[styles.segmentText, view === "list" && styles.segmentTextActive]}>List View</Text></Pressable>
            <Pressable onPress={() => setView("map")} style={[styles.segment, view === "map" && styles.segmentActive]}><MaterialIcons name="map" size={15} color={view === "map" ? colors.text : "#64748b"} /><Text style={[styles.segmentText, view === "map" && styles.segmentTextActive]}>Map View</Text></Pressable>
          </View>
          {view === "map" ? <View style={styles.mapPlaceholder}><MaterialIcons name="map" size={36} color="#cbd5e1" /><Text style={styles.mapText}>Map view coming soon</Text></View> : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
              <View style={styles.feedHeader}>
                <Text style={styles.feedTitle}>Active Requests Nearby</Text>
                {/* The backend orders this by distance, not urgency — the old
                    label described the mock's ordering, not this one's. */}
                <Text style={styles.sortLabel}>Nearest first</Text>
              </View>
              {feed.status === "loading" ? <LoadingState /> : null}
              {feed.status === "error" ? (
                <ErrorState
                  error={feed.error}
                  onRetry={() => setReloadToken((token) => token + 1)}
                  onOpenProfile={() => router.push("/profile" as RelativePathString)}
                />
              ) : null}
              {feed.status === "ready" && feed.requests.length === 0 ? <EmptyState /> : null}
              {feed.status === "ready" && feed.requests.length > 0 ? (
                <View style={styles.cards}>
                  {feed.requests.map((request) => (
                    <RequestCard
                      key={request.id}
                      request={request}
                      // The distance travels with the navigation: the detail
                      // endpoint returns BloodRequestOut, which has no
                      // distance_km and no coordinates to recompute it from.
                      onPress={() =>
                        router.push({
                          pathname: "/request/[id]",
                          params: { id: request.id, distanceKm: request.distance_km },
                        })
                      }
                    />
                  ))}
                </View>
              ) : null}
            </ScrollView>
          )}
        </View>
        <View style={styles.bottomBar}>
          <Pressable style={styles.tab}><MaterialIcons name="water-drop" size={23} color={colors.crimson} /><Text style={[styles.tabLabel, styles.activeTabLabel]}>Requests</Text></Pressable>
          <Pressable onPress={() => router.push("/history" as RelativePathString)} style={styles.tab}><MaterialIcons name="history" size={23} color="#6b7280" /><Text style={styles.tabLabel}>History</Text></Pressable>
          <Pressable onPress={() => router.push("/messages" as RelativePathString)} style={styles.tab}><MaterialIcons name="chat-bubble-outline" size={23} color="#6b7280" /><Text style={styles.tabLabel}>Messages</Text></Pressable>
          <Pressable onPress={() => router.push("/profile" as RelativePathString)} style={styles.tab}><MaterialIcons name="person-outline" size={23} color="#6b7280" /><Text style={styles.tabLabel}>Profile</Text></Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
