import { MaterialIcons } from "@expo/vector-icons";
import { ActivityIndicator, Linking, Modal, Pressable, Text, View } from "react-native";
import { useState } from "react";

import { colors } from "../theme/colors";
import { requestDetailStyles as styles } from "../styles/requestDetailStyles";
import type { RequestMatchDetail } from "../lib/apiTypes";
import type { AcceptError, Commitment } from "../lib/requestMatches";
import { formatAbsoluteTime } from "../lib/format";
import { dialablePakistaniPhone, formatPakistaniPhone } from "../lib/phone";

/**
 * What the sheet needs to describe the request being accepted. Passed as one
 * object rather than four separate props, since they all come off the same
 * fetched record.
 */
export type RequestSummary = {
  bloodType: string;
  urgencyLabel: string;
  areaLabel: string;
  /** units_needed - units_secured, as of the fetch. */
  remainingUnits: number;
};

/**
 * The most a single donor can commit to in one sitting.
 *
 * Matches the backend's MAX_UNITS (src/utils/constants.py), which is the
 * ceiling `Units` puts on `units_committed` — offering more would only produce a
 * 422. It is an absolute cap, not the operative one: the stepper stops at
 * whichever is smaller, this or what the request still needs.
 */
const MAX_DONATION_UNITS = 20;

/** Minutes from now, for the `eta` the accept endpoint requires. */
const ARRIVAL_OPTIONS = [
  { label: "15 mins", minutes: 15 },
  { label: "30 mins", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "2+ hours", minutes: 120 },
] as const;

const DEFAULT_ARRIVAL_MINUTES = 30;

export default function RequestConfirmationModal({
  visible,
  onClose,
  onConfirm,
  isSubmitting,
  error,
  summary,
  onSwitchToAvailable,
  isSwitchingAvailability,
  match,
  onDone,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (commitment: Commitment) => void;
  isSubmitting: boolean;
  error: AcceptError | null;
  summary: RequestSummary;
  onSwitchToAvailable: () => void;
  isSwitchingAvailability: boolean;
  /** Non-null once the backend has recorded the match. */
  match: RequestMatchDetail | null;
  /** Leave the screen — the only sensible move after a confirmed commitment. */
  onDone: () => void;
}) {
  const [units, setUnits] = useState(1);
  const [arrivalMinutes, setArrivalMinutes] = useState<number>(DEFAULT_ARRIVAL_MINUTES);

  const maxUnits = Math.max(1, Math.min(MAX_DONATION_UNITS, summary.remainingUnits));
  // The sheet stays mounted across requests, so a unit count chosen for a
  // request with four units left must not carry over to one that needs a single
  // unit — the backend would reject it with a 409.
  const selectedUnits = Math.min(units, maxUnits);

  const close = () => {
    if (isSubmitting) return;
    setUnits(1);
    setArrivalMinutes(DEFAULT_ARRIVAL_MINUTES);
    onClose();
  };

  const confirmed = match !== null;

  // Android's back button. Once the commitment is recorded there is nothing
  // useful to go back to — the screen behind this one still shows the request
  // as it was before the units were reserved — so it leaves too.
  const handleRequestClose = () => {
    if (confirmed) {
      onDone();
      return;
    }
    close();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleRequestClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modal}>
          <View style={styles.modalHandle} />
          {/* No dismiss affordance once the match exists: the donor's next
              action is to acknowledge it, not to go back to a stale screen. */}
          {confirmed ? null : (
            <Pressable accessibilityLabel="Close dialog" onPress={close} style={styles.modalClose}>
              <MaterialIcons name="close" size={18} color="#64748b" />
            </Pressable>
          )}

          <View style={styles.modalContent}>
            {match ? (
              <CommitmentConfirmed match={match} onDone={onDone} />
            ) : (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Confirm Your Commitment</Text>
                  <Text style={styles.modalBody}>
                    You&apos;re about to accept this {summary.bloodType} {summary.urgencyLabel} request.
                  </Text>
                </View>

                <View style={styles.commitmentPill}>
                  <View style={styles.commitmentPillDot} />
                  <Text style={styles.commitmentPillText}>
                    {summary.bloodType} {summary.urgencyLabel} · {summary.areaLabel}
                  </Text>
                </View>

                <View style={styles.unitsBox}>
                  <View style={styles.unitsCopy}>
                    <Text style={styles.unitsTitle}>How many units can you donate?</Text>
                    <Text style={styles.unitsSubtitle}>
                      {summary.remainingUnits} unit{summary.remainingUnits === 1 ? "" : "s"} still needed for this request
                    </Text>
                  </View>
                  <View style={styles.stepper}>
                    <Pressable
                      accessibilityLabel="Decrease units"
                      disabled={selectedUnits <= 1 || isSubmitting}
                      onPress={() => setUnits(Math.max(1, selectedUnits - 1))}
                      style={[styles.stepperButton, (selectedUnits <= 1 || isSubmitting) && styles.stepperButtonDisabled]}
                    >
                      <MaterialIcons name="remove" size={16} color={selectedUnits <= 1 ? "#94a3b8" : "#334155"} />
                    </Pressable>
                    <Text style={styles.stepperValue}>{selectedUnits}</Text>
                    <Pressable
                      accessibilityLabel="Increase units"
                      disabled={selectedUnits >= maxUnits || isSubmitting}
                      onPress={() => setUnits(Math.min(maxUnits, selectedUnits + 1))}
                      style={[styles.stepperButton, (selectedUnits >= maxUnits || isSubmitting) && styles.stepperButtonDisabled]}
                    >
                      <MaterialIcons name="add" size={16} color={selectedUnits >= maxUnits ? "#94a3b8" : "#334155"} />
                    </Pressable>
                  </View>
                </View>

                <Text style={styles.arrivalTitle}>Estimated Arrival Time</Text>
                <View style={styles.arrivalGrid}>
                  {ARRIVAL_OPTIONS.map((option) => {
                    const selected = arrivalMinutes === option.minutes;
                    return (
                      <Pressable
                        key={option.label}
                        disabled={isSubmitting}
                        onPress={() => setArrivalMinutes(option.minutes)}
                        style={[styles.arrivalOption, selected && styles.arrivalOptionSelected]}
                      >
                        <Text style={[styles.arrivalText, selected && styles.arrivalTextSelected]}>{option.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.reminderBox}>
                  <View style={styles.reminderIcon}>
                    <MaterialIcons name="phone-in-talk" size={14} color={colors.crimson} />
                  </View>
                  <Text style={styles.reminderText}>
                    Once confirmed, the coordinator&apos;s number will be shown here.
                  </Text>
                </View>

                {/* The backend's message verbatim, plus the one failure the
                    donor can clear without leaving this sheet. */}
                {error ? (
                  <View style={styles.modalError}>
                    <MaterialIcons name="error-outline" size={15} color={colors.crimson} />
                    <Text accessibilityRole="alert" style={styles.modalErrorText}>
                      {error.message}
                    </Text>
                  </View>
                ) : null}

                {error?.canSwitchToAvailable ? (
                  <Pressable
                    onPress={onSwitchToAvailable}
                    disabled={isSwitchingAvailability}
                    style={[styles.availableButton, isSwitchingAvailability && styles.modalConfirmBusy]}
                  >
                    {isSwitchingAvailability ? (
                      <ActivityIndicator size="small" color={colors.emeraldText} />
                    ) : (
                      <MaterialIcons name="toggle-on" size={18} color={colors.emeraldText} />
                    )}
                    <Text style={styles.availableButtonText}>Mark me available again</Text>
                  </Pressable>
                ) : null}

                <View style={styles.modalActions}>
                  <Pressable
                    onPress={() => onConfirm({ units: selectedUnits, arrivalMinutes })}
                    disabled={isSubmitting}
                    style={[styles.modalConfirm, isSubmitting && styles.modalConfirmBusy]}
                  >
                    {isSubmitting ? (
                      <ActivityIndicator color={colors.surface} />
                    ) : (
                      <>
                        <MaterialIcons name="volunteer-activism" size={19} color={colors.surface} />
                        <Text style={styles.modalConfirmText}>Confirm Commitment</Text>
                      </>
                    )}
                  </Pressable>
                  <Pressable onPress={close} disabled={isSubmitting} style={styles.modalCancel}>
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

/**
 * The other half of the sheet: what the backend actually recorded, and who to
 * call about it.
 *
 * Everything here comes off the 201 response rather than off the form, so it
 * shows the match as stored — the units that were really reserved, and the
 * `eta` the server kept.
 */
function CommitmentConfirmed({ match, onDone }: { match: RequestMatchDetail; onDone: () => void }) {
  const unitsLabel = `${match.units_committed} unit${match.units_committed === 1 ? "" : "s"}`;
  const posterPhone = formatPakistaniPhone(match.poster_phone);

  return (
    <View style={styles.successBox}>
      <View style={styles.successIcon}>
        <MaterialIcons name="check-circle" size={40} color={colors.emerald} />
      </View>
      <Text style={styles.successTitle}>You&apos;re Committed</Text>
      <Text style={styles.successText}>
        Your commitment is recorded. The coordinator has your name and number — theirs are below.
      </Text>

      <View style={styles.successRows}>
        <View style={styles.successRow}>
          <Text style={styles.successLabel}>Units committed</Text>
          <Text style={styles.successValue}>{unitsLabel}</Text>
        </View>
        <View style={styles.successRow}>
          <Text style={styles.successLabel}>Your arrival time</Text>
          <Text style={styles.successValue}>{match.eta ? formatAbsoluteTime(match.eta) : "Not set"}</Text>
        </View>
        <View style={styles.successRow}>
          <Text style={styles.successLabel}>Request</Text>
          <Text style={styles.successValue}>
            {match.blood_request.blood_type_needed} · {match.blood_request.area_label ?? "Area not specified"}
          </Text>
        </View>
      </View>

      <View style={styles.coordinatorBox}>
        <View style={styles.coordinatorCopy}>
          <Text style={styles.coordinatorLabel}>Blood coordinator</Text>
          <Text style={styles.coordinatorName}>{match.poster_name ?? "Coordinator"}</Text>
          <Text style={styles.coordinatorPhone}>{posterPhone}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Call ${posterPhone}`}
          onPress={() => Linking.openURL(`tel:${dialablePakistaniPhone(match.poster_phone)}`)}
          style={styles.callButton}
        >
          <MaterialIcons name="call" size={15} color={colors.surface} />
          <Text style={styles.callText}>Call</Text>
        </Pressable>
      </View>

      <Pressable onPress={onDone} style={[styles.modalConfirm, { marginTop: 18 }]}>
        <Text style={styles.modalConfirmText}>Back to Requests</Text>
      </Pressable>
    </View>
  );
}
