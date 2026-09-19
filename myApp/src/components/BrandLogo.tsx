import { Image } from "expo-image";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

const logoImage = require("../../assets/images/bloodbridge-logo.svg");

type BrandLogoProps = {
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export default function BrandLogo({ size = 48, style }: BrandLogoProps) {
  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: size * 0.333 }, style]}>
      <Image source={logoImage} contentFit="contain" style={{ width: size, height: size }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: "#fff1f2", alignItems: "center", justifyContent: "center", overflow: "hidden" },
});