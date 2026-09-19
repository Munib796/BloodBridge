import { FontAwesome5, MaterialIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import ChangePasswordModal from "./ChangePasswordModal";
import { ApiError } from "../lib/apiClient";
import { describeWriteError } from "../lib/errors";
import { sendPasswordResetLink, type EditableRole } from "../lib/profile";
import { resendErrorMessage, resendVerificationEmail } from "../lib/verification";
import { loginStyles as styles } from "../styles/loginStyles";
import { useAuth, type UserRole } from "../context/AuthContext";
import BrandLogo from "./BrandLogo";

const googleLogo = require("../../assets/images/google-g.svg");

/**
 * Where "Sign Up" goes, per selected role.
 *
 * Only donors and requestors have a signup screen. `POST /hospitals/signup` and
 * `POST /organizations/signup` do exist on the backend — so this is an
 * app-side gap, not a missing capability — but neither has a form here yet, and
 * a route that doesn't exist is not something to navigate to.
 */
const SIGNUP_ROUTES: Partial<Record<UserRole, "/donor-signup" | "/requestor-signup">> = {
  donor: "/donor-signup",
  requestor: "/requestor-signup",
};

export default function LoginScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [accountGroup, setAccountGroup] = useState<"individual" | "facility">("individual");
  const [accountRole, setAccountRole] = useState<"donor" | "requestor" | "hospital" | "organization">("donor");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Only donors and requestors verify by email — hospitals and organizations
  // wait on admin approval instead — so the resend action is hidden for those
  // two roles rather than offered and then 404ing.
  const canResendVerification = accountRole === "donor" || accountRole === "requestor";
  const [isResending, setIsResending] = useState(false);
  const [resendNote, setResendNote] = useState<string | null>(null);
  const [resendFailed, setResendFailed] = useState(false);

  // Password reset by email is narrower still: it exists only for donors and
  // requestors (POST /{role}/forgot-password). A facility account has no
  // equivalent at all, so the link stays visible but inert and says why —
  // hiding it would leave someone who forgot their password with no
  // explanation for why the option they expect isn't there.
  const canResetPassword = accountRole === "donor" || accountRole === "requestor";
  // Null for the facility roles — see SIGNUP_ROUTES.
  const signupRoute = SIGNUP_ROUTES[accountRole];
  const [isResetVisible, setIsResetVisible] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const roleOptions = accountGroup === "individual"
    ? [
        { role: "donor" as const, label: "Donor", description: "Respond to blood requests" },
        { role: "requestor" as const, label: "Requestor", description: "Create and manage requests" },
      ]
    : [
        { role: "hospital" as const, label: "Hospital", description: "Manage hospital requests" },
        { role: "organization" as const, label: "Organization", description: "Manage organization requests" },
      ];

  function handleGroupChange(nextGroup: "individual" | "facility") {
    setAccountGroup(nextGroup);
    setAccountRole(nextGroup === "individual" ? "donor" : "hospital");
    setErrorMessage(null);
    setResendNote(null);
  }

  async function handleResendVerification() {
    if (isResending) return;
    // The button is hidden for the other roles; this keeps the narrowing
    // honest for the type checker as well as for the runtime.
    if (accountRole !== "donor" && accountRole !== "requestor") return;

    if (!email.trim()) {
      setResendFailed(true);
      setResendNote("Enter your email address above first.");
      return;
    }

    setIsResending(true);
    setResendNote(null);

    try {
      await resendVerificationEmail(accountRole, email.trim());
      setResendFailed(false);
      setResendNote("Verification email sent — check your inbox.");
    } catch (error) {
      setResendFailed(true);
      setResendNote(resendErrorMessage(error));
    } finally {
      setIsResending(false);
    }
  }

  /**
   * Go to the signup screen for the role currently selected above.
   *
   * `push`, not `replace`: someone who taps Sign Up by mistake should be able
   * to come back to the credentials they had already typed.
   */
  function handleSignUp() {
    if (!signupRoute) return;
    router.push(signupRoute);
  }

  /**
   * Open the reset-link sheet.
   *
   * The address is the one typed above rather than a stored one — nobody is
   * signed in on this screen — so an empty field is a prompt rather than a
   * sheet with nothing to send to.
   */
  function handleForgotPassword() {
    if (!canResetPassword) return;

    if (!email.trim()) {
      setErrorMessage("Enter your email address above, then tap Forgot Password.");
      return;
    }

    setErrorMessage(null);
    setResetError(null);
    setResetSent(false);
    setIsResetVisible(true);
  }

  async function handleSendResetLink() {
    // The narrow type is what keeps the facility roles unrepresentable here;
    // the guard is for the type checker as much as for the runtime.
    if (isSendingReset || !canResetPassword) return;

    setIsSendingReset(true);
    setResetError(null);

    try {
      await sendPasswordResetLink(accountRole as EditableRole, email.trim());
      setResetSent(true);
      // A reset revokes every token issued before it, so a half-remembered
      // password sitting in the field shouldn't be what a later retry uses.
      setPassword("");
    } catch (error) {
      setResetError(describeWriteError(error, "Could not send the reset link. Please try again."));
    } finally {
      setIsSendingReset(false);
    }
  }

  async function handleLogin() {
    if (!email.trim() || !password) {
      setErrorMessage("Enter your email and password to continue.");
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await signIn(accountRole as UserRole, email.trim(), password);
      router.replace(accountRole === "donor" ? "/home" : "/requestor-home");
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.detail : error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.screen}>
        <View style={styles.topBar}>
          <Pressable accessibilityLabel="Go back" onPress={() => router.back()} style={styles.backButton}>
            <MaterialIcons name="chevron-left" size={22} color="#475569" />
          </Pressable>
          <BrandLogo />
          <View style={styles.topBarSpacer} />
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headingBlock}>
            <Text style={styles.title}>Welcome Back</Text>
            <Text style={styles.subtitle}>Log in to continue saving lives</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.groupToggle}>
              <Pressable onPress={() => handleGroupChange("individual")} style={[styles.groupOption, accountGroup === "individual" && styles.groupOptionActive]}>
                <Text style={[styles.groupOptionText, accountGroup === "individual" && styles.groupOptionTextActive]}>Donor / Requestor</Text>
              </Pressable>
              <Pressable onPress={() => handleGroupChange("facility")} style={[styles.groupOption, accountGroup === "facility" && styles.groupOptionActive]}>
                <Text style={[styles.groupOptionText, accountGroup === "facility" && styles.groupOptionTextActive]}>Hospital / Organization</Text>
              </Pressable>
            </View>

            <View style={styles.roleSelector}>
              {roleOptions.map((option) => (
                <Pressable key={option.role} onPress={() => { setAccountRole(option.role); setErrorMessage(null); setResendNote(null); }} style={[styles.roleOption, accountRole === option.role && styles.roleOptionActive]}>
                  <Text style={[styles.roleLabel, accountRole === option.role && styles.roleLabelActive]}>{option.label}</Text>
                  <Text style={styles.roleDescription}>{option.description}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email</Text>
              <View style={styles.inputShell}>
                <MaterialIcons name="mail-outline" size={18} color="#94a3b8" />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  placeholder="name@example.com"
                  placeholderTextColor="#94a3b8"
                  style={styles.input}
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputShell}>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  autoCapitalize="none"
                  autoComplete="password"
                  placeholder="••••••••"
                  placeholderTextColor="#94a3b8"
                  secureTextEntry={!passwordVisible}
                  style={styles.passwordInput}
                />
                <Pressable accessibilityLabel="Toggle password visibility" onPress={() => setPasswordVisible((visible) => !visible)}>
                  <MaterialIcons name={passwordVisible ? "visibility-off" : "visibility"} size={18} color="#94a3b8" />
                </Pressable>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !canResetPassword }}
                disabled={!canResetPassword}
                onPress={handleForgotPassword}
                style={styles.forgotButton}
              >
                <Text style={[styles.forgotText, !canResetPassword && styles.forgotTextDisabled]}>Forgot Password?</Text>
              </Pressable>
              {/* Says why the link above does nothing, rather than leaving a
                  dead control with no explanation. */}
              {canResetPassword ? null : (
                <Text style={styles.forgotNote}>
                  Password reset by email isn&apos;t available for hospital or organization accounts — contact your administrator.
                </Text>
              )}
            </View>

            {errorMessage ? <Text accessibilityRole="alert" style={styles.errorText}>{errorMessage}</Text> : null}

            <Pressable disabled={isSubmitting} onPress={handleLogin} style={({ pressed }) => [styles.loginButton, pressed && styles.pressed, isSubmitting && styles.loginButtonDisabled]}>
              {isSubmitting ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.loginButtonText}>Log In</Text>}
            </Pressable>
          </View>

          <View style={styles.socialSection}>
            <View style={styles.dividerRow}>
              <View style={styles.divider} />
              <Text style={styles.orText}>OR</Text>
              <View style={styles.divider} />
            </View>
            <Pressable style={({ pressed }) => [styles.socialButton, pressed && styles.pressed]}>
              <Image source={googleLogo} contentFit="contain" style={styles.googleLogo} />
              <Text style={styles.googleText}>Continue with Google</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [styles.appleButton, pressed && styles.pressed]}>
              <FontAwesome5 name="apple" size={14} color="#ffffff" />
              <Text style={styles.appleText}>Continue with Apple</Text>
            </Pressable>
          </View>

          <View style={styles.signupPrompt}>
            <Text style={styles.signupText}>
              Don&apos;t have an account?{" "}
              {/* Shown inert rather than dropped for the facility roles. The
                  question at this spot is literally "how do I get an account?",
                  and removing the link answers it with silence. */}
              <Text
                accessibilityRole="link"
                onPress={signupRoute ? handleSignUp : undefined}
                style={[styles.signupLink, !signupRoute && styles.signupLinkDisabled]}
              >
                Sign Up
              </Text>
            </Text>
            {signupRoute ? null : (
              <Text style={styles.signupNote}>Facility sign-up isn&apos;t available in the app yet.</Text>
            )}
          </View>

          {/* Sits with the sign-up prompt rather than in the form: someone who
              lands here without a verified account has nothing else to do on
              this screen. Hidden for hospital/organization, which are gated by
              admin approval and have no email to resend. */}
          {canResendVerification ? (
            <View style={styles.resendPrompt}>
              <Pressable
                accessibilityRole="button"
                disabled={isResending}
                onPress={handleResendVerification}
                style={({ pressed }) => [styles.resendButton, pressed && styles.pressed]}
              >
                {isResending ? (
                  <ActivityIndicator color="#c8102e" />
                ) : (
                  <Text style={styles.resendText}>
                    Email not verified? Resend verification email
                  </Text>
                )}
              </Pressable>
              {resendNote ? (
                <Text
                  accessibilityRole="alert"
                  style={resendFailed ? styles.resendError : styles.resendNote}
                >
                  {resendNote}
                </Text>
              ) : null}
            </View>
          ) : null}
        </ScrollView>

        <ChangePasswordModal
          email={email.trim()}
          error={resetError}
          isSending={isSendingReset}
          isSent={resetSent}
          onClose={() => {
            setResetError(null);
            setResetSent(false);
            setIsResetVisible(false);
          }}
          onSendResetLink={handleSendResetLink}
          visible={isResetVisible}
        />
      </View>
    </SafeAreaView>
  );
}