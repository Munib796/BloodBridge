import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { colors } from "@/theme/colors";

export default function WelcomeScreen() {
  return (
    <Screen>
      <View style={styles.brandBlock}>
        <Text style={styles.brandName}>BloodBridge</Text>
        <Text style={styles.tagline}>Connecting donors to patients, fast.</Text>
      </View>

      <View style={styles.spacer} />

      <Text style={styles.prompt}>What brings you here today?</Text>

      <View style={styles.choiceCard}>
        <Text style={styles.choiceTitle}>I need blood</Text>
        <Text style={styles.choiceSubtitle}>
          Post a request and reach nearby donors in minutes.
        </Text>
        <Button
          label="Request blood"
          variant="primary"
          onPress={() => router.push("/(auth)/signup-requestor")}
        />
      </View>

      <View style={styles.choiceCard}>
        <Text style={styles.choiceTitle}>I want to help</Text>
        <Text style={styles.choiceSubtitle}>
          Register as a donor and get notified when someone nearby needs your blood type.
        </Text>
        <Button
          label="Become a donor"
          variant="secondary"
          onPress={() => router.push("/(auth)/signup-donor")}
        />
      </View>

      <View style={styles.spacer} />

      <Text style={styles.loginLine}>
        Already have an account?{" "}
        <Text style={styles.loginLink} onPress={() => router.push("/(auth)/login")}>
          Log in
        </Text>
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brandBlock: {
    marginTop: 32,
    alignItems: "center",
  },
  brandName: {
    fontSize: 32,
    fontWeight: "800",
    color: colors.primary,
  },
  tagline: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 4,
  },
  spacer: {
    flex: 1,
    minHeight: 12,
  },
  prompt: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 16,
    textAlign: "center",
  },
  choiceCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: 18,
    marginBottom: 14,
    gap: 12,
  },
  choiceTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
  },
  choiceSubtitle: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
  },
  loginLine: {
    textAlign: "center",
    color: colors.textMuted,
    paddingVertical: 12
  },
  loginLink: {
    color: colors.primary,
    fontWeight: "700",
  },
});
