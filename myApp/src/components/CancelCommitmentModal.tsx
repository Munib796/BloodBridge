import { MaterialIcons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from "react-native";

import { cancelCommitmentModalStyles as styles } from "../styles/cancelCommitmentModalStyles";
import { colors } from "../theme/colors";

export type CommitmentContext = {
  bloodType: string;
  urgency: string;
  unitsCommitted: string;
  hospital: string;
  location: string;
  /** A complete phrase — "1.8 km away", "450 m away", "Distance unknown". */
  distance: string;
  remainingUnits: number;
};

type CancelCommitmentModalProps = {
  visible: boolean;
  context: CommitmentContext;
  onClose: () => void;
  onCancelCommitment: (reason: string) => void;
  /** The PATCH is in flight. */
  isSubmitting: boolean;
  /**
   * Why the last attempt failed, from the backend. The sheet stays open with
   * the reason still typed in, so retrying is one tap rather than retyping.
   */
  error: string | null;
};

export default function CancelCommitmentModal({ visible, context, onClose, onCancelCommitment, isSubmitting, error }: CancelCommitmentModalProps) {
  const [reason, setReason] = useState("");
  const [focused, setFocused] = useState(false);

  // The parent owns `visible` now — it closes the sheet only once the backend
  // has actually cancelled the commitment. So the draft reason is cleared here,
  // on the transition to hidden, rather than inside close(): a failed attempt
  // must not wipe what the donor wrote.
  useEffect(() => {
    if (!visible) {
      setReason("");
      setFocused(false);
    }
  }, [visible]);

  const close = () => {
    if (isSubmitting) return;
    onClose();
  };

  // No close() here: dismissing the sheet before the PATCH resolves would hide
  // a failure behind a screen that still shows the commitment as live.
  const cancelCommitment = () => {
    if (isSubmitting) return;
    onCancelCommitment(reason.trim());
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Pressable accessibilityLabel="Close cancel commitment dialog" onPress={close} style={styles.closeButton}>
            <MaterialIcons name="close" size={18} color={colors.mutedText} />
          </Pressable>
          <View style={styles.content}>
            <View style={styles.header}>
              <Text style={styles.title}>Cancel Your Commitment</Text>
              <Text style={styles.subtitle}>Are you sure you want to cancel this donation commitment?</Text>
            </View>
            <View style={styles.contextCard}>
              <View style={styles.contextTop}><MaterialIcons name="water-drop" size={16} color={colors.crimson} /><Text style={styles.contextBadge}>{context.bloodType} NEEDED · {context.urgency}</Text></View>
              <Text style={styles.contextTitle}>{context.unitsCommitted} committed · {context.hospital}</Text>
              <Text style={styles.contextMeta}>{context.location} · {context.distance}</Text>
            </View>
            <View style={styles.warning}><MaterialIcons name="warning" size={18} color={colors.amberText} /><Text style={styles.warningText}>This request still needs {context.remainingUnits} more units - cancelling may delay finding a replacement donor.{"\n\n"}The unit will become available for other donors to accept.</Text></View>
            <View style={styles.labelRow}><Text style={styles.label}>Reason (optional)</Text><Text style={styles.counter}>{reason.length}/500</Text></View>
            <TextInput
              accessibilityLabel="Cancellation reason"
              editable={!isSubmitting}
              maxLength={500}
              multiline
              onBlur={() => setFocused(false)}
              onChangeText={setReason}
              onFocus={() => setFocused(true)}
              placeholder="Tell us why you need to cancel"
              placeholderTextColor={colors.subtleText}
              style={[styles.input, focused && styles.inputFocused]}
              value={reason}
            />
            <Text style={styles.helper}>Your reason helps coordinators understand changes to active commitments.</Text>

            {/* The backend's message verbatim — "Match is already cancelled"
                and "Match not found" are both real answers here, not faults. */}
            {error ? (
              <View style={styles.errorBox}>
                <MaterialIcons name="error-outline" size={15} color={colors.crimson} />
                <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.actions}>
              <Pressable accessibilityRole="button" disabled={isSubmitting} onPress={cancelCommitment} style={[styles.cancelButton, isSubmitting && styles.busy]}>
                {isSubmitting ? (
                  <ActivityIndicator color={colors.surface} />
                ) : (
                  <>
                    <MaterialIcons name="event-busy" size={18} color={colors.surface} />
                    <Text style={styles.cancelButtonText}>Cancel Commitment</Text>
                  </>
                )}
              </Pressable>
              <Pressable accessibilityRole="button" disabled={isSubmitting} onPress={close} style={styles.keepButton}><Text style={styles.keepText}>Never Mind, Keep Commitment</Text></Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
