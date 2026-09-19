import { MaterialIcons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ApiError, api, fieldErrorsFrom } from "../lib/apiClient";
import { resendErrorMessage, resendVerificationEmail } from "../lib/verification";
import { donorSignupStyles as styles } from "../styles/donorSignupStyles";
import BrandLogo from "./BrandLogo";

const bloodTypes = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];
const COUNTRY_CODE = "+92";

/** Mirrors the backend's DonorSignup DTO — src/donors/dtos.py. */
type DonorSignupPayload = {
  full_name: string;
  email: string;
  phone: string;
  password: string;
  blood_type: string;
};

/**
 * The phone row shows a fixed +92 selector beside a national-number box, but
 * the backend wants a single string, so the two are joined here.
 */
function composePhone(national: string): string {
  const cleaned = national.replace(/[\s()\-.]/g, "");
  if (!cleaned) return "";
  // Already typed in full international form — leave it as it is.
  if (cleaned.startsWith("+")) return cleaned;
  // Local convention writes a leading zero (0300 1234567); the +92 form drops
  // it, and without this "03001234567" would become "+9203001234567".
  const withoutTrunkZero = cleaned.startsWith("0") ? cleaned.slice(1) : cleaned;
  return `${COUNTRY_CODE}${withoutTrunkZero}`;
}

type FormFieldProps = {
  icon: "person-outline" | "mail-outline";
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: "default" | "email-address";
  autoCapitalize?: "none" | "words";
  error?: string;
};

function FormField({
  icon,
  label,
  placeholder,
  value,
  onChangeText,
  keyboardType = "default",
  autoCapitalize = "none",
  error,
}: FormFieldProps) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputShell, error ? styles.inputShellError : null]}>
        <MaterialIcons name={icon} size={17} color="#94a3b8" />
        <TextInput
          autoCapitalize={autoCapitalize}
          keyboardType={keyboardType}
          placeholder={placeholder}
          placeholderTextColor="#94a3b8"
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
        />
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={styles.fieldError}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function PasswordField({
  value,
  onChangeText,
  error,
}: {
  value: string;
  onChangeText: (value: string) => void;
  error?: string;
}) {
  const [visible, setVisible] = useState(false);
  const score = !value ? 0 : (value.length >= 6 ? 1 : 0) + (value.length >= 8 && /[A-Z]/.test(value) ? 1 : 0) + (value.length >= 10 && /[0-9]/.test(value) ? 1 : 0) + (/[^A-Za-z0-9]/.test(value) ? 1 : 0);
  const strength = score === 1 ? "Weak" : score === 2 ? "Fair" : score === 3 ? "Good" : score >= 4 ? "Strong" : "Password strength";
  const strengthColor = score === 1 ? "#f43f5e" : score === 2 ? "#f59e0b" : score >= 3 ? "#059669" : "#94a3b8";

  return (
    <View style={styles.passwordGroup}>
      <Text style={styles.label}>Password</Text>
      <View style={[styles.inputShell, error ? styles.inputShellError : null]}>
        <MaterialIcons name="lock-outline" size={17} color="#94a3b8" />
        <TextInput onChangeText={onChangeText} placeholder="Create a strong password" placeholderTextColor="#94a3b8" secureTextEntry={!visible} style={styles.input} value={value} />
        <Pressable accessibilityLabel="Toggle password visibility" onPress={() => setVisible((current) => !current)}>
          <MaterialIcons name={visible ? "visibility-off" : "visibility"} size={17} color="#94a3b8" />
        </Pressable>
      </View>
      <View style={styles.strengthTrack}>
        {Array.from({ length: 4 }).map((_, index) => <View key={index} style={[styles.strengthSegment, index < score && { backgroundColor: strengthColor }]} />)}
      </View>
      <View style={styles.strengthMeta}>
        <Text style={[styles.strengthText, { color: strengthColor }]}>{strength}</Text>
        {/* The backend also requires a letter and a digit, so saying only
            "at least 8 characters" let people pick a password it rejects. */}
        <Text style={styles.requirementText}>8+ characters, with a letter and a number</Text>
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={styles.fieldError}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export default function DonorSignupScreen() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [selectedBloodType, setSelectedBloodType] = useState<string | null>(null);

  // Keyed by the backend's DTO field names, so the same map holds both our own
  // checks and the 422s the server sends back.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Set once the account exists — swaps the form for the confirmation card.
  const [createdEmail, setCreatedEmail] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [resendNote, setResendNote] = useState<string | null>(null);
  const [resendFailed, setResendFailed] = useState(false);

  function clearFieldError(field: string) {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setGeneralError(null);
  }

  /** Local checks, so an obviously empty form costs no round trip. */
  function validate(): Record<string, string> {
    const errors: Record<string, string> = {};
    if (!fullName.trim()) errors.full_name = "Enter your full name.";
    if (!email.trim()) errors.email = "Enter your email address.";
    if (!phone.trim()) errors.phone = "Enter your phone number.";
    if (!password) errors.password = "Choose a password.";
    if (!selectedBloodType) errors.blood_type = "Select your blood type.";
    return errors;
  }

  async function handleCreateAccount() {
    const errors = validate();
    setFieldErrors(errors);
    setGeneralError(null);

    if (Object.keys(errors).length) return;

    setIsSubmitting(true);
    try {
      const payload: DonorSignupPayload = {
        full_name: fullName.trim(),
        email: email.trim(),
        phone: composePhone(phone),
        password,
        blood_type: selectedBloodType as string,
      };

      // Unauthenticated on purpose: this is what creates the account.
      await api.post("/donors/signup", payload, { auth: false });

      // Signing up creates the account, it does not sign anyone in — the
      // response carries no token. So this goes to the confirmation card
      // rather than into the app, and the user verifies before logging in.
      setCreatedEmail(email.trim());
    } catch (error) {
      const perField = fieldErrorsFrom(error);
      if (Object.keys(perField).length) {
        setFieldErrors(perField);
      } else {
        // Non-field failures (400 "Email already registered", 429, offline).
        setGeneralError(
          error instanceof ApiError
            ? error.detail
            : "Could not create your account. Please try again.",
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResend() {
    if (!createdEmail || isResending) return;

    setIsResending(true);
    setResendNote(null);

    try {
      await resendVerificationEmail("donor", createdEmail);
      setResendFailed(false);
      setResendNote("Verification email sent — check your inbox.");
    } catch (error) {
      setResendFailed(true);
      setResendNote(resendErrorMessage(error));
    } finally {
      setIsResending(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.screen} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable accessibilityLabel="Go back" onPress={() => router.back()} style={styles.backButton}>
            <MaterialIcons name="chevron-left" size={22} color="#334155" />
          </Pressable>
          <BrandLogo />
          <View style={styles.topBarSpacer} />
        </View>

        {createdEmail ? (
          <>
            <View style={styles.headingBlock}>
              <Text style={styles.title}>Check Your Inbox</Text>
              <Text style={styles.subtitle}>One more step before you can log in.</Text>
            </View>

            <View style={styles.form}>
              <View style={styles.successCard}>
                <View style={styles.successHeading}>
                  <MaterialIcons name="mark-email-read" size={20} color="#047857" />
                  <Text style={styles.successTitle}>Account created</Text>
                </View>
                <Text style={styles.successBody}>
                  We sent a verification link to{" "}
                  <Text style={styles.successEmail}>{createdEmail}</Text>. Open it
                  to activate your account, then log in.
                </Text>
                {resendNote ? (
                  <Text
                    accessibilityRole="alert"
                    style={resendFailed ? styles.fieldError : styles.resendNote}
                  >
                    {resendNote}
                  </Text>
                ) : null}
              </View>

              <Pressable
                onPress={() => router.replace("/login")}
                style={({ pressed }) => [styles.createButton, pressed && styles.pressed]}
              >
                <Text style={styles.createButtonText}>Back to Log In</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={isResending}
                onPress={handleResend}
                style={styles.resendLink}
              >
                {isResending ? (
                  <ActivityIndicator color="#c8102e" />
                ) : (
                  <Text style={styles.resendLinkText}>
                    Didn&apos;t get the email? Resend verification email
                  </Text>
                )}
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <View style={styles.headingBlock}>
              <Text style={styles.title}>Become a Lifesaver</Text>
              <Text style={styles.subtitle}>Your blood type could be exactly what someone needs.</Text>
            </View>

            <View style={styles.form}>
              <FormField
                icon="person-outline"
                label="Full Name"
                placeholder="Ahmed Ali"
                autoCapitalize="words"
                value={fullName}
                onChangeText={(value) => { setFullName(value); clearFieldError("full_name"); }}
                error={fieldErrors.full_name}
              />
              <FormField
                icon="mail-outline"
                label="Email"
                placeholder="name@example.com"
                keyboardType="email-address"
                value={email}
                onChangeText={(value) => { setEmail(value); clearFieldError("email"); }}
                error={fieldErrors.email}
              />
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Phone Number</Text>
                <View style={styles.phoneRow}>
                  <View style={styles.countrySelector}><Text style={styles.flag}>🇵🇰</Text><Text style={styles.countryCode}>+92</Text></View>
                  <TextInput
                    keyboardType="phone-pad"
                    onChangeText={(value) => { setPhone(value); clearFieldError("phone"); }}
                    placeholder="300 1234567"
                    placeholderTextColor="#94a3b8"
                    style={[styles.phoneInput, fieldErrors.phone ? styles.inputShellError : null]}
                    value={phone}
                  />
                </View>
                {fieldErrors.phone ? (
                  <Text accessibilityRole="alert" style={styles.fieldError}>{fieldErrors.phone}</Text>
                ) : null}
              </View>
              <View style={styles.bloodGroup}>
                <View style={styles.bloodHeading}><Text style={styles.label}>Blood Type</Text><Text style={styles.selectHint}>Select one</Text></View>
                <View style={styles.bloodGrid}>
                  {bloodTypes.map((type) => {
                    const selected = selectedBloodType === type;
                    return <Pressable key={type} onPress={() => { setSelectedBloodType(type); clearFieldError("blood_type"); }} style={[styles.bloodButton, selected && styles.bloodButtonSelected]}><Text style={[styles.bloodButtonText, selected && styles.bloodButtonTextSelected]}>{type}</Text></Pressable>;
                  })}
                </View>
                {fieldErrors.blood_type ? (
                  <Text accessibilityRole="alert" style={styles.fieldError}>{fieldErrors.blood_type}</Text>
                ) : null}
              </View>
              <PasswordField
                value={password}
                onChangeText={(value) => { setPassword(value); clearFieldError("password"); }}
                error={fieldErrors.password}
              />

              {generalError ? (
                <Text accessibilityRole="alert" style={styles.errorText}>{generalError}</Text>
              ) : null}
            </View>

            <View style={styles.bottomActions}>
              <Pressable
                disabled={isSubmitting}
                onPress={handleCreateAccount}
                style={({ pressed }) => [styles.createButton, pressed && styles.pressed, isSubmitting && styles.buttonDisabled]}
              >
                {isSubmitting ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.createButtonText}>Create Donor Account</Text>}
              </Pressable>
              <Text style={styles.legalText}>By signing up you agree to our <Text style={styles.legalLink}>Terms</Text> &amp; <Text style={styles.legalLink}>Privacy Policy</Text></Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
