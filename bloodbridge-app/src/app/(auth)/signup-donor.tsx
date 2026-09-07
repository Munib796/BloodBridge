import { router } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { donorLogin, donorSignup, fetchDonorMe } from "@/api/auth";
import type { BloodType } from "@/api/types";
import { BLOOD_TYPES } from "@/api/types";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { useAuthStore } from "@/store/authStore";
import { colors } from "@/theme/colors";

export default function SignupDonorScreen() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [bloodType, setBloodType] = useState<BloodType | null>(null);
  const [loading, setLoading] = useState(false);

  const signIn = useAuthStore((s) => s.signIn);
  const setSelf = useAuthStore((s) => s.setSelf);

  async function handleSignup() {
    if (!fullName || !email || !phone || !password || !bloodType) {
      Alert.alert("Missing info", "Please fill in every field and pick your blood type.");
      return;
    }
    setLoading(true);
    try {
      await donorSignup({ full_name: fullName, email: email.trim(), phone, password, blood_type: bloodType });
      // Signup doesn't return a token, so log in right after to get one.
      const token = await donorLogin(email.trim(), password);
      await signIn(token, "donor");
      const me = await fetchDonorMe();
      setSelf(me);
      router.replace("/(donor)/home");
    } catch (err) {
      Alert.alert("Couldn't sign up", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <Text style={styles.title}>Become a donor</Text>
      <Text style={styles.subtitle}>Takes less than a minute.</Text>

      <TextField label="Full name" value={fullName} onChangeText={setFullName} placeholder="Ayesha Khan" />
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="you@example.com"
      />
      <TextField label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="03xxxxxxxxx" />
      <TextField label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="At least 8 characters" />

      <Text style={styles.label}>Blood type</Text>
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

      <Button label="Create account" onPress={handleSignup} loading={loading} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: "800", color: colors.text, marginTop: 12 },
  subtitle: { fontSize: 14, color: colors.textMuted, marginBottom: 20 },
  label: { fontSize: 14, fontWeight: "600", color: colors.text, marginBottom: 8 },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 24,
  },
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
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: { fontSize: 16, fontWeight: "800", color: colors.text },
  chipTextActive: { color: "#fff" },
});
