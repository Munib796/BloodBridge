import { router } from "expo-router";
import { useState } from "react";
import { Alert, StyleSheet, Text } from "react-native";

import { fetchRequestorMe, requestorLogin, requestorSignup } from "@/api/auth";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { useAuthStore } from "@/store/authStore";
import { colors } from "@/theme/colors";

export default function SignupRequestorScreen() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const signIn = useAuthStore((s) => s.signIn);
  const setSelf = useAuthStore((s) => s.setSelf);

  async function handleSignup() {
    if (!fullName || !email || !phone || !password) {
      Alert.alert("Missing info", "Please fill in every field.");
      return;
    }
    setLoading(true);
    try {
      await requestorSignup({ full_name: fullName, email: email.trim(), phone, password });
      const token = await requestorLogin(email.trim(), password);
      await signIn(token, "requestor");
      const me = await fetchRequestorMe();
      setSelf(me);
      router.replace("/(requestor)/home");
    } catch (err) {
      Alert.alert("Couldn't sign up", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <Text style={styles.title}>Create your account</Text>
      <Text style={styles.subtitle}>So you can post a request in the next step.</Text>

      <TextField label="Full name" value={fullName} onChangeText={setFullName} placeholder="Bilal Ahmed" />
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

      <Button label="Create account" onPress={handleSignup} loading={loading} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: "800", color: colors.text, marginTop: 12 },
  subtitle: { fontSize: 14, color: colors.textMuted, marginBottom: 20 },
});
