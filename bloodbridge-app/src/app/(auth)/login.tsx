import { router } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { donorLogin, fetchDonorMe, fetchRequestorMe, requestorLogin } from "@/api/auth";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { useAuthStore } from "@/store/authStore";
import { colors } from "@/theme/colors";

type Role = "donor" | "requestor";

export default function LoginScreen() {
  const [role, setRole] = useState<Role>("donor");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const signIn = useAuthStore((s) => s.signIn);
  const setSelf = useAuthStore((s) => s.setSelf);

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert("Missing info", "Please enter both email and password.");
      return;
    }
    setLoading(true);
    try {
      if (role === "donor") {
        const token = await donorLogin(email.trim(), password);
        await signIn(token, "donor");
        const me = await fetchDonorMe();
        setSelf(me);
        router.replace("/(donor)/home");
      } else {
        const token = await requestorLogin(email.trim(), password);
        await signIn(token, "requestor");
        const me = await fetchRequestorMe();
        setSelf(me);
        router.replace("/(requestor)/home");
      }
    } catch (err) {
      Alert.alert("Couldn't log in", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <Text style={styles.title}>Welcome back</Text>

      <View style={styles.toggleRow}>
        <RoleTab label="I'm a donor" active={role === "donor"} onPress={() => setRole("donor")} />
        <RoleTab
          label="I need blood"
          active={role === "requestor"}
          onPress={() => setRole("requestor")}
        />
      </View>

      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="you@example.com"
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="••••••••"
      />

      <Button label="Log in" onPress={handleLogin} loading={loading} />
    </Screen>
  );
}

function RoleTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.tab, active && styles.tabActive]} onPress={onPress}>
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.text,
    marginTop: 12,
    marginBottom: 20,
  },
  toggleRow: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: 4,
    marginBottom: 24,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 9,
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textMuted,
  },
  tabLabelActive: {
    color: "#fff",
  },
});
