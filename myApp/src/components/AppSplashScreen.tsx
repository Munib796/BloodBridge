import { Image } from "expo-image";
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { colors } from "../theme/colors";

const heroImage = require("../../assets/images/bloodbridge-hero.png");

type AppSplashScreenProps = {
  /**
   * Flip to true once the app is ready to be shown (auth hydrated + the
   * minimum hold time has elapsed). Starts the exit fade; `onHidden` fires
   * once that fade finishes, so the parent can stop rendering this screen.
   */
  ready: boolean;
  onHidden: () => void;
};

/**
 * The "real" branded splash — shown the instant the native OS splash hides,
 * so the plain system icon flash is as short as possible and this designed
 * screen (hero art + wordmark) is what actually holds for the 2s/auth wait.
 */
export default function AppSplashScreen({ ready, onHidden }: AppSplashScreenProps) {
  const entry = useRef(new Animated.Value(0)).current;
  const exit = useRef(new Animated.Value(1)).current;

  // Fade + scale in on mount.
  useEffect(() => {
    Animated.timing(entry, {
      toValue: 1,
      duration: 420,
      useNativeDriver: true,
    }).start();
  }, [entry]);

  // Fade out once the app says it's ready, then hand control back.
  useEffect(() => {
    if (!ready) return;

    const animation = Animated.timing(exit, {
      toValue: 0,
      duration: 320,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) onHidden();
    });

    return () => animation.stop();
  }, [ready, exit, onHidden]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.fill, { opacity: exit }]}
    >
      <Animated.View
        style={[
          styles.content,
          {
            opacity: entry,
            transform: [
              { scale: entry.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
            ],
          },
        ]}
      >
        <View style={styles.heroWrap}>
          <View style={styles.heroHalo} />
          <Image source={heroImage} contentFit="contain" style={styles.heroImage} />
        </View>
        <Text style={styles.brandName}>
          Blood<Text style={styles.brandAccent}>Bridge</Text>
        </Text>
        <Text style={styles.tagline}>Every Second Counts.</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { alignItems: "center" },
  heroWrap: {
    width: 200,
    height: 200,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  heroHalo: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: colors.crimsonSoft,
  },
  heroImage: { width: 152, height: 152 },
  brandName: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "800",
    letterSpacing: -0.8,
    color: colors.text,
  },
  brandAccent: { color: colors.crimson },
  tagline: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 17,
    color: colors.mutedText,
  },
});
