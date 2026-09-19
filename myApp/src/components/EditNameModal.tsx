import { MaterialIcons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from "react-native";

import { editNameModalStyles as styles } from "../styles/editNameModalStyles";
import { colors } from "../theme/colors";

type EditNameModalProps = {
  visible: boolean;
  currentName: string;
  onClose: () => void;
  onSave: (name: string) => void;
  /** The PATCH is in flight. */
  isSubmitting: boolean;
  /** 422s keyed by the backend's DTO field names — `full_name` here. */
  fieldErrors: Record<string, string>;
  /** Anything that isn't tied to a field: offline, 401, 5xx. */
  error: string | null;
};

export default function EditNameModal({ visible, currentName, onClose, onSave, isSubmitting, fieldErrors, error }: EditNameModalProps) {
  const [draftName, setDraftName] = useState(currentName);
  const [inputFocused, setInputFocused] = useState(false);

  const close = () => {
    if (isSubmitting) return;
    setDraftName(currentName);
    setInputFocused(false);
    onClose();
  };

  // No close() here. The parent closes the sheet once the PATCH has actually
  // succeeded, so a failure keeps the draft on screen to correct and retry
  // rather than discarding what was typed.
  const save = () => {
    if (isSubmitting) return;
    const name = draftName.trim();
    if (name) {
      onSave(name);
    }
  };

  const nameError = fieldErrors.full_name;
  const canSave = draftName.trim().length > 0 && !isSubmitting;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Pressable accessibilityLabel="Close edit name dialog" onPress={close} style={styles.closeButton}>
            <MaterialIcons name="close" size={18} color={colors.mutedText} />
          </Pressable>
          <View style={styles.content}>
            <View style={styles.header}>
              <Text style={styles.title}>Edit Name</Text>
              <Text style={styles.subtitle}>Update your full name displayed across your BloodBridge profile and requests.</Text>
            </View>
            <Text style={styles.label}>Full Name</Text>
            <TextInput
              accessibilityLabel="Full name"
              autoCapitalize="words"
              editable={!isSubmitting}
              maxLength={120}
              onBlur={() => setInputFocused(false)}
              onChangeText={setDraftName}
              onFocus={() => setInputFocused(true)}
              returnKeyType="done"
              style={[styles.input, inputFocused && styles.inputFocused, nameError ? styles.inputError : null]}
              value={draftName}
            />
            {nameError ? (
              <Text accessibilityRole="alert" style={styles.fieldError}>{nameError}</Text>
            ) : null}
            <Text style={styles.helper}>Your name helps hospitals and coordinators verify your identity during requests.</Text>

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
