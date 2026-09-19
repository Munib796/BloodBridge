import { MaterialIcons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect, useRouter, type RelativePathString } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import BrandLogo from "./BrandLogo";
import CancelCommitmentModal, { type CommitmentContext } from "./CancelCommitmentModal";
import { colors } from "../theme/colors";
import { donorHistoryStyles as styles } from "../styles/donorHistoryStyles";
import type { MatchStatus, RequestMatchDetail, RequestStatus, UrgencyLevel } from "../lib/apiTypes";
import { describeApiFailure, type ApiFailure } from "../lib/errors";
import { formatAbsoluteTime, formatArrivalIn, formatDate, formatDistanceKm, formatTimeAgo } from "../lib/format";
import { dialablePakistaniPhone, formatPakistaniPhone } from "../lib/phone";
import {
  cancelMatch,
  completeMatch,
  describeMatchActionError,
  fetchMyMatches,
} from "../lib/requestMatches";

type HistoryCategory = "all" | "active" | "completed" | "cancelled";

/** A card section, which is every category except the pseudo-filter "all". */
type RecordCategory = Exclude<HistoryCategory, "all">;

/**
 * MatchStatus -> the section its card belongs in.
 *
 * A Record rather than a switch, so a fourth status appearing on the backend
 * is a compile error here. With a switch and a `default`, the same status would
 * silently render under no filter at all — a commitment the donor can see in
 * "All" but in none of the tabs, which reads as a missing record.
 */
const CATEGORY_BY_STATUS: Record<MatchStatus, RecordCategory> = {
  accepted: "active",
  completed: "completed",
  cancelled: "cancelled",
};

const CATEGORY_LABELS: Record<RecordCategory, string> = {
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
};

function categoryForMatch(match: RequestMatchDetail): RecordCategory {
  if (
    match.status === "accepted" &&
    ["expired", "cancelled", "rejected", "closed"].includes(match.blood_request.status)
  ) {
    return "cancelled";
  }

  return CATEGORY_BY_STATUS[match.status];
}

/**
 * Per-urgency styling, as a complete record rather than a chain of ternaries —
 * the same shape Donor Home uses. The mock this replaces hardcoded a CRITICAL
 * badge, so every commitment in the list claimed to be critical.
 */
const URGENCY_APPEARANCE: Record<
  UrgencyLevel,
  { label: string; badge: ViewStyle; text: TextStyle }
> = {
  critical: { label: "CRITICAL", badge: styles.criticalBadge, text: styles.criticalText },
  urgent: { label: "URGENT", badge: styles.urgentBadge, text: styles.urgentText },
  routine: { label: "ROUTINE", badge: styles.routineBadge, text: styles.routineText },
};

/**
 * The list has three states and no fourth — in particular no fallback to the
 * hardcoded records this screen used to show. A donor reading a fake completed
 * donation, or worse, a fake *live* commitment they never made, is worse than
 * one who can see the list failed to load.
 */
type HistoryState =
  | { status: "loading" }
  | { status: "ready"; matches: RequestMatchDetail[] }
  | { status: "error"; error: ApiFailure };

function unitsLabel(units: number): string {
  return `${units} unit${units === 1 ? "" : "s"}`;
}

function hospitalOf(match: RequestMatchDetail): string {
  return match.blood_request.hospital_name_text ?? "Hospital not specified";
}

function areaOf(match: RequestMatchDetail): string {
  return match.blood_request.area_label ?? "Area not specified";
}

/** units_needed is `>0` in the DB, but a negative here would render "-1 more units". */
function remainingUnits(match: RequestMatchDetail): number {
  return Math.max(0, match.blood_request.units_needed - match.blood_request.units_secured);
}

function cancelContextFor(match: RequestMatchDetail): CommitmentContext {
  return {
    bloodType: match.blood_request.blood_type_needed,
    urgency: URGENCY_APPEARANCE[match.blood_request.urgency_level].label,
    unitsCommitted: unitsLabel(match.units_committed),
    hospital: hospitalOf(match),
    location: areaOf(match),
    // Already a complete phrase above and below, which is why the sheet renders
    // it bare rather than appending "away" to it.
    distance:
      match.distance_km === null ? "Distance unknown" : formatDistanceKm(match.distance_km),
    remainingUnits: remainingUnits(match),
  };
}

const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  draft: "Draft",
  pending_verification: "Awaiting hospital verification",
  active: "Broadcasting to donors",
  partially_matched: "Partially matched",
  fully_matched: "Fully matched",
  fulfilled: "Request fulfilled",
  closed: "Request closed",
  rejected: "Rejected by hospital",
  expired: "Request expired",
  cancelled: "Request cancelled",
};

function pastOutcome(match: RequestMatchDetail): { icon: "check-circle" | "cancel"; label: string } {
  return match.status === "completed"
    ? { icon: "check-circle", label: "Donation completed" }
    : { icon: "cancel", label: "Commitment cancelled" };
}

function PastRecord({ match }: { match: RequestMatchDetail }) {
  const cancelled = match.status === "cancelled";
  const request = match.blood_request;
  const outcome = pastOutcome(match);
  const router = useRouter();

  return (
    <View style={[styles.pastCard, cancelled && styles.cancelledCard]}>
      <View style={styles.badgeRow}>
        <View style={[styles.pastBadge, cancelled && styles.cancelledBadge]}>
          <MaterialIcons name="water-drop" size={13} color={cancelled ? colors.mutedText : colors.crimson} />
          <Text style={[styles.pastBadgeText, cancelled && styles.cancelledBadgeText]}>
            {request.blood_type_needed} · {unitsLabel(match.units_committed)}
          </Text>
        </View>
        <View style={[styles.completedBadge, cancelled && styles.cancelledBadge]}>
          <MaterialIcons
            name={outcome.icon}
            size={14}
            color={cancelled ? colors.mutedText : colors.secondary}
          />
          <Text style={[styles.completedText, cancelled && styles.cancelledBadgeText]}>{outcome.label}</Text>
        </View>
      </View>
      <View style={styles.pastIdentity}>
        <View style={styles.pastIdentityCopy}>
          <Text style={styles.pastEyebrow}>PATIENT</Text>
          <Text style={styles.pastPatient}>{request.patient_name}</Text>
          <Text style={styles.pastCoordinator}>
            Requested by {match.poster_name ?? "Coordinator"}
          </Text>
        </View>
        <View style={styles.pastBloodTile}>
          <Text style={styles.pastBlood}>{request.blood_type_needed}</Text>
          <Text style={styles.pastBloodLabel}>{request.urgency_level.toUpperCase()}</Text>
        </View>
      </View>

      <View style={styles.pastDetailsGrid}>
        <View style={styles.pastDetailItem}>
          <MaterialIcons name="local-hospital" size={15} color={colors.crimson} />
          <View style={styles.pastDetailCopy}>
            <Text style={styles.pastDetailLabel}>Hospital</Text>
            <Text numberOfLines={2} style={styles.pastDetailValue}>{hospitalOf(match)}</Text>
          </View>
        </View>
        <View style={styles.pastDetailItem}>
          <MaterialIcons name="location-on" size={15} color={colors.mutedText} />
          <View style={styles.pastDetailCopy}>
            <Text style={styles.pastDetailLabel}>Location</Text>
            <Text numberOfLines={2} style={styles.pastDetailValue}>
              {areaOf(match)}{match.distance_km === null ? "" : ` · ${formatDistanceKm(match.distance_km)}`}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.pastStatsRow}>
        <View style={styles.pastStat}>
          <Text style={styles.pastDetailLabel}>You gave</Text>
          <Text style={styles.pastStatValue}>{unitsLabel(match.units_committed)}</Text>
        </View>
        <View style={styles.pastStat}>
          <Text style={styles.pastDetailLabel}>Request total</Text>
          <Text style={styles.pastStatValue}>{request.units_secured}/{request.units_needed} secured</Text>
        </View>
        <View style={styles.pastStat}>
          <Text style={styles.pastDetailLabel}>Required by</Text>
          <Text style={styles.pastStatValue}>{formatAbsoluteTime(request.required_by)}</Text>
        </View>
      </View>

      <View style={styles.requestOutcomeBox}>
        <MaterialIcons name={request.status === "expired" ? "schedule" : request.status === "cancelled" ? "cancel" : "info-outline"} size={16} color={request.status === "expired" ? colors.amberText : request.status === "cancelled" ? "#be123c" : colors.mutedText} />
        <Text style={styles.requestOutcomeText}>{REQUEST_STATUS_LABELS[request.status]}</Text>
      </View>

      {cancelled && match.cancel_reason ? (
        <Text style={styles.reason}>
          <Text style={styles.reasonLabel}>Cancellation reason: </Text>
          {match.cancel_reason}
        </Text>
      ) : null}
      <View style={styles.dateRow}>
        <MaterialIcons
          name={cancelled ? "event-busy" : "schedule"}
          size={15}
          color="#64748b"
        />
        {/* A cancelled match has no `cancelled_at` — RequestMatchOut carries
            only accepted_at and completed_at — so this dates the commitment
            rather than the cancellation. Saying "Cancelled on Accepted" would
            be a guess, and saying nothing would lose the only date there is. */}
        <Text style={styles.dateText}>
          {cancelled
            ? `Committed on ${formatDate(match.accepted_at)}`
            : `Completed on ${formatDate(match.completed_at ?? match.accepted_at)}`}
        </Text>
      </View>
      <View style={styles.pastActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Call ${match.poster_name ?? "coordinator"}`}
          onPress={() => Linking.openURL(`tel:${dialablePakistaniPhone(match.poster_phone)}`)}
          style={styles.pastCallButton}
        >
          <MaterialIcons name="call" size={15} color={colors.crimson} />
          <Text style={styles.pastCallText}>Call coordinator</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({
            pathname: "/chat",
            params: {
              matchId: match.id,
              currentUserRole: "donor",
              otherParticipantName: match.poster_name ?? "Coordinator",
              requestBloodType: request.blood_type_needed,
              urgency: request.urgency_level.toUpperCase(),
              hospitalName: hospitalOf(match),
            },
          })}
          style={styles.pastMessageButton}
        >
          <MaterialIcons name="chat-bubble-outline" size={15} color={colors.text} />
          <Text style={styles.pastMessageText}>Message</Text>
        </Pressable>
      </View>
    </View>
  );
}

function LiveCommitment({
  match,
  onRequestCancel,
  onConfirmComplete,
  isCompleting,
  error,
  onDismissError,
}: {
  match: RequestMatchDetail;
  onRequestCancel: () => void;
  onConfirmComplete: () => void;
  isCompleting: boolean;
  /** This card's last complete attempt failed. Null when it is fine. */
  error: string | null;
  onDismissError: () => void;
}) {
  const router = useRouter();
  const request = match.blood_request;
  const appearance = URGENCY_APPEARANCE[request.urgency_level];
  const hospital = hospitalOf(match);
  const posterPhone = formatPakistaniPhone(match.poster_phone);

  return (
    <View style={styles.card}>
      <View style={styles.badgeRow}>
        <View style={styles.badgeGroup}>
          <View style={styles.bloodBadge}>
            <MaterialIcons
              name="water-drop"
              size={14}
              color={colors.crimson}
            />
            <Text style={styles.bloodBadgeText}>{request.blood_type_needed} NEEDED</Text>
          </View>
          <View style={appearance.badge}>
            <Text style={appearance.text}>● {appearance.label}</Text>
          </View>
        </View>
        <View style={styles.activeBadge}>
          <View style={styles.activeDot} />
          <Text style={styles.activeText}>Accepted — En Route</Text>
        </View>
      </View>
      <Text style={styles.cardTitle}>Blood needed for {request.patient_name}</Text>
      <View style={styles.commitmentLine}>
        <Text style={styles.commitmentLabel}>You committed to donate:</Text>
        <Text style={styles.commitmentValue}>{unitsLabel(match.units_committed)}</Text>
      </View>
      <View style={styles.acceptedRow}>
        <MaterialIcons name="schedule" size={14} color="#64748b" />
        <Text style={styles.dateText}>Accepted {formatTimeAgo(match.accepted_at)}</Text>
      </View>
      <View style={styles.locationBox}>
        <View style={styles.locationRow}>
          <MaterialIcons
            name="location-on"
            size={19}
            color={colors.crimson}
          />
          <View style={styles.locationCopy}>
            <Text style={styles.locationTitle}>{hospital}</Text>
            <Text style={styles.locationSubtitle}>
              {areaOf(match)}
              {match.distance_km === null ? "" : ` · ${formatDistanceKm(match.distance_km)}`}
            </Text>
          </View>
        </View>
        {/* Absent only for a match whose eta was never set, which the accept
            endpoint does not allow but the column does. */}
        {match.eta ? (
          <View style={styles.arrivalStrip}>
            <Text style={styles.arrivalText}>⏱ {formatArrivalIn(match.eta)}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.actionRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Call ${posterPhone}`}
          onPress={() => Linking.openURL(`tel:${dialablePakistaniPhone(match.poster_phone)}`)}
          style={styles.callButton}
        >
          <MaterialIcons name="call" size={17} color={colors.surface} />
          <Text style={styles.callText}>Call Coordinator</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({
              pathname: "/chat",
              params: {
                matchId: match.id,
                currentUserRole: "donor",
                // The poster is the coordinator, and this is the name the
                // backend resolved for them — the mock hardcoded one donor's
                // counterparty here, so every card opened the same thread.
                otherParticipantName: match.poster_name ?? "Coordinator",
                requestBloodType: request.blood_type_needed,
                urgency: appearance.label,
                hospitalName: hospital,
              },
            })
          }
          style={styles.messageButton}
        >
          <MaterialIcons name="chat" size={17} color={colors.text} />
          <Text style={styles.messageText}>Message</Text>
        </Pressable>
      </View>

      {/* The affirmative action, and the only solid fill on the card. The
          destructive option is the underlined link below it, so the two are
          never one mistap apart. */}
      <Pressable
        accessibilityRole="button"
        disabled={isCompleting}
        onPress={onConfirmComplete}
        style={[styles.completeButton, isCompleting && styles.busy]}
      >
        {isCompleting ? (
          <ActivityIndicator size="small" color={colors.surface} />
        ) : (
          <>
            <MaterialIcons name="check-circle" size={18} color={colors.surface} />
            <Text style={styles.completeText}>Confirm Donation Completed</Text>
          </>
        )}
      </Pressable>

      {/* Completion has no sheet of its own, so a failure lands here, on the
          card it belongs to, where the button that caused it still is. */}
      {error ? (
        <View style={styles.actionError}>
          <MaterialIcons name="error-outline" size={15} color={colors.crimson} />
          <Text accessibilityRole="alert" style={styles.actionErrorText}>
            {error}
          </Text>
          <Pressable
            accessibilityLabel="Dismiss error"
            onPress={onDismissError}
            style={styles.actionErrorDismiss}
          >
            <MaterialIcons name="close" size={15} color={colors.crimson} />
          </Pressable>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={onRequestCancel}
        style={styles.cancelLink}
      >
        <Text style={styles.cancelLinkText}>Cancel Commitment</Text>
      </Pressable>
    </View>
  );
}

function LoadingState() {
  return (
    <View style={styles.loadingState}>
      <ActivityIndicator color={colors.crimson} />
      <Text style={styles.loadingText}>Loading your commitments…</Text>
    </View>
  );
}

function ErrorState({ error, onRetry }: { error: ApiFailure; onRetry: () => void }) {
  return (
    <View style={styles.errorState}>
      <View style={styles.errorIcon}>
        <MaterialIcons name="cloud-off" size={30} color={colors.crimson} />
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
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <MaterialIcons
          name="filter-list-off"
          size={24}
          color={colors.mutedText}
        />
      </View>
      <Text style={styles.emptyTitle}>No commitments found</Text>
      <Text style={styles.emptyText}>
        There are no records matching the selected status.
      </Text>
    </View>
  );
}

export default function DonorHistoryScreen() {
  const router = useRouter();
  const [selected, setSelected] = useState<HistoryCategory>("all");
  const [history, setHistory] = useState<HistoryState>({ status: "loading" });

  // Bumping this re-runs the focus effect below — which is all "Try Again" is.
  const [reloadToken, setReloadToken] = useState(0);

  const [pulse] = useState(() => new Animated.Value(0));

  // Which commitment the cancel sheet is open for, and how that attempt is
  // going. Held here rather than inside the card so the sheet is not torn down
  // and rebuilt by the list re-rendering underneath it.
  const [pendingCancel, setPendingCancel] = useState<RequestMatchDetail | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Completion uses a native confirm instead of a sheet, so its failure has
  // nowhere of its own to render — it is pinned to the card that raised it.
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [completeError, setCompleteError] = useState<{ matchId: string; message: string } | null>(
    null,
  );

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1100,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  // Refetch on focus, not just on mount: completing or cancelling a commitment
  // anywhere else — a coordinator doing it, or the donor on another device —
  // has to show up here, and a settled commitment is what moves a card from the
  // live section into the past one.
  //
  // reloadToken is never read in here — it is in the dependency list so that
  // "Try Again" can force a new callback identity, which is what makes the
  // focus effect run again while the screen is already focused.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function load() {
        // Deliberately not dropping back to "loading" when there is already a
        // list: a refetch fires every time this tab is focused, and a spinner
        // over records that are about to be identical reads as a flicker.
        setHistory((current) => (current.status === "ready" ? current : { status: "loading" }));

        try {
          const matches = await fetchMyMatches();
          if (!cancelled) setHistory({ status: "ready", matches });
        } catch (error) {
          if (!cancelled) {
            setHistory({
              status: "error",
              error: describeApiFailure(error, "Something went wrong loading your commitments."),
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

  const matches = history.status === "ready" ? history.matches : [];

  const live = matches.filter((match) => categoryForMatch(match) === "active");
  const past = matches.filter((match) => categoryForMatch(match) !== "active");

  // Counted off the real records rather than the hardcoded "(5)" the mock
  // carried, which stayed at 5 no matter what happened to the list.
  const counts: Record<HistoryCategory, number> = {
    all: matches.length,
    active: live.length,
    completed: matches.filter((match) => match.status === "completed").length,
    cancelled: matches.filter((match) => categoryForMatch(match) === "cancelled").length,
  };

  const showLive = selected === "all" || selected === "active";
  const showPast = selected !== "active";

  const visiblePast =
    selected === "all"
      ? past
      : // Empty rather than "everything" under the Active filter: those cards
        // are not rendered then, and counting them would hide the empty state
        // from a donor who has history but no live commitment.
        selected === "active"
        ? []
        : past.filter((match) => categoryForMatch(match) === selected);

  // What is actually about to be drawn, so the empty state keys off the
  // rendered result rather than the underlying lists. Filtering to
  // "Completed" while a live commitment exists leaves both lists non-empty and
  // the screen blank — the case this exists to catch.
  const showingLive = showLive && live.length > 0;
  const showingPast = showPast && visiblePast.length > 0;

  /**
   * Adopt a match the backend just returned, in place.
   *
   * Cancel and complete both answer with the full updated RequestMatchDetailOut,
   * so this is the authoritative row — refetching to learn the same thing would
   * blank the list behind the sheet and could race the response.
   */
  function applyMatch(updated: RequestMatchDetail) {
    setHistory((current) => {
      if (current.status !== "ready") return current;

      const known = current.matches.some((match) => match.id === updated.id);
      return {
        status: "ready",
        matches: known
          ? current.matches.map((match) => (match.id === updated.id ? updated : match))
          : [updated, ...current.matches],
      };
    });
  }

  function handleRequestCancel(match: RequestMatchDetail) {
    setCancelError(null);
    setPendingCancel(match);
  }

  function handleCloseCancel() {
    setCancelError(null);
    setPendingCancel(null);
  }

  async function handleCancelCommitment(reason: string) {
    if (!pendingCancel || isCancelling) return;

    setIsCancelling(true);
    setCancelError(null);

    try {
      const updated = await cancelMatch(pendingCancel.id, reason);
      applyMatch(updated);
      setPendingCancel(null);
    } catch (error) {
      const failure = describeMatchActionError(
        error,
        "Something went wrong cancelling this commitment.",
      );

      // The only 400 these two endpoints produce is _assert_open's "Match is
      // already …" — the row moved under us, most likely settled on another
      // device. There is nothing to retry and nothing to correct in the form,
      // so the sheet closes and the list re-reads instead of showing an error
      // about a commitment that is no longer live.
      if (failure.stale) {
        setPendingCancel(null);
        setReloadToken((token) => token + 1);
        return;
      }

      setCancelError(failure.message);
    } finally {
      setIsCancelling(false);
    }
  }

  async function handleComplete(match: RequestMatchDetail) {
    if (completingId) return;

    setCompletingId(match.id);
    setCompleteError(null);

    try {
      const updated = await completeMatch(match.id);
      applyMatch(updated);
    } catch (error) {
      const failure = describeMatchActionError(
        error,
        "Something went wrong completing this donation.",
      );

      // Same 400 as above: completing it twice is not a failure the donor can
      // act on, it just means this row is already settled.
      if (failure.stale) {
        setReloadToken((token) => token + 1);
        return;
      }

      setCompleteError({ matchId: match.id, message: failure.message });
    } finally {
      setCompletingId(null);
    }
  }

  /**
   * A native confirm, deliberately.
   *
   * Completing is irreversible from the app — there is no un-complete endpoint,
   * and it is what marks the parent request FULFILLED — but it is also a
   * one-tap follow-up to something the donor physically did, so a full sheet
   * would be more ceremony than the moment deserves.
   */
  function confirmComplete(match: RequestMatchDetail) {
    Alert.alert(
      "Confirm Donation Completed",
      `Mark your ${unitsLabel(match.units_committed)} donation for ${match.blood_request.patient_name} as completed? Only confirm once you have donated.`,
      [
        { text: "Not Yet", style: "cancel" },
        { text: "Confirm", onPress: () => void handleComplete(match) },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.screen}>
        <View style={styles.header}>
          <BrandLogo size={36} style={styles.brandLogo} />
          <View style={styles.brandCopy}>
            <Text style={styles.brandName}>BloodBridge</Text>
            <Text style={styles.portal}>Donor Portal</Text>
          </View>
        </View>
        <View style={styles.content}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.heading}>
              <Text style={styles.title}>Commitment History</Text>
              <Text style={styles.subtitle}>
                Track your active &amp; past emergency donations
              </Text>
            </View>

            {/* Hidden until the counts are real: a filter row reading
                "Completed (0)" while the fetch is still in flight is a lie the
                donor has no way to tell from an empty history. */}
            {history.status === "ready" ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterRow}
              >
                {(["all", "active", "completed", "cancelled"] as const).map((key) => (
                  <Pressable
                    key={key}
                    onPress={() => setSelected(key)}
                    style={[styles.filter, selected === key && styles.filterActive]}
                  >
                    <Text
                      style={[
                        styles.filterText,
                        selected === key && styles.filterTextActive,
                      ]}
                    >
                      {key === "all" ? "All" : CATEGORY_LABELS[key]} ({counts[key]})
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
              <>
                {showingLive ? (
                  <>
                    <View style={styles.liveHeader}>
                      <View style={styles.liveLabel}>
                        <View style={styles.liveDotWrap}>
                          <Animated.View
                            style={[
                              styles.liveDotPulse,
                              {
                                opacity: pulse.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: [0.75, 0],
                                }),
                                transform: [
                                  {
                                    scale: pulse.interpolate({
                                      inputRange: [0, 1],
                                      outputRange: [1, 2.4],
                                    }),
                                  },
                                ],
                              },
                            ]}
                          />
                          <View style={styles.liveDot} />
                        </View>
                        <Text style={styles.liveText}>
                          LIVE {live.length === 1 ? "COMMITMENT" : "COMMITMENTS"}
                        </Text>
                      </View>
                      <Text style={styles.liveCount}>
                        {live.length} active
                      </Text>
                    </View>
                    {live.map((match) => (
                      <LiveCommitment
                        key={match.id}
                        match={match}
                        onRequestCancel={() => handleRequestCancel(match)}
                        onConfirmComplete={() => confirmComplete(match)}
                        isCompleting={completingId === match.id}
                        error={
                          completeError && completeError.matchId === match.id
                            ? completeError.message
                            : null
                        }
                        onDismissError={() => setCompleteError(null)}
                      />
                    ))}
                  </>
                ) : null}

                {showingPast ? (
                  <View style={styles.pastHeader}>
                    <Text style={styles.pastTitle}>Past Commitments</Text>
                    <Text style={styles.pastCount}>
                      {visiblePast.length} record{visiblePast.length === 1 ? "" : "s"}
                    </Text>
                  </View>
                ) : null}
                {visiblePast.map((match) => (
                  <PastRecord key={match.id} match={match} />
                ))}

                {!showingLive && !showingPast ? <EmptyState /> : null}
              </>
            ) : null}
          </ScrollView>
        </View>
        <View style={styles.bottomTabs}>
          <Pressable
            onPress={() => router.replace("/home" as RelativePathString)}
            style={styles.tab}
          >
            <MaterialIcons name="water-drop" size={22} color="#6b7280" />
            <Text style={styles.tabText}>Requests</Text>
          </Pressable>
          <Pressable style={styles.tab}>
            <MaterialIcons name="history" size={22} color={colors.crimson} />
            <Text style={[styles.tabText, styles.tabActive]}>History</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/profile" as RelativePathString)}
            style={styles.tab}
          >
            <MaterialIcons name="person-outline" size={22} color="#6b7280" />
            <Text style={styles.tabText}>Profile</Text>
          </Pressable>
        </View>
      </View>

      {/* Rendered only for a live commitment, so the sheet can never outlive
          the card it describes. */}
      {pendingCancel ? (
        <CancelCommitmentModal
          context={cancelContextFor(pendingCancel)}
          error={cancelError}
          isSubmitting={isCancelling}
          onCancelCommitment={(reason) => void handleCancelCommitment(reason)}
          onClose={handleCloseCancel}
          visible
        />
      ) : null}
    </SafeAreaView>
  );
}
