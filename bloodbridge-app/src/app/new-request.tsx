import { useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { createRequest } from "@/api/bloodRequests";
import type { BloodType, UrgencyLevel } from "@/api/types";
import { BLOOD_TYPES } from "@/api/types";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { useMyRequestsStore } from "@/store/myRequestsStore";
import { colors } from "@/theme/colors";

const URGENCY_OPTIONS: { value: UrgencyLevel; label: string }[] = [
  { value: "critical", label: "Critical" },
  { value: "urgent", label: "Urgent" },
  { value: "routine", label: "Routine" },
];

const TIME_PRESETS = [
  { label: "2 hours", hours: 2 },
  { label: "6 hours", hours: 6 },
  { label: "24 hours", hours: 24 },
  { label: "3 days", hours: 72 },
];

export default function NewRequestScreen() {
  const [patientName, setPatientName] = useState("");
  const [bloodType, setBloodType] = useState<BloodType | null>(null);
  const [units, setUnits] = useState(1);
  const [urgency, setUrgency] = useState<UrgencyLevel>("urgent");
  const [hoursFromNow, setHoursFromNow] = useState(6);
  const [hospitalName, setHospitalName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [areaLabel, setAreaLabel] = useState("");
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const addId = useMyRequestsStore((s) => s.addId);
  const queryClient = useQueryClient();

  async function handleUseCurrentLocation() {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Location needed", "We need your location to show this request to nearby donors.");
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      setCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      const places = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      if (places[0]) {
        setAreaLabel([places[0].district, places[0].city].filter(Boolean).join(", "));
      }
    } catch (err) {
      Alert.alert("Couldn't get location", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setLocating(false);
    }
  }

  async function handleSubmit() {
    if (!patientName || !bloodType || !contactPhone || !coords || !areaLabel) {
      Alert.alert(
        "Missing info",
        "Please fill in the patient name, blood type, contact number, and location."
      );
      return;
    }
    setSubmitting(true);
    try {
      const requiredBy = new Date(Date.now() + hoursFromNow * 3600 * 1000).toISOString();
      const created = await createRequest({
        patient_name: patientName,
        blood_type_needed: bloodType,
        units_needed: units,
        urgency_level: urgency,
        required_by: requiredBy,
        hospital_name: hospitalName || undefined,
        contact_phone: contactPhone,
        latitude: coords.latitude,
        longitude: coords.longitude,
        area_label: areaLabel,
      });
      await addId(created.id);
      queryClient.invalidateQueries({ queryKey: ["request", created.id] });
      router.replace(`/request/${created.id}`);
    } catch (err) {
      Alert.alert("Couldn't post request", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TextField
        label="Patient name"
        value={patientName}
        onChangeText={setPatientName}
        placeholder="Who needs blood?"
      />

      <Text style={styles.label}>Blood type needed</Text>
      <View style={styles.chipGrid}>
        {BLOOD_TYPES.map((type) => (
          <Pressable
            key={type}
            style={[styles.chip, bloodType === type && styles.chipActive]}
            onPress={() => setBloodType(type)}
          >
            <Text style={[styles.chipText, bloodType === type && styles.chipTextActive]}>{type}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Units needed</Text>
      <View style={styles.stepperRow}>
        <Pressable
          style={styles.stepperButton}
          onPress={() => setUnits((u) => Math.max(1, u - 1))}
        >
          <Text style={styles.stepperButtonText}>−</Text>
        </Pressable>
        <Text style={styles.stepperValue}>{units}</Text>
        <Pressable style={styles.stepperButton} onPress={() => setUnits((u) => Math.min(10, u + 1))}>
          <Text style={styles.stepperButtonText}>+</Text>
        </Pressable>
      </View>

      <Text style={styles.label}>Urgency</Text>
      <View style={styles.urgencyRow}>
        {URGENCY_OPTIONS.map((opt) => {
          const palette = colors.urgency[opt.value];
          const active = urgency === opt.value;
          return (
            <Pressable
              key={opt.value}
              style={[
                styles.urgencyOption,
                { borderColor: palette.border },
                active && { backgroundColor: palette.solid, borderColor: palette.solid },
              ]}
              onPress={() => setUrgency(opt.value)}
            >
              <Text style={[styles.urgencyText, active && styles.urgencyTextActive]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>Needed within</Text>
      <View style={styles.urgencyRow}>
        {TIME_PRESETS.map((preset) => {
          const active = hoursFromNow === preset.hours;
          return (
            <Pressable
              key={preset.hours}
              style={[styles.timeChip, active && styles.timeChipActive]}
              onPress={() => setHoursFromNow(preset.hours)}
            >
              <Text style={[styles.timeChipText, active && styles.timeChipTextActive]}>
                {preset.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <TextField
        label="Hospital name (optional)"
        value={hospitalName}
        onChangeText={setHospitalName}
        placeholder="Leave blank if not tied to a specific hospital"
      />
      <TextField
        label="Contact phone"
        value={contactPhone}
        onChangeText={setContactPhone}
        keyboardType="phone-pad"
        placeholder="Number donors can reach you on"
      />

      <Text style={styles.label}>Location</Text>
      <Pressable style={styles.locationButton} onPress={handleUseCurrentLocation} disabled={locating}>
        {locating ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Text style={styles.locationButtonText}>
            {coords ? "✓ Location captured — tap to refresh" : "Use my current location"}
          </Text>
        )}
      </Pressable>
      {!!areaLabel && (
        <TextField
          label="Area label (shown to donors)"
          value={areaLabel}
          onChangeText={setAreaLabel}
          placeholder="e.g. Johar Town, Lahore"
        />
      )}

      <Button label="Post request" onPress={handleSubmit} loading={submitting} />
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20 },
  label: { fontSize: 14, fontWeight: "600", color: colors.text, marginBottom: 8, marginTop: 4 },
  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  chip: {
    width: "22%",
    aspectRatio: 1.4,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 16, fontWeight: "800", color: colors.text },
  chipTextActive: { color: "#fff" },
  stepperRow: { flexDirection: "row", alignItems: "center", gap: 20, marginBottom: 20 },
  stepperButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperButtonText: { fontSize: 22, fontWeight: "700", color: colors.text },
  stepperValue: { fontSize: 20, fontWeight: "800", color: colors.text, minWidth: 30, textAlign: "center" },
  urgencyRow: { flexDirection: "row", gap: 10, marginBottom: 20, flexWrap: "wrap" },
  urgencyOption: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  urgencyText: { fontSize: 13, fontWeight: "700", color: colors.text },
  urgencyTextActive: { color: "#fff" },
  timeChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  timeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  timeChipText: { fontSize: 13, fontWeight: "600", color: colors.text },
  timeChipTextActive: { color: "#fff" },
  locationButton: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 16,
  },
  locationButtonText: { color: colors.primary, fontWeight: "700", fontSize: 14 },
});
