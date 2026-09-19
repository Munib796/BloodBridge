import * as Location from "expo-location";
import { MaterialIcons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from "react-native";

import { editLocationModalStyles as styles } from "../styles/editLocationModalStyles";
import { colors } from "../theme/colors";
import { reverseGeocodeAreaLabel } from "../utils/location";

export type ProfileLocation = {
  latitude: number | null;
  longitude: number | null;
  areaLabel: string;
};

type EditLocationModalProps = {
  visible: boolean;
  currentLocation: ProfileLocation;
  onClose: () => void;
  onSave: (location: ProfileLocation) => void;
  /** The PATCH is in flight. */
  isSubmitting: boolean;
  /** 422s keyed by the backend's DTO field names — `area_label` here mostly. */
  fieldErrors: Record<string, string>;
  /** Anything that isn't tied to a field: offline, 401, 5xx. */
  error: string | null;
};

function formatCoordinate(value: number | null, direction: "N" | "S" | "E" | "W") {
  if (value === null) return "Location not captured";
  const absoluteValue = Math.abs(value).toFixed(4);
  const coordinateDirection = value >= 0 ? direction : direction === "N" ? "S" : "W";
  return `${absoluteValue}° ${coordinateDirection}`;
}

export default function EditLocationModal({ visible, currentLocation, onClose, onSave, isSubmitting, fieldErrors, error }: EditLocationModalProps) {
  const [draftLocation, setDraftLocation] = useState(currentLocation);
  const [focused, setFocused] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

  const close = () => {
    if (isSubmitting) return;
    setDraftLocation(currentLocation);
    setFocused(false);
    setCaptureError(null);
    onClose();
  };

  const recalibrate = async () => {
    setIsCapturing(true);
    setCaptureError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        setCaptureError("Location permission is needed to recalibrate.");
        return;
      }

      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const areaLabel = await reverseGeocodeAreaLabel(position.coords.latitude, position.coords.longitude);
      setDraftLocation((location) => ({
        ...location,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        // The geocoder returns "" when it fails, and the backend rejects a
        // blank area_label — so an empty result leaves whatever was typed
        // rather than silently clearing the box.
        areaLabel: areaLabel || location.areaLabel,
      }));
    } catch {
      setCaptureError("Could not capture your location. Please try again.");
    } finally {
      setIsCapturing(false);
    }
  };

  // Same contract as the other two editors: the parent closes once the PATCH
  // has succeeded, so a failure keeps the captured coordinates on screen.
  const save = () => {
    if (isSubmitting) return;
    if (draftLocation.latitude !== null && draftLocation.longitude !== null && draftLocation.areaLabel.trim()) {
      onSave({ ...draftLocation, areaLabel: draftLocation.areaLabel.trim() });
    }
  };

  const hasCapturedLocation = draftLocation.latitude !== null && draftLocation.longitude !== null;
  const areaLabelError = fieldErrors.area_label;
  // A 422 on latitude/longitude can only mean the captured fix was out of the
  // valid range, which is a bug rather than something to correct by typing.
  const coordinateError = fieldErrors.latitude ?? fieldErrors.longitude;
  const canSave = hasCapturedLocation && draftLocation.areaLabel.trim().length > 0 && !isSubmitting;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Pressable accessibilityLabel="Close edit location dialog" onPress={close} style={styles.closeButton}>
            <MaterialIcons name="close" size={18} color={colors.mutedText} />
          </Pressable>
          <View style={styles.content}>
            <View style={styles.header}>
              <Text style={styles.title}>Edit Location &amp; Area</Text>
              <Text style={styles.subtitle}>Update your primary coordinates and neighborhood for emergency donor matching.</Text>
            </View>
            <Text style={styles.label}>LOCATION COORDINATES (GPS)</Text>
            <View style={styles.locationCard}>
              <View style={styles.locationIcon}><MaterialIcons name="my-location" size={17} color={colors.emeraldText} /></View>
              <View style={styles.locationCopy}>
                <Text style={styles.locationTitle}>{hasCapturedLocation ? "GPS Position Locked" : "GPS Position Needed"}</Text>
                <Text style={styles.locationMeta}>{formatCoordinate(draftLocation.latitude, "N")} · {formatCoordinate(draftLocation.longitude, "E")} {hasCapturedLocation ? "· ±6m precision" : ""}</Text>
              </View>
              <Pressable accessibilityRole="button" disabled={isCapturing || isSubmitting} onPress={recalibrate} style={styles.recalibrate}>
                <Text style={styles.recalibrateText}>{isCapturing ? "Locating..." : hasCapturedLocation ? "Recalibrate" : "Capture"}</Text>
              </Pressable>
            </View>
            {captureError && <Text accessibilityRole="alert" style={styles.statusText}>{captureError}</Text>}
            {coordinateError ? (
              <Text accessibilityRole="alert" style={styles.fieldError}>{coordinateError}</Text>
            ) : null}
            {/* Nothing here reassures the donor that their stored coordinates
                came back — they cannot have, the backend never sends them. A
                donor whose location is already saved still sees "GPS Position
                Needed" until they capture a fresh fix, because changing the
                label alone is not something the endpoint accepts. */}
            <Text style={styles.helper}>Adding your location is what makes you appear in nearby donors&apos; searches. The backend stores your coordinates and never sends them back to the app, so a fresh capture is needed each time you change this.</Text>

            <Text style={styles.label}>AREA / NEIGHBORHOOD LABEL</Text>
            <TextInput
              accessibilityLabel="Area or neighborhood label"
              autoCapitalize="words"
              editable={!isSubmitting}
              maxLength={120}
              onBlur={() => setFocused(false)}
              onChangeText={(areaLabel) => setDraftLocation((location) => ({ ...location, areaLabel }))}
              onFocus={() => setFocused(true)}
              returnKeyType="done"
              style={[styles.input, focused && styles.inputFocused, areaLabelError ? styles.inputError : null]}
              value={draftLocation.areaLabel}
            />
            {areaLabelError ? (
              <Text accessibilityRole="alert" style={styles.fieldError}>{areaLabelError}</Text>
            ) : null}
            <Text style={styles.helper}>This is the location nearby donors&apos; searches are matched against - keep it accurate.</Text>

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
