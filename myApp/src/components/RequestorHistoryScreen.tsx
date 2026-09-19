import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter, type RelativePathString } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useState, type ComponentProps } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import BrandLogo from "./BrandLogo";
import type { BloodRequest, RequestStatus, UrgencyLevel } from "../lib/apiTypes";
import { fetchMyRequests } from "../lib/bloodRequests";
import { describeApiFailure, type ApiFailure } from "../lib/errors";
import { formatAbsoluteTime, formatPostedAgo } from "../lib/format";
import {
  OUTCOME_BY_STATUS,
  REQUEST_STATUS_LABELS,
  STATUS_NOTES,
  bloodBoxLabel,
  type RequestOutcome,
} from "../lib/requestStatus";
import { colors } from "../theme/colors";
import { requestorHistoryStyles as styles } from "../styles/requestorHistoryStyles";

/** "all" is the pseudo-filter; the rest are the buckets OUTCOME_BY_STATUS returns. */
type Category = "all" | RequestOutcome;

const TAB_LABELS: Record<Category, string> = {
  all: "All",
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
};

/**
 * Unlike the donor home feed, this screen shows nothing until the fetch has
 * answered — no fallback to the hardcoded records it used to render. A
 * requestor seeing an invented fulfilled request would believe a patient had
 * been helped.
 */
type HistoryState =
  | { status: "loading" }
  | { status: "ready"; requests: BloodRequest[] }
  | { status: "error"; error: ApiFailure };

const URGENCY_ACCENT: Record<UrgencyLevel, ViewStyle> = {
  critical: styles.accentCritical,
  urgent: styles.accentUrgent,
  routine: styles.accentNeutral,
};

const URGENCY_BADGE: Record<UrgencyLevel, { badge: ViewStyle; text: TextStyle; label: string }> = {
  critical: { badge: styles.critical, text: styles.criticalText, label: "CRITICAL" },
  urgent: { badge: styles.urgent, text: styles.amberText, label: "URGENT" },
  routine: { badge: styles.routine, text: styles.slateText, label: "ROUTINE" },
};

const OUTCOME_NOTICE_APPEARANCE: Record<
  RequestStatus,
  { icon: ComponentProps<typeof MaterialIcons>["name"]; iconColor: string; iconWrap: ViewStyle }
> = {
  draft: { icon: "edit-note", iconColor: colors.mutedText, iconWrap: styles.outcomeIconNeutral },
  pending_verification: { icon: "info-outline", iconColor: "#1d4ed8", iconWrap: styles.outcomeIconBlue },
  active: { icon: "broadcast-on-personal", iconColor: colors.emeraldText, iconWrap: styles.outcomeIconGreen },
  partially_matched: { icon: "broadcast-on-personal", iconColor: colors.amberText, iconWrap: styles.outcomeIconAmber },
  fully_matched: { icon: "info-outline", iconColor: "#1d4ed8", iconWrap: styles.outcomeIconBlue },
  fulfilled: { icon: "check-circle-outline", iconColor: colors.emeraldText, iconWrap: styles.outcomeIconGreen },
  closed: { icon: "info-outline", iconColor: colors.mutedText, iconWrap: styles.outcomeIconNeutral },
  rejected: { icon: "cancel", iconColor: "#be123c", iconWrap: styles.outcomeIconRose },
  expired: { icon: "schedule", iconColor: colors.amberText, iconWrap: styles.outcomeIconAmber },
  cancelled: { icon: "cancel", iconColor: "#be123c", iconWrap: styles.outcomeIconRose },
};

/**
 * The exact status badge, for all ten — the tabs group, but the card states.
 *
 * A Record rather than a chain of ternaries: the mock this replaces could only
 * express five statuses, so a fully-matched or expired request would have been
 * coloured as something it wasn't.
 */
const STATUS_APPEARANCE: Record<RequestStatus, { badge: ViewStyle; text: TextStyle }> = {
  draft: { badge: styles.routine, text: styles.slateText },
  pending_verification: { badge: styles.statusBlue, text: styles.blueText },
  active: { badge: styles.statusBlue, text: styles.blueText },
  partially_matched: { badge: styles.statusAmber, text: styles.amberText },
  fully_matched: { badge: styles.statusGreen, text: styles.emeraldText },
  fulfilled: { badge: styles.statusGreen, text: styles.emeraldText },
  closed: { badge: styles.routine, text: styles.slateText },
  rejected: { badge: styles.statusRose, text: styles.cancelledText },
  expired: { badge: styles.routine, text: styles.slateText },
  cancelled: { badge: styles.statusRose, text: styles.cancelledText },
};

/**
 * Why a request ended, for the settled statuses the backend records no reason
 * for. `cancellation_reason` is only ever set by a poster-initiated cancel, so
 * a rejection, expiry or closure has nothing to print otherwise — and a blank
 * "Cancellation Reason" box on a rejected request would read as missing data.
 *
 * The wording lives in `STATUS_NOTES` alongside the rest of the status copy,
 * because the requestor's detail screen needs the same sentences to explain
 * why it isn't offering the poster any actions.
 */
function RequestCard({ request }: { request: BloodRequest }) {
  const router = useRouter();
  const outcome = OUTCOME_BY_STATUS[request.status];
  const isActive = outcome === "active";
  const isFulfilled = request.status === "fulfilled";

  const urgencyBadge = URGENCY_BADGE[request.urgency_level];
  const statusBadge = STATUS_APPEARANCE[request.status];
  const outcomeAppearance = OUTCOME_NOTICE_APPEARANCE[request.status];

  // units_needed is constrained > 0 in the DB, but a divide-by-zero would
  // render a broken bar rather than an error, so it is guarded anyway.
  const ratio = request.units_needed > 0 ? request.units_secured / request.units_needed : 0;
  const progress = Math.max(0, Math.min(100, Math.round(ratio * 100)));
  const stillNeeded = Math.max(0, request.units_needed - request.units_secured);
  const settledNote = request.cancellation_reason ?? STATUS_NOTES[request.status];

  return (
    <View style={styles.card}>
      <View style={[styles.accent, URGENCY_ACCENT[request.urgency_level]]} />
      <View style={styles.badgeRow}>
        <View style={[styles.badge, urgencyBadge.badge]}>
          <Text style={[styles.badgeText, urgencyBadge.text]}>● {urgencyBadge.label}</Text>
        </View>
        <View style={[styles.badge, statusBadge.badge]}>
          <Text style={[styles.badgeText, statusBadge.text]}>
            {REQUEST_STATUS_LABELS[request.status]}
          </Text>
        </View>
        {request.is_hospital_backed ? (
          <View style={styles.verified}>
            <Text style={styles.verifiedText}>✓ Verified Hospital</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.patientRow}>
        <View style={styles.patientCopy}>
          <Text style={styles.eyebrow}>PATIENT</Text>
          <Text style={styles.patient}>{request.patient_name}</Text>
          <View style={styles.hospitalRow}>
            <MaterialIcons name="domain" size={14} color="#94a3b8" />
            <Text style={styles.hospital}>
              {request.hospital_name_text ?? request.area_label ?? "Location not specified"}
            </Text>
          </View>
        </View>
        <View
          style={[
            styles.bloodBox,
            request.urgency_level === "urgent" && styles.bloodAmber,
            !isActive && styles.bloodNeutral,
          ]}
        >
          <Text style={[styles.blood, !isActive && styles.slateText]}>
            {request.blood_type_needed}
          </Text>
          <Text style={[styles.bloodLabel, !isActive && styles.slateText]}>
            {bloodBoxLabel(request.status)}
          </Text>
        </View>
      </View>

      {isActive ? (
        <>
          <View style={styles.progressBox}>
            <View style={styles.rowBetween}>
              <Text style={styles.label}>Units Progress</Text>
              <Text style={styles.value}>
                {request.units_secured} of {request.units_needed} units secured
              </Text>
            </View>
            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  request.urgency_level === "urgent" && styles.fillAmber,
                  { width: `${progress}%` },
                ]}
              />
            </View>
            <View style={styles.rowBetween}>
              <Text style={styles.meta}>
                {request.units_secured
                  ? `${request.units_secured} unit${request.units_secured === 1 ? "" : "s"} committed`
                  : "Searching nearby active donors"}
              </Text>
              <Text style={styles.metaAccent}>
                {stillNeeded} {stillNeeded === 1 ? "more needed" : "units needed"}
              </Text>
            </View>
          </View>
          <View style={styles.logistics}>
            <View style={styles.logisticsItem}>
              <Text style={styles.logisticsLabel}>⌖ Search Radius</Text>
              <Text style={styles.logisticsValue}>Within {request.current_radius_km} km</Text>
            </View>
            <View
              style={[
                styles.logisticsItem,
                request.urgency_level === "critical" && styles.logisticsCritical,
              ]}
            >
              <Text style={styles.logisticsLabel}>◷ Required By</Text>
              <Text style={styles.logisticsValue}>{formatAbsoluteTime(request.required_by)}</Text>
            </View>
          </View>
        </>
      ) : (
        <View style={styles.summaryBox}>
          <View style={styles.summaryHeader}>
            <View style={[styles.outcomeIcon, outcomeAppearance.iconWrap]}>
              <MaterialIcons name={outcomeAppearance.icon} size={16} color={outcomeAppearance.iconColor} />
            </View>
            <View style={styles.outcomeCopy}>
              <Text style={styles.label}>{isFulfilled ? "Final Units Tally" : "Outcome"}</Text>
              {isFulfilled ? (
                <Text style={styles.value}>
                  {request.units_secured}/{request.units_needed} Units Secured
                </Text>
              ) : null}
            </View>
          </View>
          {!isFulfilled && settledNote ? <Text style={styles.reason}>{settledNote}</Text> : null}
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.posted}>{formatPostedAgo(request.created_at)}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/requestor/request/${request.id}` as RelativePathString)}
        >
          <Text style={styles.action}>{isActive ? "Manage Request ›" : "View Details ›"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function LoadingState() {
  return (
    <View style={styles.loadingState}>
      <ActivityIndicator color={colors.crimson} />
      <Text style={styles.loadingText}>Loading your request history…</Text>
    </View>
  );
}

function ErrorState({ error, onRetry }: { error: ApiFailure; onRetry: () => void }) {
  return (
    <View style={styles.errorState}>
      <View style={styles.errorIcon}>
        <MaterialIcons name="cloud-off" size={28} color={colors.crimson} />
      </View>
      <Text style={styles.errorTitle}>Couldn&apos;t Load Your History</Text>
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

function EmptyState() {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <MaterialIcons name="filter-list-off" size={24} color={colors.mutedText} />
      </View>
      <Text style={styles.emptyTitle}>No requests found</Text>
      <Text style={styles.emptyText}>
        There are no records matching the selected status.
      </Text>
    </View>
  );
}

export default function RequestorHistoryScreen() {
  const router = useRouter();
  const [selected, setSelected] = useState<Category>("all");
  const [history, setHistory] = useState<HistoryState>({ status: "loading" });

  // Bumping this re-runs the focus effect below — which is all "Try Again" is.
  const [reloadToken, setReloadToken] = useState(0);

  // Same endpoint as the requestor home, unfiltered: this screen takes
  // everything, including the statuses home deliberately leaves out.
  //
  // reloadToken is never read in here — it is in the dependency list so that
  // "Try Again" can force a new callback identity, which is what makes the
  // focus effect run again while the screen is already focused.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function load() {
        setHistory((current) => (current.status === "ready" ? current : { status: "loading" }));

        try {
          const requests = await fetchMyRequests();
          if (!cancelled) setHistory({ status: "ready", requests });
        } catch (error) {
          if (!cancelled) {
            setHistory({
              status: "error",
              error: describeApiFailure(error, "Something went wrong loading your history."),
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

  const requests = history.status === "ready" ? history.requests : [];

  // Counted off the real records, using the same mapping the tabs filter by —
  // so the numbers on the chips always add up to the "All" count.
  const counts: Record<Category, number> = {
    all: requests.length,
    active: 0,
    completed: 0,
    cancelled: 0,
  };
  for (const request of requests) {
    counts[OUTCOME_BY_STATUS[request.status]] += 1;
  }

  const visible =
    selected === "all"
      ? requests
      : requests.filter((request) => OUTCOME_BY_STATUS[request.status] === selected);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.screen}>
        <View style={styles.header}>
          <BrandLogo size={40} style={styles.logo} />
          <View style={styles.brandCopy}>
            <Text style={styles.brand}>BloodBridge</Text>
            <Text style={styles.portal}>REQUESTOR PORTAL</Text>
          </View>
          {/* Hidden until the count is real — "0 Records" during the fetch
              looks like an empty history. */}
          {history.status === "ready" ? (
            <View style={styles.records}>
              <Text style={styles.recordsText}>
                {requests.length} Record{requests.length === 1 ? "" : "s"}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.content}>
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>Request History</Text>
            <Text style={styles.subtitle}>Manage and track your emergency broadcasts</Text>

            {history.status === "ready" ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filters}
              >
                {(["all", "active", "completed", "cancelled"] as const).map((key) => (
                  <Pressable
                    key={key}
                    onPress={() => setSelected(key)}
                    style={[styles.filter, selected === key && styles.filterActive]}
                  >
                    <Text style={[styles.filterText, selected === key && styles.filterTextActive]}>
                      {TAB_LABELS[key]} ({counts[key]})
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}

            {history.status === "loading" ? <LoadingState /> : null}
            {history.status === "error" ? (
              <ErrorState
                error={history.error}
                onRetry={() => setReloadToken((token) => token + 1)}
              />
            ) : null}

            {history.status === "ready" ? (
              visible.length ? (
                visible.map((request) => <RequestCard key={request.id} request={request} />)
              ) : (
                <EmptyState />
              )
            ) : null}
          </ScrollView>
        </View>

        <View style={styles.bottom}>
          <Pressable onPress={() => router.replace("/requestor-home" as RelativePathString)} style={styles.tab}>
            <MaterialIcons name="water-drop" size={22} color="#6b7280" />
            <Text style={styles.tabText}>Requests</Text>
          </Pressable>
          <Pressable style={styles.tab}>
            <MaterialIcons name="history" size={22} color={colors.crimson} />
            <Text style={[styles.tabText, styles.tabActive]}>History</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/requestor/profile" as RelativePathString)} style={styles.tab}>
            <MaterialIcons name="person-outline" size={22} color="#6b7280" />
            <Text style={styles.tabText}>Profile</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
