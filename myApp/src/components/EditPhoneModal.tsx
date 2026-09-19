import { MaterialIcons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from "react-native";

import { editPhoneModalStyles as styles } from "../styles/editPhoneModalStyles";
import { composePakistaniPhone, isValidPakistaniPhone, phoneInputDigits, PAKISTAN_COUNTRY_CODE } from "../lib/phone";
import { colors } from "../theme/colors";

type EditPhoneModalProps = {
  visible: boolean;
  currentPhone: string;
  onClose: () => void;
  onSave: (phone: string) => void;
  /** The PATCH is in flight. */
  isSubmitting: boolean;
  /** 422s keyed by the backend's DTO field names — `phone` here. */
  fieldErrors: Record<string, string>;
  /** Anything that isn't tied to a field: offline, 401, 5xx. */
  error: string | null;
};

export default function EditPhoneModal({ visible, currentPhone, onClose, onSave, isSubmitting, fieldErrors, error }: EditPhoneModalProps) {
  const [phoneNumber, setPhoneNumber] = useState(phoneInputDigits(currentPhone));
  const [focusedInput, setFocusedInput] = useState<"country" | "number" | null>(null);

  const close = () => {
    if (isSubmitting) return;
    setPhoneNumber(phoneInputDigits(currentPhone));
    setFocusedInput(null);
    onClose();
  };

  // The parent closes on success; see the note in EditNameModal.
  const save = () => {
    if (isSubmitting) return;
    if (isValidPakistaniPhone(phoneNumber)) {
      onSave(composePakistaniPhone(phoneNumber));
    }
  };

  const phoneError = fieldErrors.phone ?? (phoneNumber && !isValidPakistaniPhone(phoneNumber) ? "Enter 10 digits starting with 3." : undefined);
  const canSave = isValidPakistaniPhone(phoneNumber) && !isSubmitting;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Pressable accessibilityLabel="Close edit phone number dialog" onPress={close} style={styles.closeButton}>
            <MaterialIcons name="close" size={18} color={colors.mutedText} />
          </Pressable>
          <View style={styles.content}>
            <View style={styles.header}>
              <Text style={styles.title}>Edit Phone Number</Text>
              <Text style={styles.subtitle}>Update your mobile number for emergency notifications and coordinator verification.</Text>
            </View>
            <Text style={styles.label}>PHONE NUMBER</Text>
            <View style={styles.phoneFields}>
              <TextInput
                accessibilityLabel="Country code"
                editable={false}
                onFocus={() => setFocusedInput("country")}
                style={[styles.countryCode, focusedInput === "country" && styles.inputFocused, phoneError ? styles.inputError : null]}
                value={PAKISTAN_COUNTRY_CODE}
              />
              <TextInput
                accessibilityLabel="Phone number"
                editable={!isSubmitting}
                keyboardType="phone-pad"
                onBlur={() => setFocusedInput(null)}
                maxLength={10}
                onChangeText={(value) => setPhoneNumber(phoneInputDigits(value))}
                onFocus={() => setFocusedInput("number")}
                returnKeyType="done"
                style={[styles.numberInput, focusedInput === "number" && styles.inputFocused, phoneError ? styles.inputError : null]}
                value={phoneNumber}
              />
            </View>
            {phoneError ? (
              <Text accessibilityRole="alert" style={styles.fieldError}>{phoneError}</Text>
            ) : null}
            <Text style={styles.helper}>This number is used by donors and coordinators to reach you during an active match.</Text>

            {error ? (
              <View style={styles.errorBox}>
                <MaterialIcons name="error-outline" size={15} color={colors.crimson} />
                <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.actions}>
              <Pressable accessibilityRole="button" disabled={!canSave} onPress={save} style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}>
                {isSubmitting ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.saveText}>Save Changes</Text>}
              </Pressable>
              <Pressable accessibilityRole="button" disabled={isSubmitting} onPress={close} style={styles.cancelButton}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
