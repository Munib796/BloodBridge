import { MaterialIcons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useLocalSearchParams, useRouter, type RelativePathString } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Animated, Pressable, ScrollView, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import BrandLogo from "./BrandLogo";
import RequestConfirmationModal from "./RequestConfirmationModal";
import { useAuth } from "../context/AuthContext";
import type { BloodRequest, RequestMatchDetail, UrgencyLevel } from "../lib/apiTypes";
import { describeRequestError, fetchRequest, type RequestDetailError } from "../lib/bloodRequests";
import { availabilityErrorMessage, setDonorAvailability } from "../lib/donors";
import { formatAbsoluteTime, formatDeadlineCountdown, formatDistanceKm, formatPostedAgo } from "../lib/format";
import { acceptRequest, describeAcceptError, fetchMyMatches, type AcceptError, type Commitment } from "../lib/requestMatches";
import { isBroadcasting, REQUEST_STATUS_LABELS as STATUS_LABELS } from "../lib/requestStatus";
import { colors } from "../theme/colors";
import { requestDetailStyles as styles } from "../styles/requestDetailStyles";

/** How many units of the request's target are still unclaimed. */
function remainingUnits(request: BloodRequest): number {
  return Math.max(0, request.units_needed - request.units_secured);
}

/**
 * Per-urgency wording and styling.
 *
 * The screen was written for a mock where everything was critical: the banner
 * was hardcoded pink, the dot always pulsed, and the tag always read "Dispatch
 * Active". Urgency is a real three-value field, so the pulse is reserved for
 * critical and the other two levels get their own colours.
 */
const URGENCY_APPEARANCE: Record<
  UrgencyLevel,
  {
    /** Shouted, for the banner. */
    banner: string;
    /** Sentence case, for "this O- Critical request". */
    name: string;
    accent: string;
    container: ViewStyle | null;
    dot: ViewStyle | null;
    text: TextStyle | null;
    tag: TextStyle | null;
    countdown: TextStyle | null;
    pulses: boolean;
  }
> = {
  critical: {
    banner: "CRITICAL URGENCY",
    name: "Critical",
    accent: colors.crimson,
    container: null,
    dot: null,
    text: null,
    tag: null,
    countdown: null,
    pulses: true,
  },
  urgent: {
    banner: "URGENT",
    name: "Urgent",
    accent: colors.amber,
    container: styles.urgencyUrgent,
    dot: styles.urgencyDotUrgent,
    text: styles.urgencyTextUrgent,
    tag: styles.dispatchTagUrgent,
    countdown: styles.countdownTextUrgent,
    pulses: false,
  },
  routine: {
    banner: "ROUTINE",
    name: "Routine",
    accent: colors.subtleText,
    container: styles.urgencyRoutine,
    dot: styles.urgencyDotRoutine,
    text: styles.urgencyTextRoutine,
    tag: styles.dispatchTagRoutine,
    countdown: styles.countdownTextRoutine,
    pulses: false,
  },
};

/**
 * Fetched state. There is deliberately no third branch holding mock data: the
 * screen used to render a hardcoded request with an invented patient, an
 * invented 1.8 km distance and an invented deadline, which is exactly the sort
 * of thing a donor would act on.
 */
type DetailState =
  | { status: "loading" }
  | { status: "ready"; request: BloodRequest }
  | { status: "error"; error: RequestDetailError };

/**
 * Route params arrive as `string | string[]` — a repeated query key is an
 * array — so this picks out the single value, or nothing.
 */
function singleParam(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? null;
  return null;
}

function LoadingState() {
  return (
    <View style={styles.loadingState}>
      <ActivityIndicator color={colors.crimson} />
      <Text style={styles.loadingText}>Loading request details…</Text>
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
  // A 404 is a settled answer rather than a glitch: the request was filled,
  // cancelled, or has moved out of range since the feed was fetched. "Try
  // Again" there would be a button that cannot work, so the only way out is
  // back to the list, which refetches on focus.
  const gone = error.kind === "unavailable";

  return (
    <View style={styles.errorState}>
      <View style={styles.errorIcon}>
        <MaterialIcons name={gone ? "event-busy" : "cloud-off"} size={30} color={colors.crimson} />
      </View>
      <Text style={styles.errorTitle}>{gone ? "No Longer Available" : "Couldn't Load This Request"}</Text>
      <Text style={styles.errorText}>{error.message}</Text>
      <View style={styles.errorActions}>
        <Pressable
          accessibilityRole="button"
          onPress={gone ? onBack : onRetry}
          style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
        >
          <MaterialIcons name={gone ? "arrow-back" : "refresh"} size={16} color={colors.surface} />
          <Text style={styles.retryText}>{gone ? "Back to Requests" : "Try Again"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function RequestDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { state, applyProfile } = useAuth();

  const requestId = singleParam(params.id);

  // The distance is measured by the listing endpoint, which is the only place
  // it exists — GET /blood-requests/{id} returns no distance and no
  // coordinates. So it is carried across on the navigation and treated as the
  // snapshot it is; absent (a deep link, say) it is simply not shown.
  const parsedDistance = singleParam(params.distanceKm);
  const distanceKm = parsedDistance === null ? null : Number(parsedDistance);
  const shownDistance = distanceKm !== null && Number.isFinite(distanceKm) ? distanceKm : null;

  const [detail, setDetail] = useState<DetailState>({ status: "loading" });
  const [existingMatch, setExistingMatch] = useState<RequestMatchDetail | null>(null);
  // Bumping this re-runs the fetch — all "Try Again" is.
  const [reloadToken, setReloadToken] = useState(0);

  const [modalVisible, setModalVisible] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<AcceptError | null>(null);
  const [match, setMatch] = useState<RequestMatchDetail | null>(null);
  const [isSwitchingAvailability, setIsSwitchingAvailability] = useState(false);
  // Drives the pulsing dot on the urgency banner. Created once and always
  // running; only the critical level renders the view that reads it.
  const [pulse] = useState(() => new Animated.Value(0));

  const donor = state.status === "signedIn" && state.role === "donor" ? state.profile : null;
  // Optimistic default: if the profile somehow isn't a donor profile, assume
  // available rather than offering a fix for a problem that may not exist.
  const donorIsAvailable = donor?.is_available ?? true;

  useEffect(() => {
    if (!requestId) {
      setDetail({
        status: "error",
        error: { kind: "unavailable", message: "This request could not be identified." },
      });
      return;
    }

    let cancelled = false;

    async function load() {
      setDetail({ status: "loading" });
      try {
        const [request, matches] = await Promise.all([fetchRequest(requestId!), fetchMyMatches()]);
        if (!cancelled) {
          setDetail({ status: "ready", request });
          setExistingMatch(matches.find((match) => match.blood_request_id === request.id) ?? null);
        }
      } catch (error) {
        if (!cancelled) setDetail({ status: "error", error: describeRequestError(error) });
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [requestId, reloadToken]);

  async function handleAccept(commitment: Commitment) {
    if (!requestId || isAccepting) return;
    const currentRequest = detail.status === "ready" ? detail.request : null;
    if (!currentRequest || !isBroadcasting(currentRequest.status) || existingMatch) return;

    setIsAccepting(true);
    setAcceptError(null);

    try {
      // The 201 body is the match as stored — the units that were actually
      // reserved and the eta the server kept — so the sheet confirms off that
      // rather than off what was typed.
      setMatch(await acceptRequest(requestId, commitment));
    } catch (error) {
      setAcceptError(describeAcceptError(error, { donorIsAvailable }));
    } finally {
      setIsAccepting(false);
    }
  }

  async function handleSwitchToAvailable() {
    if (isSwitchingAvailability) return;

    setIsSwitchingAvailability(true);
    try {
      applyProfile(await setDonorAvailability(true));
      // The reported failure was worded against the stale value, so it no
      // longer describes anything true. Clearing it leaves the donor on the
      // same sheet with a working Confirm button.
      setAcceptError(null);
    } catch (error) {
      setAcceptError({ message: availabilityErrorMessage(error), canSwitchToAvailable: false });
    } finally {
      setIsSwitchingAvailability(false);
    }
  }

  function handleCloseModal() {
    setModalVisible(false);
    setAcceptError(null);
    setMatch(null);
  }

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  const request = detail.status === "ready" ? detail.request : null;
  const appearance = request ? URGENCY_APPEARANCE[request.urgency_level] : null;
  const canAccept = Boolean(request && isBroadcasting(request.status) && !existingMatch);

  function closedRequestMessage(status: NonNullable<typeof request>["status"]): string {
    if (status === "fully_matched") return "This request has been fully matched.";
    if (status === "expired") return "This request has expired.";
    if (status === "cancelled") return "This request was cancelled.";
    if (status === "fulfilled") return "This request has been fulfilled.";
    return "This request is not currently accepting donations.";
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={styles.backButton}>
              <MaterialIcons name="chevron-left" size={24} color={colors.text} />
            </Pressable>
            <View style={styles.headerCenter}>
              <Text style={styles.title}>Request Details</Text>
              <Text style={styles.subtitle}>{request ? STATUS_LABELS[request.status] : "Loading"}</Text>
            </View>
            <View style={styles.headerSpacer} />
          </View>

          {detail.status === "loading" ? <LoadingState /> : null}

          {detail.status === "error" ? (
            <ErrorState
              error={detail.error}
              onRetry={() => setReloadToken((token) => token + 1)}
              onBack={() => router.back()}
            />
          ) : null}

          {request && appearance ? (
            <>
              <View style={[styles.urgency, appearance.container]}>
                <View style={styles.urgencyTop}>
                  <View style={styles.urgencyLabel}>
                    <View style={styles.urgencyDotWrap}>
                      {appearance.pulses ? (
                        <Animated.View
                          style={[
                            styles.urgencyPulse,
                            {
                              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.75, 0] }),
                              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }],
                            },
                          ]}
                        />
                      ) : null}
                      <View style={[styles.urgencyDot, appearance.dot]} />
                    </View>
                    <Text style={[styles.urgencyText, appearance.text]}>{appearance.banner}</Text>
                  </View>
                  <Text style={[styles.dispatchTag, appearance.tag]}>{STATUS_LABELS[request.status]}</Text>
                </View>
                <View style={styles.countdown}>
                  <MaterialIcons name="schedule" size={17} color={appearance.accent} />
                  <Text style={[styles.countdownText, appearance.countdown]}>
                    {formatDeadlineCountdown(request.required_by)}
                  </Text>
                </View>
              </View>

              <View style={styles.hero}>
                <View style={styles.bloodCircle}>
                  <Text style={styles.bloodType}>{request.blood_type_needed}</Text>
                  <Text style={styles.bloodNeeded}>NEEDED</Text>
                </View>
                <View style={[styles.verifiedBadge, !request.is_hospital_backed && styles.unverifiedBadge]}>
                  <MaterialIcons
                    name={request.is_hospital_backed ? "check-circle" : "warning"}
                    size={14}
                    color={request.is_hospital_backed ? colors.emeraldText : colors.amberText}
                  />
                  <Text style={[styles.verifiedText, !request.is_hospital_backed && styles.unverifiedText]}>
                    {request.is_hospital_backed ? "Verified Request" : "Unverified"}
                  </Text>
                </View>
                {/* The backend hands the patient's name to any donor the
                    request is actively reaching out to, so this is not a
                    disclosure the app is making on its own. */}
                <Text style={styles.requestTitle}>Blood needed for {request.patient_name}</Text>
              </View>

              {/* Replaces what used to be a MapView pinned to invented
                  coordinates. Nothing in either request DTO carries a latitude
                  or a longitude, so a real map is not on the table yet. */}
              <View style={styles.areaCard}>
                <View style={styles.areaRow}>
                  <View style={styles.areaIconWrap}>
                    <MaterialIcons name="location-on" size={20} color={colors.crimson} />
                  </View>
                  <View style={styles.areaCopy}>
                    <Text style={styles.areaTitle}>{request.area_label ?? "Area not specified"}</Text>
                    <Text style={styles.areaSub}>
                      Currently reaching donors within {request.current_radius_km} km
                    </Text>
                  </View>
                  {shownDistance === null ? null : (
                    <View style={styles.distanceChip}>
                      <MaterialIcons name="near-me" size={13} color={colors.crimson} />
                      <Text style={styles.distanceChipText}>{formatDistanceKm(shownDistance)}</Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={styles.muted}>Units Target</Text>
                  <Text style={styles.strong}>
                    {request.units_secured} of {request.units_needed} units secured
                  </Text>
                </View>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.max(0, Math.min(100, (request.units_secured / Math.max(1, request.units_needed)) * 100))}%`,
                      },
                    ]}
                  />
                </View>
                <View style={styles.progressFooter}>
                  <View style={styles.progressMessage}>
                    <MaterialIcons name="warning" size={15} color={colors.crimson} />
                    <Text style={styles.crimsonSmall}>
                      {remainingUnits(request)} more unit{remainingUnits(request) === 1 ? "" : "s"} needed
                    </Text>
                  </View>
                  <Text style={styles.completion}>
                    {Math.round((request.units_secured / Math.max(1, request.units_needed)) * 100)}% Complete
                  </Text>
                </View>
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionHeading}>Logistics &amp; Timing</Text>
                <View style={styles.logisticsRow}>
                  <View style={styles.logisticsIcon}>
                    <MaterialIcons name="location-on" size={19} color={colors.mutedText} />
                  </View>
                  <View style={styles.logisticsCopy}>
                    <Text style={styles.logisticsTitle}>{request.area_label ?? "Area not specified"}</Text>
                    <Text style={styles.logisticsSub}>
                      {request.hospital_name_text
                        ? `Named hospital: ${request.hospital_name_text}`
                        : "No hospital named on this request"}
                    </Text>
                  </View>
                </View>
                <View style={styles.logisticsRow}>
                  <View style={styles.logisticsIcon}>
                    <MaterialIcons name="schedule" size={19} color={colors.mutedText} />
                  </View>
                  <View style={styles.logisticsCopy}>
                    <Text style={styles.logisticsTitle}>
                      Required by {formatAbsoluteTime(request.required_by)}
                    </Text>
                    <Text style={styles.logisticsSub}>{formatDeadlineCountdown(request.required_by)}</Text>
                  </View>
                </View>
                <View style={[styles.logisticsRow, { marginBottom: 0 }]}>
                  <View style={styles.logisticsIcon}>
                    <MaterialIcons name="history" size={19} color={colors.mutedText} />
                  </View>
                  <View style={styles.logisticsCopy}>
                    <Text style={styles.logisticsTitle}>{formatPostedAgo(request.created_at)}</Text>
                    <Text style={styles.logisticsSub}>Request created</Text>
                  </View>
                </View>
              </View>

              <View style={styles.reassurance}>
                <View style={styles.reassuranceIcon}>
                  <MaterialIcons name="verified-user" size={18} color={colors.crimson} />
                </View>
                <View style={styles.reassuranceCopy}>
                  <Text style={styles.reassuranceTitle}>The coordinator&apos;s number is shown once you accept.</Text>
                  <Text style={styles.reassuranceText}>
                    Protecting patient and coordinator privacy until donor commitment is confirmed.
                  </Text>
                </View>
              </View>

              <View style={styles.precheck}>
                <Text style={styles.sectionHeading}>Donor Pre-Screening</Text>
                <View style={styles.precheckRow}>
                  <MaterialIcons name="check-circle" size={18} color={colors.emeraldText} />
                  <Text style={styles.precheckText}>
                    {donor
                      ? `You are a compatible ${donor.blood_type} donor`
                      : "You are a compatible donor for this request"}
                  </Text>
                </View>
              </View>

              {!canAccept ? (
                <View style={styles.statusBanner}>
                  <View style={styles.statusBannerIcon}>
                    <MaterialIcons
                      name={existingMatch ? "check-circle" : "info-outline"}
                      size={18}
                      color={existingMatch ? colors.emeraldText : colors.mutedText}
                    />
                  </View>
                  <View style={styles.statusBannerCopy}>
                    <Text style={styles.statusBannerTitle}>
                      {existingMatch ? "You've already committed to this request" : closedRequestMessage(request.status)}
                    </Text>
                    <Text style={styles.statusBannerText}>
                      {existingMatch
                        ? "You can manage this commitment from your donation history."
                        : "No new donation can be accepted for this request."}
                    </Text>
                    {existingMatch ? (
                      <Pressable onPress={() => router.push("/history" as RelativePathString)} style={styles.statusBannerAction}>
                        <Text style={styles.statusBannerActionText}>Open Donation History</Text>
                        <MaterialIcons name="chevron-right" size={16} color={colors.crimson} />
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ) : null}
            </>
          ) : null}
        </ScrollView>

        {/* Withheld until the request has loaded: accepting something the
            screen couldn't read is not an offer worth making. */}
        {request && appearance && canAccept ? (
          <View style={styles.bottomAction}>
            <Pressable onPress={() => setModalVisible(true)} style={styles.acceptButton}>
              <BrandLogo size={22} />
              <Text style={styles.acceptText}>Accept &amp; Donate</Text>
            </Pressable>
            <Text style={styles.commitmentText}>By accepting, you commit to arriving within the specified window.</Text>
          </View>
        ) : null}

        <View style={styles.bottomTabs}>
          <Pressable onPress={() => router.back()} style={styles.tab}>
            <MaterialIcons name="water-drop" size={23} color={colors.crimson} />
            <Text style={[styles.tabText, styles.tabActive]}>Requests</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/history" as RelativePathString)} style={styles.tab}>
            <MaterialIcons name="history" size={23} color="#6b7280" />
            <Text style={styles.tabText}>History</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/profile" as RelativePathString)} style={styles.tab}>
            <MaterialIcons name="person-outline" size={23} color="#6b7280" />
            <Text style={styles.tabText}>Profile</Text>
          </Pressable>
        </View>

        {request && appearance && canAccept ? (
          <RequestConfirmationModal
            visible={modalVisible}
            onClose={handleCloseModal}
            onConfirm={handleAccept}
            isSubmitting={isAccepting}
            error={acceptError}
            summary={{
              bloodType: request.blood_type_needed,
              urgencyLabel: appearance.name,
              areaLabel: request.area_label ?? "Area not specified",
              remainingUnits: remainingUnits(request),
            }}
            onSwitchToAvailable={handleSwitchToAvailable}
            isSwitchingAvailability={isSwitchingAvailability}
            match={match}
            // The feed behind this screen excluded the request the moment the
            // units were reserved, so returning to it is returning to a list
            // that refetches on focus — not a stale one.
            //
            // `dismissTo` rather than `back`: a donor who deep-linked straight
            // here has nothing to go back to, and `back()` would leave them
            // sitting on the success sheet with nowhere to go. dismissTo falls
            // back to replacing this screen with Home in that case.
            onDone={() => router.dismissTo("/home")}
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
}
