import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text } from "react-native";

const DEFAULT_DURATION_MS = 2000;
const FADE_MS = 220;

type ToastProps = {
  /** null/empty hides the toast. Setting a new message re-triggers the show/hide cycle. */
  message: string | null;
  /** How long the toast stays fully visible before it starts fading out. */
  duration?: number;
  /** Called once the fade-out finishes, so the parent can clear `message`. */
  onHide: () => void;
};

/**
 * A brief, self-dismissing snackbar-style message near the bottom of the
 * screen — for "this isn't wired up yet" style feedback that shouldn't
 * interrupt the user the way a native Alert does.
 */
export default function Toast({ message, duration = DEFAULT_DURATION_MS, onHide }: ToastProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    if (!message) return;

    const show = Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: FADE_MS, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: FADE_MS, useNativeDriver: true }),
    ]);
    show.start();

    const hideTimer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(({ finished }) => {
        if (finished) onHide();
      });
    }, duration);

    return () => {
      clearTimeout(hideTimer);
      show.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the message identity should restart the cycle
  }, [message, duration]);

  if (!message) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.container, { opacity, transform: [{ translateY }] }]}
    >
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 24,
    right: 24,
    bottom: 32,
    backgroundColor: "rgba(15, 23, 42, 0.94)",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  text: { color: "#ffffff", fontSize: 14, lineHeight: 20, fontWeight: "500", textAlign: "center" },
});
