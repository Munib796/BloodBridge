import { StyleSheet } from "react-native";

import { colors } from "../theme/colors";

export const profilePictureActionModalStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.48)", justifyContent: "flex-end" },
  dismissArea: { flex: 1 },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 10, overflow: "hidden" },
  handle: { width: 46, height: 5, borderRadius: 3, backgroundColor: "#cbd5e1", alignSelf: "center", marginBottom: 8 },
  closeButton: { position: "absolute", top: 18, right: 16, width: 32, height: 32, borderRadius: 16, backgroundColor: colors.slateSoft, alignItems: "center", justifyContent: "center", zIndex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingRight: 38, marginBottom: 20 },
  iconWrap: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.crimsonSoft, borderWidth: 1, borderColor: colors.crimsonBorder, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1 },
  title: { color: colors.text, fontSize: 20, lineHeight: 25, fontWeight: "800" },
  subtitle: { color: colors.mutedText, fontSize: 12, lineHeight: 17, marginTop: 3 },
  actions: { gap: 9 },
  primaryButton: { height: 50, borderRadius: 12, backgroundColor: colors.crimson, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  primaryText: { color: colors.surface, fontSize: 14, fontWeight: "800" },
  removeButton: { height: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.crimsonBorder, backgroundColor: colors.crimsonSoft, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  removeText: { color: colors.crimson, fontSize: 14, fontWeight: "800" },
  cancelButton: { height: 38, alignItems: "center", justifyContent: "center" },
  cancelText: { color: colors.mutedText, fontSize: 13, fontWeight: "700" },
});