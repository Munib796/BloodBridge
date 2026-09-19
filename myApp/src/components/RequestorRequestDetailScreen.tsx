import { MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, type RelativePathString } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState, type ComponentProps } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { BloodRequest, MatchStatus, RequestMatchDetail, UrgencyLevel } from "../lib/apiTypes";
import {
  cancelBloodRequest,
  describeRequestError,
  fetchRequest,
  fetchRequestCommitments,
  widenRequestRadius,
  type RequestDetailError,
} from "../lib/bloodRequests";
import { describeApiFailure, describeWriteError } from "../lib/errors";
import { initialsFrom } from "../lib/profile";
import { formatAbsoluteTime, formatArrivalIn, formatTimeAgo } from "../lib/format";
import { dialablePakistaniPhone, formatPakistaniPhone } from "../lib/phone";
import {
  OUTCOME_BY_STATUS,
  REQUEST_STATUS_LABELS,
  STATUS_NOTES,
  bloodBoxLabel,
  canBeCancelled,
  isBroadcasting,
  type RequestOutcome,
} from "../lib/requestStatus";
import { colors } from "../theme/colors";
import { requestorRequestDetailStyles as styles } from "../styles/requestorRequestDetailStyles";

/** The backend clamps a widened radius into this range — src/utils/constants.py. */
const MAX_RADIUS_KM = 100;

type DetailState =
  | { status: "loading" }
  | { status: "ready"; request: BloodRequest }
  | { status: "error"; error: RequestDetailError };

/**
 * Commitments load separately from the request.
 *
 * A failure here must not take the screen down with it: the poster can still
 * read the request, widen it and cancel it without the donor list, so this
 * renders as an inline retry inside its section rather than replacing the page.
 */
type CommitmentsState =
  | { status: "loading" }
  | { status: "ready"; matches: RequestMatchDetail[] }
  | { status: "error"; message: string };

/** The screen is per-request, so a stale response must not land on a new one. */
function singleParam(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? null;
  return null;
}

function hospitalOf(request: BloodRequest): string {
  return request.hospital_name_text ?? request.area_label ?? "Location not specified";
}

const URGENCY_APPEARANCE: Record<
  UrgencyLevel,
  { label: string; badge: TextStyle; accent: ViewStyle }
> = {
  critical: { label: "CRITICAL", badge: styles.criticalBadge, accent: styles.topAccent },
  urgent: { label: "URGENT", badge: styles.urgentBadge, accent: styles.topAccentUrgent },
  routine: { label: "ROUTINE", badge: styles.routineBadge, accent: styles.topAccentNeutral },
};

/**
 * The header pill follows the shared outcome buckets rather than growing a
 * tenth per-status table of its own: amber (the base style) while something
 * can still happen, green once fulfilled, rose once it ended another way.
 */
const STATUS_PILL: Record<RequestOutcome, TextStyle | null> = {
  active: null,
  completed: styles.statusPillDone,
  cancelled: styles.statusPillEnded,
};

/**
 * A commitment's own status, which is not the request's. A poster looking at a
 * fulfilled request still needs to see which donors actually turned up — and
 * MatchStatus and RequestStatus are different enums that share only two words,
 * so this cannot borrow the request label table.
 */
const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  accepted: "Accepted",
  completed: "Completed",
  cancelled: "Cancelled",
};

const MATCH_STATUS_BADGE: Record<MatchStatus, TextStyle> = {
  accepted: styles.accepted,
  completed: styles.accepted,
  cancelled: styles.matchCancelled,
};

const STATUS_NOTICE_APPEARANCE: Record<
  BloodRequest["status"],
  { icon: ComponentProps<typeof MaterialIcons>["name"]; iconColor: string; container: ViewStyle; iconWrap: ViewStyle }
> = {
  draft: { icon: "edit-note", iconColor: colors.mutedText, container: styles.statusNoticeNeutral, iconWrap: styles.statusNoticeIconNeutral },
  pending_verification: { icon: "info-outline", iconColor: "#1d4ed8", container: styles.statusNoticeBlue, iconWrap: styles.statusNoticeIconBlue },
  active: { icon: "broadcast-on-personal", iconColor: colors.emeraldText, container: styles.statusNoticeGreen, iconWrap: styles.statusNoticeIconGreen },
  partially_matched: { icon: "broadcast-on-personal", iconColor: colors.amberText, container: styles.statusNoticeAmber, iconWrap: styles.statusNoticeIconAmber },
  fully_matched: { icon: "info-outline", iconColor: "#1d4ed8", container: styles.statusNoticeBlue, iconWrap: styles.statusNoticeIconBlue },
  fulfilled: { icon: "check-circle-outline", iconColor: colors.emeraldText, container: styles.statusNoticeGreen, iconWrap: styles.statusNoticeIconGreen },
  closed: { icon: "info-outline", iconColor: colors.mutedText, container: styles.statusNoticeNeutral, iconWrap: styles.statusNoticeIconNeutral },
  rejected: { icon: "cancel", iconColor: "#be123c", container: styles.statusNoticeRose, iconWrap: styles.statusNoticeIconRose },
  expired: { icon: "schedule", iconColor: colors.amberText, container: styles.statusNoticeAmber, iconWrap: styles.statusNoticeIconAmber },
  cancelled: { icon: "cancel", iconColor: "#be123c", container: styles.statusNoticeRose, iconWrap: styles.statusNoticeIconRose },
};

function matchNote(match: RequestMatchDetail): string {
  if (match.status === "cancelled") return match.cancel_reason ?? "Commitment cancelled";
  if (match.status === "completed") return "Donation completed";
  return "Donor confirmed";
}

/**
 * What to say about the unit count.
 *
 * "N more units needed" is only true while the request is open. On a settled
 * one it reads as an outstanding ask that nobody is working on, so the past
 * tense version says what the final gap actually was.
 */
function unitsFootnote(request: BloodRequest): string {
  const stillNeeded = Math.max(0, request.units_needed - request.units_secured);
  if (stillNeeded === 0) return "All units secured";

  const broadcasting = isBroadcasting(request.status);
  const unitWord = stillNeeded === 1 ? "unit" : "units";

  return broadcasting
    ? `${stillNeeded} more ${unitWord} needed`
    : `${stillNeeded} ${unitWord} still needed when this request ended`;
}

function CommitmentCard({
  match,
  request,
}: {
  match: RequestMatchDetail;
  request: BloodRequest;
}) {
  const router = useRouter();
  const name = match.acceptor_name ?? "Donor";
  const acceptorPhone = match.acceptor_phone ? formatPakistaniPhone(match.acceptor_phone) : null;

  return (
    <View style={styles.donorCard}>
      <View style={[styles.donorTop, styles.donorTopStack]}>
        <View style={[styles.donorIdentity, styles.donorIdentityFull]}>
          <View style={styles.initials}>
            <Text style={styles.initialsText}>{initialsFrom(match.acceptor_name)}</Text>
          </View>
          <View>
            <Text style={styles.donorName}>
              {name}{" "}
              <Text style={styles.unitText}>
                · {match.units_committed} Unit{match.units_committed === 1 ? "" : "s"}
              </Text>
            </Text>
            <View style={styles.acceptedRow}>
              <Text style={MATCH_STATUS_BADGE[match.status]}>
                {MATCH_STATUS_LABELS[match.status]}
              </Text>
              <Text style={styles.confirmed}>{matchNote(match)}</Text>
            </View>
          </View>
        </View>
        <View style={[styles.contactRow, styles.contactRowAligned]}>
          {/* Omitted rather than dialling nothing: acceptor_phone is nullable on
              the wire, and an organization without one would otherwise open a
              tel: link to the empty string. */}
          {acceptorPhone ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Call ${name} on ${acceptorPhone}`}
              onPress={() => Linking.openURL(`tel:${dialablePakistaniPhone(match.acceptor_phone as string)}`)}
              style={styles.contactButton}
            >
              <MaterialIcons name="call" size={14} color={colors.mutedText} />
              <Text style={styles.contactText}>Call</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: "/chat",
                params: {
                  matchId: match.id,
                  currentUserRole: "requestor",
                  otherParticipantName: name,
                  requestBloodType: request.blood_type_needed,
                  urgency: request.urgency_level.toUpperCase(),
                  hospitalName: hospitalOf(request),
                },
              })
            }
            style={styles.contactButton}
          >
            <MaterialIcons name="chat-bubble-outline" size={14} color={colors.mutedText} />
            <Text style={styles.contactText}>Message</Text>
          </Pressable>
        </View>
      </View>
      {/* Only while the commitment is live — "arriving in 25 mins" is a
          nonsense thing to say about a donation that was completed last week. */}
      {match.status === "accepted" && match.eta ? (
        <View style={styles.eta}>
          <MaterialIcons name="schedule" size={14} color={colors.mutedText} />
          <Text style={styles.etaText}>{formatArrivalIn(match.eta)}</Text>
        </View>
      ) : null}
    </View>
  );
}

function LoadingState() {
  return (
    <View style={styles.loadingState}>
      <ActivityIndicator color={colors.crimson} />
      <Text style={styles.loadingText}>Loading request details…</Text>
    </View>
  );
}

/**
 * Explains a status that isn't offering the Widen control.
 *
 * Used in two situations that look alike on screen but aren't the same:
 *
 *   - the request can still be cancelled (pending_verification, fully_matched,
 *     expired) — it takes `hint`, so the note doesn't read as though everything
 *     is locked while a working Cancel button sits right below it;
 *   - nothing can be done at all (the terminal statuses) — no hint, because
 *     there is nothing to explain the absence of.
 */
function StatusNotice({ request, hint }: { request: BloodRequest; hint?: string }) {
  const appearance = STATUS_NOTICE_APPEARANCE[request.status];

  return (
    <View style={[styles.statusNotice, appearance.container]}>
      <View style={[styles.statusNoticeIconWrap, appearance.iconWrap]}>
        <MaterialIcons name={appearance.icon} size={17} color={appearance.iconColor} />
      </View>
      <View style={styles.statusNoticeCopy}>
        <Text style={styles.statusNoticeText}>{STATUS_NOTES[request.status]}</Text>
        {hint ? <Text style={styles.statusNoticeHint}>{hint}</Text> : null}
        {request.cancellation_reason ? (
          <Text style={styles.statusNoticeReason}>
            &ldquo;{request.cancellation_reason}&rdquo;
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function ErrorState({
  error,
  onRetry,
  onBack,
}: {
  error: RequestDetailError;
  onRetry: () => void;
  onBack: () => void;
}) {
  // 404 is a settled answer, not a fault: the backend answers it for a request
  // that never existed, one that is not this poster's, or an ID that was never
  // real — so the screen says so instead of offering a retry that cannot work.
  const gone = error.kind === "unavailable";

  return (
    <View style={styles.errorState}>
      <View style={styles.errorIcon}>
        <MaterialIcons name={gone ? "search-off" : "cloud-off"} size={30} color={colors.crimson} />
      </View>
      <Text style={styles.errorTitle}>
        {gone ? "Request Not Available" : "Couldn't Load This Request"}
      </Text>
      <Text style={styles.errorText}>{error.message}</Text>
      <View style={styles.errorActions}>
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryText}>Back to Requests</Text>
        </Pressable>
        {gone ? null : (
          <Pressable
            accessibilityRole="button"
            onPress={onRetry}
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
          >
            <MaterialIcons name="refresh" size={16} color={colors.surface} />
            <Text style={styles.retryText}>Try Again</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export default function RequestorRequestDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const requestId = singleParam(params.id);

  const [detail, setDetail] = useState<DetailState>({ status: "loading" });
  const [commitments, setCommitments] = useState<CommitmentsState>({ status: "loading" });

  // One token per fetch, so retrying the donor list doesn't reload the request.
  const [detailToken, setDetailToken] = useState(0);
  const [commitmentsToken, setCommitmentsToken] = useState(0);

  const [pulse] = useState(() => new Animated.Value(0));
  const [searchMotion] = useState(() => new Animated.Value(0));

  const [isWidening, setIsWidening] = useState(false);
  const [widenError, setWidenError] = useState<string | null>(null);
  const [widenNote, setWidenNote] = useState<string | null>(null);

  const [cancelVisible, setCancelVisible] = useState(false);
  const [reason, setReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  useEffect(() => {
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1000, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    const searchAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(searchMotion, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(searchMotion, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    pulseAnimation.start();
    searchAnimation.start();
    return () => {
      pulseAnimation.stop();
      searchAnimation.stop();
    };
  }, [pulse, searchMotion]);

  useEffect(() => {
    if (!requestId) {
      setDetail({
        status: "error",
        error: { kind: "unavailable", message: "This request could not be identified." },
      });
      return;
    }

    // Passed in rather than closed over, so `load` takes a plain string and
    // does not depend on the narrowing above surviving into a nested function.
    const activeId = requestId;
    let cancelled = false;

    async function load(id: string) {
      setDetail({ status: "loading" });
      try {
        const request = await fetchRequest(id);
        if (!cancelled) setDetail({ status: "ready", request });
      } catch (error) {
        if (!cancelled) setDetail({ status: "error", error: describeRequestError(error) });
      }
    }

    void load(activeId);

    return () => {
      cancelled = true;
    };
  }, [requestId, detailToken]);

  useEffect(() => {
    if (!requestId) {
      setCommitments({ status: "ready", matches: [] });
      return;
    }

    const activeId = requestId;
    let cancelled = false;

    async function load(id: string) {
      setCommitments({ status: "loading" });
      try {
        const matches = await fetchRequestCommitments(id);
        if (!cancelled) setCommitments({ status: "ready", matches });
      } catch (error) {
        if (!cancelled) {
          setCommitments({
            status: "error",
            message: describeApiFailure(error, "Couldn't load the donor commitments.").message,
          });
        }
      }
    }

    void load(activeId);

    return () => {
      cancelled = true;
    };
  }, [requestId, commitmentsToken]);

  const request = detail.status === "ready" ? detail.request : null;
  const matches = commitments.status === "ready" ? commitments.matches : [];

  // The pill counts commitments still standing, not every row that came back —
  // a cancelled one is a record of a donor who dropped out, not a donor.
  const openCommitments = matches.filter((match) => match.status === "accepted");
  const stillNeeded = request ? Math.max(0, request.units_needed - request.units_secured) : 0;

  /**
   * Widen the broadcast radius.
   *
   * The response is the whole updated request, so it replaces what is on screen
   * rather than being merged field-by-field — the backend also reassigns status
   * when the unit count changes, and adopting the row keeps them in step.
   */
  async function handleWiden() {
    if (isWidening || !request) return;

    setIsWidening(true);
    setWidenError(null);
    setWidenNote(null);

    try {
      const updated = await widenRequestRadius(request.id);
      setDetail({ status: "ready", request: updated });

      // A 200 that changed nothing means the radius is already clamped at the
      // ceiling. Saying "radius widened" there would be a lie the poster only
      // discovers by looking at the number.
      if (updated.current_radius_km === request.current_radius_km) {
        setWidenNote(`This broadcast is already at the ${MAX_RADIUS_KM} km maximum radius.`);
      }
    } catch (error) {
      setWidenError(describeWriteError(error, "Couldn't widen the radius."));
    } finally {
      setIsWidening(false);
    }
  }

  /**
   * Cancel the request, and with it every open commitment on it.
   *
   * The sheet stays open on failure — with the reason still typed in — because
   * the backend's answer ("Request is already cancelled and cannot be
   * cancelled") is the thing the poster needs to read, and closing would hide
   * it behind a screen that still shows the request as live.
   */
  async function handleCancel() {
    if (isCancelling || !request) return;

    setIsCancelling(true);
    setCancelError(null);

    try {
      const updated = await cancelBloodRequest(request.id, reason);
      setDetail({ status: "ready", request: updated });
      setCancelVisible(false);
      setReason("");
      // The backend cancels open matches in the same transaction, so the list
      // on screen is now wrong — re-read it rather than guessing at the shape.
      setCommitmentsToken((token) => token + 1);
    } catch (error) {
      setCancelError(describeWriteError(error, "Couldn't cancel this request."));
    } finally {
      setIsCancelling(false);
    }
  }

  const appearance = request ? URGENCY_APPEARANCE[request.urgency_level] : null;
  const percent = request && request.units_needed > 0
    ? Math.max(0, Math.min(100, Math.round((request.units_secured / request.units_needed) * 100)))
    : 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.headerLead}>
            <Pressable accessibilityLabel="Go back" onPress={() => router.back()} style={styles.backButton}>
              <MaterialIcons name="chevron-left" size={24} color={colors.text} />
            </Pressable>
            <View>
              <View style={styles.liveRow}>
                <View style={styles.livePulse}>
                  <Animated.View
                    style={[
                      styles.livePulseRing,
                      {
                        opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
                        transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }],
                      },
                    ]}
                  />
                  <View style={styles.liveDot} />
                </View>
                <Text style={styles.liveText}>LIVE BROADCAST</Text>
              </View>
              <Text style={styles.title}>Request Details</Text>
            </View>
          </View>
          {request ? (
            <Text style={[styles.statusPill, STATUS_PILL[OUTCOME_BY_STATUS[request.status]]]}>
              {REQUEST_STATUS_LABELS[request.status]}
            </Text>
          ) : null}
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {detail.status === "loading" ? <LoadingState /> : null}

          {detail.status === "error" ? (
            <ErrorState
              error={detail.error}
              onRetry={() => setDetailToken((token) => token + 1)}
              onBack={() => router.back()}
            />
          ) : null}

          {request && appearance ? (
            <>
              <View style={styles.overviewCard}>
                <View style={[styles.topAccent, appearance.accent]} />
                <View style={styles.overviewTop}>
                  <View style={styles.overviewCopy}>
                    <View style={styles.badgeRow}>
                      <Text style={appearance.badge}>● {appearance.label}</Text>
                      <Text style={request.is_hospital_backed ? styles.verifiedBadge : styles.unverifiedBadge}>
                        {request.is_hospital_backed ? "✓ Verified Hospital" : "Unverified"}
                      </Text>
                    </View>
                    <Text style={styles.patientLabel}>PATIENT</Text>
                    <Text style={styles.patientName}>{request.patient_name}</Text>
                    <View style={styles.hospitalRow}>
                      <MaterialIcons name="domain" size={14} color="#94a3b8" />
                      <Text style={styles.hospital}>{hospitalOf(request)}</Text>
                    </View>
                  </View>
                  <View style={styles.bloodTile}>
                    <Text style={styles.bloodType}>{request.blood_type_needed}</Text>
                    <Text style={styles.bloodLabel}>{bloodBoxLabel(request.status)}</Text>
                  </View>
                </View>

                <View style={styles.progressBox}>
                  <View style={styles.progressHeader}>
                    <Text style={styles.progressLabel}>Units Secured</Text>
                    <Text style={styles.progressValue}>
                      <Text style={styles.progressAccent}>{request.units_secured}</Text> of {request.units_needed} units secured
                    </Text>
                  </View>
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: `${percent}%` }]} />
                  </View>
                  <View style={styles.progressFooter}>
                    <View style={styles.moreNeededWrap}>
                      <MaterialIcons name="error-outline" size={13} color={colors.amberText} style={styles.moreNeededIcon} />
                      <Text style={styles.moreNeeded}>{unitsFootnote(request)}</Text>
                    </View>
                    <Text style={styles.percent}>{percent}% completed</Text>
                  </View>
                </View>

                <View style={styles.specGrid}>
                  <View style={styles.spec}>
                    <MaterialIcons name="location-on" size={16} color={colors.crimson} />
                    <View style={styles.specCopy}>
                      <Text style={styles.specLabel}>BROADCAST RADIUS</Text>
                      <Text style={styles.specValue}>Within {request.current_radius_km} km</Text>
                    </View>
                  </View>
                  <View style={styles.spec}>
                    <MaterialIcons name="schedule" size={16} color={colors.crimson} />
                    <View style={styles.specCopy}>
                      <Text style={styles.specLabel}>REQUIRED BY</Text>
                      <Text style={styles.specValue}>{formatAbsoluteTime(request.required_by)}</Text>
                    </View>
                  </View>
                </View>
              </View>

              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <Text style={styles.sectionTitle}>Donor Commitments</Text>
                  {openCommitments.length > 0 ? (
                    <View style={styles.activePill}>
                      <Text style={styles.activePillText}>
                        {openCommitments.length} Active
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.sectionMeta}>
                  {matches.length > openCommitments.length
                    ? `${matches.length - openCommitments.length} settled`
                    : "Tap to call or message"}
                </Text>
              </View>

              {commitments.status === "loading" ? (
                <View style={styles.emptyCommitments}>
                  <ActivityIndicator color={colors.crimson} />
                  <Text style={styles.emptyCommitmentsText}>Loading commitments…</Text>
                </View>
              ) : null}

              {commitments.status === "error" ? (
                <View style={styles.emptyCommitments}>
                  <MaterialIcons name="cloud-off" size={22} color={colors.crimson} />
                  <Text accessibilityRole="alert" style={styles.emptyCommitmentsText}>
                    {commitments.message}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setCommitmentsToken((token) => token + 1)}
                    style={styles.sectionRetry}
                  >
                    <MaterialIcons name="refresh" size={13} color={colors.crimson} />
                    <Text style={styles.sectionRetryText}>Try Again</Text>
                  </Pressable>
                </View>
              ) : null}

              {commitments.status === "ready" && matches.length === 0 ? (
                <View style={styles.emptyCommitments}>
                  <MaterialIcons name="person-search" size={22} color={colors.mutedText} />
                  <Text style={styles.emptyCommitmentsText}>
                    No donor has committed to this request yet.
                  </Text>
                </View>
              ) : null}

              {matches.map((match) => (
                <CommitmentCard key={match.id} match={match} request={request} />
              ))}

              {/* Only while donors are actually being alerted. A pending
                  hospital verification has reached nobody, and a settled
                  request is not searching for anything. */}
              {isBroadcasting(request.status) && stillNeeded > 0 ? (
                <View style={styles.searching}>
                  <Animated.View
                    style={{
                      transform: [
                        { translateX: searchMotion.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 4, 0] }) },
                        { rotate: searchMotion.interpolate({ inputRange: [0, 0.5, 1], outputRange: ["0deg", "180deg", "360deg"] }) },
                      ],
                    }}
                  >
                    <MaterialIcons name="sync" size={18} color={colors.crimson} />
                  </Animated.View>
                  <View style={styles.searchCopy}>
                    <Text style={styles.searchTitle}>
                      Searching for {stillNeeded} additional compatible donor{stillNeeded === 1 ? "" : "s"}
                    </Text>
                    <Text style={styles.searchText}>
                      Broadcasting in {request.current_radius_km} km perimeter · Alerting verified {request.blood_type_needed} donors
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* Two independent gates, because the backend has two different
                  rules. Widening needs OPEN_STATUSES; cancelling only refuses
                  the terminal statuses. Sharing one condition — as this did
                  until it was tested — hid a working Cancel on expired and
                  fully-matched requests, where pulling the request is the one
                  thing a poster may still need to do. */}
              {isBroadcasting(request.status) ? (
                <View style={styles.adjustments}>
                  <View style={styles.adjustHeader}>
                    <Text style={styles.adjustTitle}>BROADCAST ADJUSTMENTS</Text>
                    <Text style={styles.adjustMeta}>Posted {formatTimeAgo(request.created_at)}</Text>
                  </View>
                  <Text style={styles.adjustDescription}>
                    Need to reach more potential donors immediately?
                  </Text>
                  <View style={styles.adjustGrid}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={isWidening}
                      onPress={handleWiden}
                      style={[styles.adjustButton, isWidening && styles.adjustBusy]}
                    >
                      {isWidening ? (
                        <ActivityIndicator size="small" color={colors.mutedText} />
                      ) : (
                        <MaterialIcons name="fullscreen" size={18} color={colors.mutedText} />
                      )}
                      <Text style={styles.adjustButtonTitle}>
                        {isWidening ? "Widening…" : "Widen Radius"}
                      </Text>
                      <Text style={styles.adjustButtonText}>
                        Increase your search radius by 10 km to reach more donors
                      </Text>
                    </Pressable>
                  </View>

                  {widenNote ? (
                    <View style={styles.inlineNote}>
                      <MaterialIcons name="info-outline" size={15} color={colors.amberText} />
                      <Text style={styles.inlineNoteText}>{widenNote}</Text>
                    </View>
                  ) : null}
                </View>
              ) : canBeCancelled(request.status) ? (
                <StatusNotice
                  hint="The search radius can only be widened while a request is broadcasting."
                  request={request}
                />
              ) : (
                <StatusNotice request={request} />
              )}

              {canBeCancelled(request.status) ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setCancelError(null);
                    setCancelVisible(true);
                  }}
                  style={styles.cancelButton}
                >
                  <MaterialIcons name="close" size={15} color={colors.mutedText} />
                  <Text style={styles.cancelText}>Cancel this request</Text>
                </Pressable>
              ) : null}

              {/* Outside the block above on purpose. This is the safety net for
                  the status changing between load and tap: the request was
                  broadcasting when the button was drawn and isn't any more, so
                  the action that failed is no longer rendered and the backend's
                  explanation has nowhere else to appear. */}
              {widenError ? (
                <View style={styles.inlineError}>
                  <MaterialIcons name="error-outline" size={15} color={colors.crimson} />
                  <Text accessibilityRole="alert" style={styles.inlineErrorText}>
                    {widenError}
                  </Text>
                </View>
              ) : null}
            </>
          ) : null}
        </ScrollView>

        <View style={styles.bottomNav}>
          <Pressable style={styles.tab} onPress={() => router.replace("/requestor-home" as RelativePathString)}>
            <MaterialIcons name="water-drop" size={23} color={colors.crimson} />
            <Text style={styles.tabActive}>Requests</Text>
          </Pressable>
          <Pressable style={styles.tab} onPress={() => router.push("/requestor-history" as RelativePathString)}>
            <MaterialIcons name="history" size={23} color="#94a3b8" />
            <Text style={styles.tabText}>History</Text>
          </Pressable>
          <Pressable style={styles.tab} onPress={() => router.push("/requestor/profile" as RelativePathString)}>
            <MaterialIcons name="person-outline" size={23} color="#94a3b8" />
            <Text style={styles.tabText}>Profile</Text>
          </Pressable>
        </View>

        <Modal
          visible={cancelVisible}
          transparent
          animationType="slide"
          onRequestClose={() => {
            if (!isCancelling) setCancelVisible(false);
          }}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modal}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Cancel Broadcast</Text>
                <Pressable
                  accessibilityLabel="Close cancel dialog"
                  disabled={isCancelling}
                  onPress={() => setCancelVisible(false)}
                >
                  <MaterialIcons name="close" size={19} color="#94a3b8" />
                </Pressable>
              </View>

              {/* Says what actually happens. Cancelling does cancel the open
                  commitments — cancel_open_matches flips them to CANCELLED in
                  the same transaction — but nothing is pushed to those donors:
                  they find out from their own history screen. */}
              <Text style={styles.modalBody}>
                {openCommitments.length > 0
                  ? `This ends the broadcast and cancels the ${openCommitments.length} open commitment${openCommitments.length === 1 ? "" : "s"} on it, releasing those units. The ${openCommitments.length === 1 ? "donor" : "donors"} will see the change on their history screen.`
                  : "This ends the broadcast and releases the units it was holding. No donor is currently committed to it."}
                {/* A request still awaiting hospital verification was never
                    sent to anybody, so promising that alerted donors "will not
                    be told" would describe a notification that never happened. */}
                {request
                  ? request.status === "pending_verification"
                    ? " It hasn't gone out to donors, so nobody is waiting on it."
                    : ` Donors already alerted in ${request.current_radius_km} km will not be told.`
                  : ""}
              </Text>

              <Text style={styles.inputLabel}>
                Reason for cancellation <Text style={styles.optional}>(optional)</Text>
              </Text>
              <TextInput
                accessibilityLabel="Cancellation reason"
                editable={!isCancelling}
                maxLength={500}
                multiline
                onChangeText={setReason}
                placeholder="e.g., Hospital blood bank fulfilled, patient stabilized"
                placeholderTextColor="#94a3b8"
                style={styles.input}
                value={reason}
              />

              {cancelError ? (
                <View style={styles.modalError}>
                  <MaterialIcons name="error-outline" size={15} color={colors.crimson} />
                  <Text accessibilityRole="alert" style={styles.modalErrorText}>
                    {cancelError}
                  </Text>
                </View>
              ) : null}

              <View style={styles.modalActions}>
                <Pressable
                  accessibilityRole="button"
                  disabled={isCancelling}
                  onPress={() => setCancelVisible(false)}
                  style={styles.keepButton}
                >
                  <Text style={styles.keepText}>Keep Request Active</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={isCancelling}
                  onPress={() => void handleCancel()}
                  style={[styles.confirmButton, isCancelling && styles.modalConfirmBusy]}
                >
                  {isCancelling ? (
                    <ActivityIndicator size="small" color={colors.surface} />
                  ) : (
                    <Text style={styles.confirmText}>Confirm Cancel</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}
