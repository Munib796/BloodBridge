import { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors } from "@/theme/colors";

interface ScreenProps {
  children: ReactNode;
  padded?: boolean;
}

// Every screen sits inside this so we get consistent background, safe-area
// insets (notches / home indicators), and a keyboard-avoiding wrapper for
// forms — without repeating that boilerplate on every screen.
export function Screen({ children, padded = true }: ScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[styles.flex, padded && styles.padded]}>{children}</View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  padded: {
    paddingHorizontal: 20,
  },
});
