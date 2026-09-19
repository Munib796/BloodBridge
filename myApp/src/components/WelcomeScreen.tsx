import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, type RelativePathString } from "expo-router";
import { useEffect, useState } from "react";
import { Animated, Pressable, Text, View } from "react-native";

import { styles } from "../styles/welcomeStyles";
import BrandLogo from "./BrandLogo";

const heroImage = require("../../assets/images/bloodbridge-hero.png");

function LiveStatusDot() {
  const [pulse] = useState(() => new Animated.Value(0));

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

  return (
    <View style={styles.onlineDot}>
      <Animated.View
        style={[
          styles.onlineDotPulse,
          {
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.75, 0] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }],
          },
        ]}
      />
      <View style={styles.onlineDotCore} />
    </View>
  );
}

function BrandHeader() {
  return (
    <View style={styles.brandRow}>
      <BrandLogo style={styles.brandLogo} />
      <Text style={styles.brandName}>BloodBridge</Text>
      <LiveStatusDot />
    </View>
  );
}

function HeroArt() {
  return (
    <LinearGradient
      colors={["#edfff9", "#ffffff", "#fff3f2"]}
      locations={[0, 0.5, 1]}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={styles.hero}
    >
      <View style={styles.heroGraphic}>
        <View style={styles.heroPulseHalo} />
        <Image source={heroImage} contentFit="contain" style={styles.heroImage} />
      </View>
    </LinearGradient>
  );
}

type ActionButtonProps = {
  variant: "primary" | "secondary";
  icon: "ambulance" | "hand-heart";
  title: string;
  subtitle: string;
};

function ActionButton({ variant, icon, title, subtitle }: ActionButtonProps) {
  const isPrimary = variant === "primary";
  const router = useRouter();

  return (
    <Pressable onPress={() => { if (isPrimary) router.push("/requestor-signup" as RelativePathString); else router.push({ pathname: "/donor-signup" }); }} style={({ pressed }) => [styles.action, isPrimary ? styles.primaryAction : styles.secondaryAction, pressed && styles.pressed]}>
      <View style={styles.actionContent}>
        <View style={isPrimary ? styles.primaryIcon : styles.donateIcon}>
          {icon === "ambulance" ? (
            <MaterialCommunityIcons name="ambulance" size={22} color="#ffffff" />
          ) : (
            <MaterialIcons name="volunteer-activism" size={22} color="#00714d" />
          )}
        </View>
        <View>
          <Text style={isPrimary ? styles.primaryLabel : styles.secondaryLabel}>{title}</Text>
          <Text style={isPrimary ? styles.primarySubtext : styles.secondarySubtext}>{subtitle}</Text>
        </View>
      </View>
      <MaterialIcons name="chevron-right" size={20} color={isPrimary ? "#ffffff" : "#5c5b68"} />
    </Pressable>
  );
}

function WelcomeFooter() {
  const router = useRouter();

  return (
    <View style={styles.footer}>
      <Pressable onPress={() => router.push("/login")}>
        <Text style={styles.loginPrompt}>Already registered? <Text style={styles.login}>Log in</Text></Text>
      </Pressable>
      <Pressable style={styles.hospitalLink}>
        <MaterialIcons name="domain" size={16} color="#5c5b68" />
        <Text style={styles.hospitalText}>Hospital or Organization Login</Text>
        <MaterialIcons name="north-east" size={14} color="#5c5b68" />
      </Pressable>
    </View>
  );
}

export default function WelcomeScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.container}>
        <BrandHeader />
        <HeroArt />
        <View style={styles.message}>
          <Text style={styles.title}>Every Second <Text style={styles.titleAccent}>Counts.</Text></Text>
          <Text style={styles.description}>Connecting urgent blood requests directly with nearby verified donors and clinical blood banks - instantly.</Text>
        </View>
        <View style={styles.actions}>
          <ActionButton variant="primary" icon="ambulance" title="I Need Blood" subtitle="Instant Dispatch Request" />
          <ActionButton variant="secondary" icon="hand-heart" title="I Want to Donate" subtitle="Join Community Hero Network" />
        </View>
        <WelcomeFooter />
      </View>
    </SafeAreaView>
  );
}