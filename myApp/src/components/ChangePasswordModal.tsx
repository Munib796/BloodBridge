import { MaterialIcons } from "@expo/vector-icons";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, Text, View } from "react-native";

import { changePasswordModalStyles as styles } from "../styles/changePasswordModalStyles";
import { colors } from "../theme/colors";

type ChangePasswordModalProps = {
  visible: boolean;
  email: string;
  onClose: () => void;
  onSendResetLink: () => void;
  /** The POST is in flight. */
  isSending: boolean;
  /**
   * True once the backend accepted the request. Owned by the caller, because
   * the caller is the one that made the call.
   */
  isSent: boolean;
  /** A 429, an offline failure, a malformed address. */
  error: string | null;
};

export default function ChangePasswordModal({ visible, email, onClose, onSendResetLink, isSending, isSent, error }: ChangePasswordModalProps) {
  const close = () => {
    if (isSending) return;
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Pressable accessibilityLabel="Close change password dialog" onPress={close} style={styles.closeButton}>
            <MaterialIcons name="close" size={18} color={colors.mutedText} />
          </Pressable>
          <View style={styles.content}>
            <View style={styles.header}>
              <Text style={styles.title}>Change Password</Text>
              <Text style={styles.subtitle}>For your security, we&apos;ll send a password reset link to your email address:</Text>
            </View>
            <Text style={styles.label}>ACCOUNT EMAIL</Text>
            <View accessibilityLabel="Account email" style={styles.emailCard}>
              <Text style={styles.emailText}>{email || "No email entered"}</Text>
            </View>
            <Text style={styles.helper}>Clicking below will immediately send a password reset link to this inbox.</Text>

            {isSent ? (
              <View accessibilityLiveRegion="polite" style={styles.success}>
                <MaterialIcons name="check-circle" size={18} color={colors.emeraldText} />
                {/* Conditional on purpose. The endpoint answers the same way
                    whether or not the address exists — deliberately, so it
                    can't be used to find out who has an account — so a flat
                    "sent" would be a claim the backend refused to make. */}
                <Text style={styles.successText}>
                  If {email || "that address"} is registered, a reset link is on its way.
                </Text>
              </View>
            ) : (
              <>
                {error ? (
                  <View style={styles.errorBox}>
                    <MaterialIcons name="error-outline" size={15} color={colors.crimson} />
                    <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                <View style={styles.actions}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={isSending || !email.trim()}
                    onPress={onSendResetLink}
                    style={[styles.sendButton, (isSending || !email.trim()) && styles.sendButtonDisabled]}
                  >
                    {isSending ? (
                      <ActivityIndicator color={colors.surface} />
                    ) : (
                      <>
                        <MaterialIcons name="mail-outline" size={18} color={colors.surface} />
                        <Text style={styles.sendText}>Send Reset Link</Text>
                      </>
                    )}
                  </Pressable>
                  <Pressable accessibilityRole="button" disabled={isSending} onPress={close} style={styles.cancelButton}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
