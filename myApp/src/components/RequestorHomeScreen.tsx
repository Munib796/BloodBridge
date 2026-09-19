import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter, type RelativePathString } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import BrandLogo from "./BrandLogo";
import type { BloodRequest, UrgencyLevel } from "../lib/apiTypes";
import { fetchMyRequests } from "../lib/bloodRequests";
import { describeApiFailure, type ApiFailure } from "../lib/errors";
import { formatAbsoluteTime, formatPostedAgo } from "../lib/format";
import { REQUEST_STATUS_LABELS, isInFlight } from "../lib/requestStatus";
import { colors } from "../theme/colors";
import { requestorHomeStyles as styles } from "../styles/requestorHomeStyles";

/**
 * Home shows only what is still in flight; everything settled lives on the
 * history screen. Both read the same endpoint, so the split is here rather
 * than in the query — see `isInFlight` for why the set is wider than the
 * backend's own OPEN_STATUSES.
 */
type BroadcastState =
  | { status: "loading" }
  | { status: "ready"; requests: BloodRequest[] }
  | { status: "error"; error: ApiFailure };

/**
 * Per-urgency styling as a complete record, the same shape the donor screens
 * use. The mock this replaces typed urgency as `"critical" | "urgent"` and
 * dropped the third level, so a routine request would have rendered as urgent.
 */
const URGENCY_APPEARANCE: Record<
  UrgencyLevel,
  {
    label: string;
    badge: ViewStyle;
    text: TextStyle;
    accent: ViewStyle;
    bloodBox: ViewStyle | null;
    bloodText: TextStyle | null;
    progress: ViewStyle | null;
  }
> = {
  critical: {
    label: "CRITICAL",
    badge: styles.critical,
    text: styles.criticalText,
    accent: styles.accent,
    // The base card is already crimson, which is what critical wants.
    bloodBox: null,
    bloodText: null,
    progress: null,
  },
  urgent: {
    label: "URGENT",
    badge: styles.statusAmber,
    text: styles.statusText,
    accent: styles.accentAmber,
    bloodBox: styles.bloodAmber,
    bloodText: styles.bloodAmberText,
    progress: styles.progressAmber,
  },
  routine: {
    label: "ROUTINE",
    badge: styles.routine,
    text: styles.routineText,
    accent: styles.accentNeutral,
    bloodBox: styles.bloodNeutral,
    bloodText: styles.bloodNeutralText,
    progress: styles.progressNeutral,
  },
};

function emptyUnitsMessage(request: BloodRequest): string {
  return request.units_secured
    ? `${request.units_secured} unit${request.units_secured === 1 ? "" : "s"} committed`
    : "Searching nearby active donors";
}

function BroadcastCard({ request, onManage }: { request: BloodRequest; onManage: () => void }) {
  const appearance = URGENCY_APPEARANCE[request.urgency_level];
  const critical = request.urgency_level === "critical";

  // units_needed is constrained > 0 in the DB, but a divide-by-zero would
  // render a broken bar rather than an error, so it is guarded anyway.
  const ratio = request.units_needed > 0 ? request.units_secured / request.units_needed : 0;
  const percent = Math.max(0, Math.min(100, Math.round(ratio * 100)));
  const stillNeeded = Math.max(0, request.units_needed - request.units_secured);

  return (
    <View style={styles.card}>
      <View style={[styles.accent, appearance.accent]} />
      <View style={styles.cardBody}>
        <View style={styles.badges}>
          <View style={styles.badgeGroup}>
            <View style={appearance.badge}>
              <Text style={appearance.text}>● {appearance.label}</Text>
            </View>
            {/* The real status, worded by the shared table — a hospital-backed
                request sits in Awaiting Verification until the hospital acts,
                which is the poster's cue that it has not gone out yet. */}
            <View style={styles.statusAmber}>
              <Text style={styles.statusText}>{REQUEST_STATUS_LABELS[request.status]}</Text>
            </View>
          </View>
          <View style={request.is_hospital_backed ? styles.verified : styles.routine}>
            <Text style={request.is_hospital_backed ? styles.verifiedText : styles.routineText}>
              {request.is_hospital_backed ? "✓ Verified Hospital" : "Unverified"}
            </Text>
          </View>
        </View>
        <View style={styles.patientRow}>
          <View style={styles.patientCopy}>
            <Text style={styles.eyebrow}>Patient</Text>
            <Text style={styles.patient}>{request.patient_name}</Text>
            <Text style={styles.hospital}>
              {request.hospital_name_text ?? request.area_label ?? "Location not specified"}
            </Text>
          </View>
          <View style={[styles.bloodNeeded, appearance.bloodBox]}>
            <Text style={[styles.bloodType, appearance.bloodText]}>{request.blood_type_needed}</Text>
            <Text style={[styles.needed, appearance.bloodText]}>NEEDED</Text>
          </View>
        </View>
        <View style={styles.unitBox}>
          <View style={styles.unitRow}>
            <Text style={styles.unitLabel}>Units Progress</Text>
            <Text style={styles.unitValue}>
              {request.units_secured} of {request.units_needed} units secured
            </Text>
          </View>
          <View style={styles.progress}>
            <View style={[styles.progressFill, appearance.progress, { width: `${percent}%` }]} />
          </View>
          <View style={styles.unitMeta}>
            <Text style={styles.meta}>{emptyUnitsMessage(request)}</Text>
            <Text style={styles.metaAccent}>
              {stillNeeded} more needed
            </Text>
          </View>
        </View>
        <View style={styles.logistics}>
          <View style={styles.logisticsItem}>
            <MaterialIcons name="location-on" size={15} color={colors.crimson} />
            <View>
              <Text style={styles.logisticsLabel}>Search Radius</Text>
              <Text style={styles.logisticsValue}>Within {request.current_radius_km} km</Text>
            </View>
          </View>
          <View style={styles.logisticsItem}>
            <MaterialIcons name="schedule" size={15} color={critical ? colors.crimson : colors.mutedText} />
            <View>
              <Text style={styles.logisticsLabel}>Required By</Text>
              <Text style={[styles.logisticsValue, critical && { color: colors.crimson }]}>
                {formatAbsoluteTime(request.required_by)}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.footer}>
          <Text style={styles.posted}>{formatPostedAgo(request.created_at)}</Text>
          <Pressable accessibilityRole="button" onPress={onManage}>
            <Text style={styles.manage}>Manage Request ›</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function LoadingState() {
  return (
    <View style={styles.loadingState}>
      <ActivityIndicator color={colors.crimson} />
      <Text style={styles.loadingText}>Loading your broadcasts…</Text>
    </View>
  );
}

function ErrorState({ error, onRetry }: { error: ApiFailure; onRetry: () => void }) {
  return (
    <View style={styles.errorState}>
      <View style={styles.errorIcon}>
        <MaterialIcons name="cloud-off" size={30} color={colors.crimson} />
      </View>
      <Text style={styles.errorTitle}>Couldn&apos;t Load Your Requests</Text>
      <Text style={styles.errorText}>{error.message}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
      >
        <MaterialIcons name="refresh" size={16} color={colors.surface} />
        <Text style={styles.retryText}>Try Again</Text>
      </Pressable>
    </View>
  );
}

function NoRequests() {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <MaterialIcons name="water-drop" size={40} color={colors.crimson} />
      </View>
      <Text style={styles.emptyTitle}>No Active Requests</Text>
      <Text style={styles.emptyText}>
        When you or your patient needs blood, create an emergency broadcast
        to reach verified donors within minutes.
      </Text>
    </View>
  );
}

export default function RequestorHomeScreen() {
  const router = useRouter();
  const [broadcasts, setBroadcasts] = useState<BroadcastState>({ status: "loading" });

  // Bumping this re-runs the focus effect below — which is all "Try Again" is.
  const [reloadToken, setReloadToken] = useState(0);

  // Refetch on focus, not just on mount: this is what makes a request created
  // on the create screen appear the moment that screen pops back to this one.
  //
  // reloadToken is never read in here — it is in the dependency list so that
  // "Try Again" can force a new callback identity, which is what makes the
  // focus effect run again while the screen is already focused.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function load() {
        setBroadcasts((current) => (current.status === "ready" ? current : { status: "loading" }));

        try {
          const requests = await fetchMyRequests();
          // Filtered here rather than on the server: the history screen wants
          // the whole list, and re-requesting per screen would be a round trip
          // to learn what is already in hand.
          if (!cancelled) {
            setBroadcasts({ status: "ready", requests: requests.filter((request) => isInFlight(request.status)) });
          }
        } catch (error) {
          if (!cancelled) {
            setBroadcasts({
              status: "error",
              error: describeApiFailure(error, "Something went wrong loading your requests."),
            });
          }
        }
      }

      void load();

      return () => {
        cancelled = true;
      };
    }, [reloadToken]),
  );

  const requests = broadcasts.status === "ready" ? broadcasts.requests : [];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.screen}>
        <View style={styles.header}>
          <BrandLogo size={40} style={styles.logo} />
          <View style={styles.brandCopy}>
            <Text style={styles.brand}>BloodBridge</Text>
            <Text style={styles.portal}>Requestor Portal</Text>
          </View>
        </View>
        <View style={styles.content}>
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
          >
            <Pressable
              onPress={() =>
                router.push("/create-emergency-request" as RelativePathString)
              }
              style={({ pressed }) => [
                styles.createButton,
                pressed && { opacity: 0.96 },
              ]}
            >
              <View style={styles.createLead}>
                <View style={styles.createIcon}>
                  <MaterialIcons name="add" size={25} color={colors.surface} />
                </View>
                <View>
                  <Text style={styles.createTitle}>
                    Create Emergency Request
                  </Text>
                  <Text style={styles.createSubtitle}>
                    Broadcast instantly to verified nearby donors
                  </Text>
                </View>
              </View>
            </Pressable>

            {broadcasts.status === "loading" ? <LoadingState /> : null}
            {broadcasts.status === "error" ? (
              <ErrorState
                error={broadcasts.error}
                onRetry={() => setReloadToken((token) => token + 1)}
              />
            ) : null}

            {broadcasts.status === "ready" && requests.length === 0 ? <NoRequests /> : null}

            {broadcasts.status === "ready" && requests.length > 0 ? (
              <>
                <View style={styles.feedHeader}>
                  <View style={styles.feedLead}>
                    <Text style={styles.feedTitle}>Your Broadcasts</Text>
                    <Text style={styles.activeCount}>
                      {requests.length} In Flight
                    </Text>
                  </View>
                  {/* The endpoint orders by created_at DESC — the old "Sorted
                      by urgency" label described the mock's ordering, not this
                      one's. */}
                  <Text style={styles.sort}>Newest first</Text>
                </View>
                {requests.map((request) => (
                  <BroadcastCard
                    key={request.id}
                    request={request}
                    onManage={() => router.push(`/requestor/request/${request.id}` as RelativePathString)}
                  />
                ))}
              </>
            ) : null}
          </ScrollView>
        </View>
        <View style={styles.bottomTabs}>
          <Pressable style={styles.tab}>
            <MaterialIcons name="water-drop" size={22} color={colors.crimson} />
            <Text style={[styles.tabText, styles.tabActive]}>Requests</Text>
          </Pressable>
          <Pressable
            onPress={() =>
              router.push("/requestor-history" as RelativePathString)
            }
            style={styles.tab}
          >
            <MaterialIcons name="history" size={22} color="#6b7280" />
            <Text style={styles.tabText}>History</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/messages" as RelativePathString)}
            style={styles.tab}
          >
            <MaterialIcons name="chat-bubble-outline" size={22} color="#6b7280" />
            <Text style={styles.tabText}>Messages</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/requestor/profile" as RelativePathString)}
            style={styles.tab}
          >
            <MaterialIcons name="person-outline" size={22} color="#6b7280" />
            <Text style={styles.tabText}>Profile</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
