import * as Location from "expo-location";
import { MaterialIcons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Animated, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ApiError, fieldErrorsFrom } from "../lib/apiClient";
import { createBloodRequest } from "../lib/bloodRequests";
import { formatAbsoluteTime } from "../lib/format";
import { composePakistaniPhone, isValidPakistaniPhone, phoneInputDigits, PAKISTAN_COUNTRY_CODE } from "../lib/phone";
import { useAuth } from "../context/AuthContext";
import { colors } from "../theme/colors";
import { createEmergencyRequestStyles as styles } from "../styles/createEmergencyRequestStyles";
import { reverseGeocodeAreaLabel } from "../utils/location";

type UrgencyLevel = "critical" | "urgent" | "routine";
type Coordinates = { latitude: number; longitude: number } | null;

/** Mirrors the backend's Name/Label/Phone bounds — src/utils/validators.py. */
const MAX_NAME_LENGTH = 120;

const bloodTypes = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];
const urgencyOptions: { key: UrgencyLevel; label: string; color: string; selectedTint: string; textColor: string }[] = [
  { key: "critical", label: "Critical", color: "#c8102e", selectedTint: "#fef2f2", textColor: "#c8102e" },
  { key: "urgent", label: "Urgent", color: "#f59e0b", selectedTint: "#fffbeb", textColor: "#b45309" },
  { key: "routine", label: "Routine", color: "#64748b", selectedTint: "#f1f5f9", textColor: "#475569" },
];

/**
 * How long the poster has.
 *
 * `required_by` is a `FutureDatetime` on the backend — it is validated against
 * the server's clock and rejected if it is not in the future — so the form has
 * to produce a real timestamp. This used to be a hardcoded "Today, 5:30 PM"
 * that was never sent anywhere; a plain offset is the honest version of it, and
 * an offset rather than a picker means the deadline cannot be set in the past
 * by a device with the wrong clock.
 */
const DEFAULT_HOURS_BY_URGENCY: Record<UrgencyLevel, number> = { critical: 4, urgent: 12, routine: 48 };
const DAY_MS = 86_400_000;

function formatCoordinate(value: number, positiveDirection: "N" | "E", negativeDirection: "S" | "W") {
  return `${Math.abs(value).toFixed(4)}° ${value >= 0 ? positiveDirection : negativeDirection}`;
}

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function sameDay(first: Date, second: Date): boolean {
  return startOfDay(first).getTime() === startOfDay(second).getTime();
}

function calendarDays(month: Date): Array<Date | null> {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const days: Array<Date | null> = Array.from({ length: firstDay.getDay() }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    days.push(new Date(month.getFullYear(), month.getMonth(), day));
  }
  return days;
}

export default function CreateEmergencyRequestScreen() {
  const router = useRouter();
  const { state } = useAuth();
  const [patientName, setPatientName] = useState("");
  const [selectedBloodType, setSelectedBloodType] = useState("O+");
  const [selectedUrgency, setSelectedUrgency] = useState<UrgencyLevel>("critical");
  const [units, setUnits] = useState(1);
  const initialContactPhone = state.status === "signedIn" && state.role === "requestor" ? phoneInputDigits(state.profile.phone) : "";
  const [contactPhone, setContactPhone] = useState(initialContactPhone);
  const [focusedPhoneInput, setFocusedPhoneInput] = useState<"country" | "number" | null>(null);
  const [pulse] = useState(() => new Animated.Value(0));
  const [location, setLocation] = useState<Coordinates>(null);
  const [areaLabel, setAreaLabel] = useState("");
  const [hospitalName, setHospitalName] = useState("");
  const today = startOfDay(new Date());
  const initialDeadline = new Date(Date.now() + DEFAULT_HOURS_BY_URGENCY.critical * 3_600_000);
  const [requiredByDate, setRequiredByDate] = useState(startOfDay(initialDeadline));
  const [requiredByHour, setRequiredByHour] = useState(initialDeadline.getHours());
  const [requiredByMinute, setRequiredByMinute] = useState(Math.ceil(initialDeadline.getMinutes() / 5) * 5 % 60);
  const [calendarMonth, setCalendarMonth] = useState(today);
  const [isCalendarVisible, setIsCalendarVisible] = useState(false);
  const [isTimeVisible, setIsTimeVisible] = useState(false);
  const [isLocationLoading, setIsLocationLoading] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Keyed by the backend's DTO field names, so the map holds both our own
  // checks and the 422s the server sends back — the same shape the signup
  // screens use.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function clearFieldError(field: string) {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setGeneralError(null);
  }

  const captureCurrentLocation = async () => {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        setLocationError("Location permission is needed to broadcast this request.");
        return;
      }

      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const resolvedAreaLabel = await reverseGeocodeAreaLabel(position.coords.latitude, position.coords.longitude);
      setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      // The geocoder returns "" when it fails, and the backend rejects a blank
      // area_label outright — so an empty result is left in the box for the
      // poster to fill in rather than quietly submitted.
      if (resolvedAreaLabel) setAreaLabel(resolvedAreaLabel);
    } catch {
      setLocationError("Could not capture your location. Please try again.");
    } finally {
      setIsLocationLoading(false);
    }
  };

  /** What would be sent if the button were pressed now. */
  function composePhone(): string {
    return composePakistaniPhone(contactPhone);
  }

  /** Local checks, so an obviously incomplete form costs no round trip. */
  function validate(): Record<string, string> {
    const errors: Record<string, string> = {};

    if (!patientName.trim()) errors.patient_name = "Enter the patient's name.";
    if (!areaLabel.trim()) {
      errors.area_label = "Add an area label so donors know where to go.";
    }

    const phone = composePhone();
    if (!isValidPakistaniPhone(phone)) errors.contact_phone = "Enter 10 digits starting with 3.";

    return errors;
  }

  async function handleBroadcastRequest() {
    const errors = validate();
    setFieldErrors(errors);
    setGeneralError(null);

    if (Object.keys(errors).length) return;
    // The button is disabled without a location, so this is a guard rather
    // than a state the poster can reach.
    if (!location) return;

    setIsSubmitting(true);

    try {
      const trimmedHospital = hospitalName.trim();

      await createBloodRequest({
        patient_name: patientName.trim(),
        blood_type_needed: selectedBloodType,
        units_needed: units,
        urgency_level: selectedUrgency,
        // Built here, not at render: a form left open for an hour would
        // otherwise submit a deadline that has already passed.
        required_by: requiredByPreviewDate.toISOString(),
        // Null rather than "": hospital_name is `Name | None`, and Name strips
        // then rejects a blank string. Sending "" would 422 instead of posting
        // an unverified request.
        hospital_name: trimmedHospital ? trimmedHospital : null,
        contact_phone: composePhone(),
        latitude: location.latitude,
        longitude: location.longitude,
        area_label: areaLabel.trim(),
      });

      // dismissTo rather than replace: this screen is pushed from the requestor
      // home, so this returns to the screen already underneath — and its focus
      // refetch is what puts the new request on it. A deep link with no home
      // beneath falls back to replacing this screen with it.
      router.dismissTo("/requestor-home");
    } catch (error) {
      const perField = fieldErrorsFrom(error);
      if (Object.keys(perField).length) {
        setFieldErrors(perField);
      } else {
        // Non-field failures: a 401, offline, or a 400 with a plain detail.
        setGeneralError(
          error instanceof ApiError
            ? error.detail
            : "Could not broadcast this request. Please try again.",
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const locationMeta = isLocationLoading
    ? "Locating your current position..."
    : location
      ? `GPS signal locked · ${formatCoordinate(location.latitude, "N", "S")}, ${formatCoordinate(location.longitude, "E", "W")}`
      : locationError ?? "Location unavailable";

  const requiredByPreviewDate = new Date(requiredByDate);
  requiredByPreviewDate.setHours(requiredByHour, requiredByMinute, 0, 0);
  const requiredByPreview = formatAbsoluteTime(requiredByPreviewDate.toISOString());
  const calendarCells = calendarDays(calendarMonth);
  const maximumDate = new Date(today.getTime() + 30 * DAY_MS);
  const monthLabel = calendarMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const displayHour = requiredByHour % 12 || 12;
  const displayMeridiem = requiredByHour >= 12 ? "PM" : "AM";

  useEffect(() => {
    const captureTask = setTimeout(() => {
      void captureCurrentLocation();
    }, 0);
    return () => clearTimeout(captureTask);
  }, []);

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

  const canSubmit = Boolean(location) && !isLocationLoading && !isSubmitting;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Go back" onPress={() => router.back()} style={styles.backButton}>
            <MaterialIcons name="chevron-left" size={24} color={colors.text} />
          </Pressable>

          <View style={styles.titleWrap}>
            <View style={styles.titleDotWrap}>
              <Animated.View
                style={[
                  styles.titleDot,
                  {
                    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
                    transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }],
                  },
                ]}
              />
              <View style={styles.titleDotCore} />
            </View>
            <Text style={styles.title}>Create Emergency Request</Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.form}>
            <View style={styles.infoBanner}>
              <View style={styles.infoIconWrap}>
                <MaterialIcons name="notifications-active" size={20} color={colors.crimson} />
              </View>
              <Text style={styles.infoText}>Every second counts. Fill in the core details below to instantly dispatch notifications to nearby verified donors.</Text>
            </View>

            <View style={styles.fieldCard}>
              <Text style={styles.label}>Patient Name</Text>
              <View style={[styles.inputShell, fieldErrors.patient_name ? styles.inputShellError : null]}>
                <TextInput
                  accessibilityLabel="Patient name"
                  autoCapitalize="words"
                  maxLength={MAX_NAME_LENGTH}
                  onChangeText={(value) => { setPatientName(value); clearFieldError("patient_name"); }}
                  placeholder="e.g. Zainab Bibi"
                  placeholderTextColor="#94a3b8"
                  style={styles.input}
                  value={patientName}
                />
                <MaterialIcons name="person" size={21} color="#94a3b8" />
              </View>
              {fieldErrors.patient_name ? (
                <Text accessibilityRole="alert" style={styles.fieldError}>{fieldErrors.patient_name}</Text>
              ) : null}
            </View>

            <View style={styles.fieldCard}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.label}>Blood Type Needed</Text>
                <Text style={styles.sectionHint}>Select one</Text>
              </View>
              <View style={styles.bloodGrid}>
                {bloodTypes.map((type) => {
                  const selected = selectedBloodType === type;
                  return (
                    <Pressable
                      key={type}
                      onPress={() => setSelectedBloodType(type)}
                      style={[styles.bloodOption, selected && styles.bloodOptionSelected]}
                    >
                      <Text style={[styles.bloodOptionText, selected && styles.bloodOptionTextSelected]}>{type}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.fieldCard}>
              <Text style={styles.label}>Units Needed</Text>
              <View style={styles.stepperWrap}>
                <Pressable onPress={() => setUnits((current) => Math.max(1, current - 1))} style={styles.stepButton}>
                  <MaterialIcons name="remove" size={22} color={colors.text} />
                </Pressable>
                <Text style={styles.unitText}>{units === 1 ? "1 Unit" : `${units} Units`}</Text>
                <Pressable onPress={() => setUnits((current) => Math.min(20, current + 1))} style={[styles.stepButton, styles.stepButtonPrimary]}>
                  <MaterialIcons name="add" size={22} color={colors.surface} />
                </Pressable>
              </View>
            </View>

            <View style={styles.fieldCard}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.label}>Urgency Level</Text>
                <Text style={styles.priorityLabel}>Priority dispatch</Text>
              </View>

              <View style={styles.urgencyGrid}>
                {urgencyOptions.map((option) => {
                  const isSelected = selectedUrgency === option.key;
                  const selectedStyle = isSelected
                    ? {
                        borderColor: option.color,
                        backgroundColor: option.selectedTint,
                        shadowColor: option.color,
                        shadowOpacity: 0.12,
                        shadowRadius: 6,
                        shadowOffset: { width: 0, height: 2 },
                      }
                    : { borderColor: "#e2e8f0", backgroundColor: "#f8fafc" };

                  return (
                    <Pressable
                      key={option.key}
                      onPress={() => {
                        setSelectedUrgency(option.key);
                      }}
                      style={[styles.urgencyOption, selectedStyle]}
                    >
                      <View style={styles.urgencyHeader}>
                        <View style={[styles.urgencyDot, { backgroundColor: option.color }]} />
                        <View style={[styles.urgencyCheck, isSelected && { backgroundColor: option.color, borderWidth: 0 }]}>
                          {isSelected ? <MaterialIcons name="check" size={12} color={colors.surface} /> : null}
                        </View>
                      </View>
                      <Text style={[styles.urgencyText, isSelected && { color: option.textColor, fontWeight: "700" }]}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.helpText}>Search radius: Critical 25 km · Urgent 15 km · Routine 8 km</Text>
            </View>

            <View style={styles.fieldCard}>
              <Text style={styles.label}>Emergency Location</Text>
              <Text style={styles.subLabel}>Broadcasts to donors near this location</Text>

              <View style={styles.locationBlock}>
                <View style={styles.locationRow}>
                  <View style={styles.locationLeft}>
                    <View style={styles.locationIconWrap}>
                      <MaterialIcons name="my-location" size={18} color="#0f766e" />
                    </View>
                    <View style={styles.locationTextWrap}>
                      <Text style={styles.locationTitle}>{isLocationLoading ? "Locating Current Position" : location ? "Current Device Location" : "Location Unavailable"}</Text>
                      <Text style={styles.locationMeta}>{locationMeta}</Text>
                    </View>
                  </View>

                  <View style={[styles.locationCheckWrap, !location && styles.locationCheckWrapPending]}>
                    <MaterialIcons name={location ? "check" : isLocationLoading ? "sync" : "warning"} size={16} color={colors.surface} />
                  </View>
                </View>
              </View>

              {!location && !isLocationLoading ? (
                <Pressable accessibilityRole="button" onPress={() => { setIsLocationLoading(true); setLocationError(null); void captureCurrentLocation(); }} style={styles.retryLocation}>
                  <MaterialIcons name="refresh" size={16} color={colors.crimson} />
                  <Text style={styles.retryLocationText}>Retry location capture</Text>
                </Pressable>
              ) : null}

              <Text style={styles.label}>Area / Neighborhood Label</Text>
              <View style={[styles.inputShell, fieldErrors.area_label ? styles.inputShellError : null]}>
                <TextInput
                  accessibilityLabel="Area or neighborhood label"
                  autoCapitalize="words"
                  maxLength={MAX_NAME_LENGTH}
                  onChangeText={(value) => { setAreaLabel(value); clearFieldError("area_label"); }}
                  placeholder="e.g. Johar Town, Lahore"
                  placeholderTextColor="#94a3b8"
                  style={styles.input}
                  value={areaLabel}
                />
                <MaterialIcons name="location-city" size={21} color="#94a3b8" />
              </View>
              {fieldErrors.area_label ? (
                <Text accessibilityRole="alert" style={styles.fieldError}>{fieldErrors.area_label}</Text>
              ) : null}
            </View>

            <View style={styles.fieldCard}>
              <Text style={styles.label}>Hospital Name (Optional)</Text>
              <View style={[styles.inputShell, fieldErrors.hospital_name ? styles.inputShellError : null]}>
                <TextInput
                  accessibilityLabel="Hospital name"
                  autoCapitalize="words"
                  maxLength={MAX_NAME_LENGTH}
                  onChangeText={(value) => { setHospitalName(value); clearFieldError("hospital_name"); }}
                  placeholder="Search hospital or clinic..."
                  placeholderTextColor="#64748b"
                  style={styles.input}
                  value={hospitalName}
                />
                <MaterialIcons name="local-hospital" size={21} color="#94a3b8" />
              </View>
              {fieldErrors.hospital_name ? (
                <Text accessibilityRole="alert" style={styles.fieldError}>{fieldErrors.hospital_name}</Text>
              ) : null}
              <Text style={styles.subtleText}>Leave blank if not hospital-affiliated — your request will still go out immediately.</Text>
            </View>

            <View style={styles.fieldCard}>
              <Text style={styles.label}>Contact Phone</Text>
              <View style={styles.phoneFields}>
                <TextInput
                  accessibilityLabel="Contact country code"
                  keyboardType="phone-pad"
                  onBlur={() => setFocusedPhoneInput(null)}
                  editable={false}
                  onFocus={() => setFocusedPhoneInput("country")}
                  style={[styles.countryCode, focusedPhoneInput === "country" && styles.inputFocused]}
                  value={PAKISTAN_COUNTRY_CODE}
                />
                <TextInput
                  accessibilityLabel="Contact phone number"
                  keyboardType="phone-pad"
                  onBlur={() => setFocusedPhoneInput(null)}
                  maxLength={10}
                  onChangeText={(value) => { setContactPhone(phoneInputDigits(value)); clearFieldError("contact_phone"); }}
                  onFocus={() => setFocusedPhoneInput("number")}
                  returnKeyType="done"
                  style={[styles.numberInput, focusedPhoneInput === "number" && styles.inputFocused, fieldErrors.contact_phone ? styles.inputShellError : null]}
                  value={contactPhone}
                />
              </View>
              {fieldErrors.contact_phone ? (
                <Text accessibilityRole="alert" style={styles.fieldError}>{fieldErrors.contact_phone}</Text>
              ) : null}
              <Text style={styles.subtleText}>This is the number donors will see once they accept — you can use a different contact if needed.</Text>
            </View>

            <View style={styles.fieldCard}>
              <Text style={styles.label}>Required By</Text>
              <View style={styles.requiredByControls}>
                <Pressable accessibilityRole="button" onPress={() => setIsCalendarVisible(true)} style={styles.requiredByButton}>
                  <MaterialIcons name="calendar-today" size={18} color={colors.crimson} />
                  <View style={styles.requiredByButtonCopy}>
                    <Text style={styles.requiredByButtonLabel}>DATE</Text>
                    <Text style={styles.requiredByButtonValue}>{requiredByDate.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</Text>
                  </View>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => setIsTimeVisible(true)} style={styles.requiredByButton}>
                  <MaterialIcons name="schedule" size={18} color={colors.crimson} />
                  <View style={styles.requiredByButtonCopy}>
                    <Text style={styles.requiredByButtonLabel}>TIME</Text>
                    <Text style={styles.requiredByButtonValue}>{displayHour}:{String(requiredByMinute).padStart(2, "0")} {displayMeridiem}</Text>
                  </View>
                </Pressable>
              </View>
              <View style={styles.requiredByPreview}><MaterialIcons name="event" size={16} color={colors.mutedText} /><Text style={styles.requiredByPreviewText}>{requiredByPreview}</Text></View>
            </View>

            <View style={styles.ctaWrap}>
              {generalError ? (
                <Text accessibilityRole="alert" style={styles.generalError}>{generalError}</Text>
              ) : null}

              <Pressable disabled={!canSubmit} onPress={handleBroadcastRequest} style={({ pressed }) => [styles.cta, !canSubmit && styles.ctaDisabled, pressed && styles.ctaPressed]}>
                {isSubmitting ? (
                  <ActivityIndicator color={colors.surface} />
                ) : (
                  <>
                    <View style={styles.ctaIconWrap}>
                      <MaterialIcons name="podcasts" size={18} color={colors.surface} />
                    </View>
                    <Text style={styles.ctaText}>Broadcast Emergency Request</Text>
                  </>
                )}
              </Pressable>

              <View style={styles.trustRow}>
                <MaterialIcons name="verified-user" size={15} color="#16a34a" />
                <Text style={styles.trustText}>This will instantly alert compatible donors nearby.</Text>
              </View>
            </View>
          </View>
        </ScrollView>
        <Modal visible={isCalendarVisible} transparent animationType="slide" onRequestClose={() => setIsCalendarVisible(false)}>
          <View style={styles.pickerBackdrop}>
            <Pressable onPress={() => setIsCalendarVisible(false)} style={styles.pickerDismissArea} />
            <View style={styles.pickerSheet}>
              <View style={styles.pickerHandle} />
              <View style={styles.pickerTitleRow}><Text style={styles.pickerTitle}>Choose Date</Text><Pressable onPress={() => setIsCalendarVisible(false)}><MaterialIcons name="close" size={20} color={colors.mutedText} /></Pressable></View>
              <View style={styles.calendarHeader}>
                <Pressable accessibilityLabel="Previous month" disabled={calendarMonth.getFullYear() === today.getFullYear() && calendarMonth.getMonth() === today.getMonth()} onPress={() => setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} style={styles.calendarNavButton}><MaterialIcons name="chevron-left" size={20} color={colors.text} /></Pressable>
                <Text style={styles.calendarMonth}>{monthLabel}</Text>
                <Pressable accessibilityLabel="Next month" disabled={calendarMonth.getFullYear() === maximumDate.getFullYear() && calendarMonth.getMonth() === maximumDate.getMonth()} onPress={() => setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} style={styles.calendarNavButton}><MaterialIcons name="chevron-right" size={20} color={colors.text} /></Pressable>
              </View>
              <View style={styles.calendarWeekRow}>{["S", "M", "T", "W", "T", "F", "S"].map((day, index) => <Text key={`${day}-${index}`} style={styles.calendarWeekDay}>{day}</Text>)}</View>
              <View style={styles.calendarGrid}>{calendarCells.map((day, index) => {
                if (!day) return <View key={`empty-${index}`} style={styles.calendarDay} />;
                const disabled = day < today || day > maximumDate;
                const selected = sameDay(day, requiredByDate);
                return <Pressable key={day.toISOString()} accessibilityLabel={`Choose ${day.toDateString()}`} disabled={disabled} onPress={() => { setRequiredByDate(day); setIsCalendarVisible(false); }} style={[styles.calendarDay, selected && styles.calendarDaySelected, disabled && styles.calendarDayDisabled]}><Text style={[styles.calendarDayText, selected && styles.calendarDayTextSelected, disabled && styles.calendarDayTextDisabled]}>{day.getDate()}</Text></Pressable>;
              })}</View>
              <Text style={styles.calendarHint}>Choose the date donors should arrive.</Text>
            </View>
          </View>
        </Modal>
        <Modal visible={isTimeVisible} transparent animationType="slide" onRequestClose={() => setIsTimeVisible(false)}>
          <View style={styles.pickerBackdrop}>
            <Pressable onPress={() => setIsTimeVisible(false)} style={styles.pickerDismissArea} />
            <View style={styles.pickerSheet}>
              <View style={styles.pickerHandle} />
              <View style={styles.pickerTitleRow}><Text style={styles.pickerTitle}>Choose Time</Text><Pressable onPress={() => setIsTimeVisible(false)}><MaterialIcons name="close" size={20} color={colors.mutedText} /></Pressable></View>
              <Text style={styles.timeHint}>Set the exact time donors are needed.</Text>
              <View style={styles.timePickerRow}>
                <View style={styles.timeStepper}><Pressable onPress={() => setRequiredByHour((hour) => (hour + 23) % 24)} style={styles.stepperButton}><MaterialIcons name="remove" size={20} color={colors.text} /></Pressable><Text style={styles.timeValue}>{displayHour}</Text><Pressable onPress={() => setRequiredByHour((hour) => (hour + 1) % 24)} style={styles.stepperButton}><MaterialIcons name="add" size={20} color={colors.text} /></Pressable></View>
                <Text style={styles.timeSeparator}>:</Text>
                <View style={styles.timeStepper}><Pressable onPress={() => setRequiredByMinute((minute) => (minute + 55) % 60)} style={styles.stepperButton}><MaterialIcons name="remove" size={20} color={colors.text} /></Pressable><Text style={styles.timeValue}>{String(requiredByMinute).padStart(2, "0")}</Text><Pressable onPress={() => setRequiredByMinute((minute) => (minute + 5) % 60)} style={styles.stepperButton}><MaterialIcons name="add" size={20} color={colors.text} /></Pressable></View>
                <View style={styles.meridiemColumn}><Pressable onPress={() => setRequiredByHour((hour) => hour >= 12 ? hour - 12 : hour)} style={[styles.meridiemButton, requiredByHour < 12 && styles.meridiemSelected]}><Text style={styles.meridiemText}>AM</Text></Pressable><Pressable onPress={() => setRequiredByHour((hour) => hour < 12 ? hour + 12 : hour)} style={[styles.meridiemButton, requiredByHour >= 12 && styles.meridiemSelected]}><Text style={styles.meridiemText}>PM</Text></Pressable></View>
              </View>
              <Pressable onPress={() => setIsTimeVisible(false)} style={styles.pickerDoneButton}><Text style={styles.pickerDoneText}>Done</Text></Pressable>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}
