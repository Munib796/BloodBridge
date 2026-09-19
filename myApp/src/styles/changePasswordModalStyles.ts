import { StyleSheet } from "react-native";

import { colors } from "../theme/colors";

export const changePasswordModalStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)", justifyContent: "flex-end" },
  sheet: { width: "100%", borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: colors.surface, overflow: "hidden" },
  handle: { width: 48, height: 6, borderRadius: 3, backgroundColor: "#cbd5e1", alignSelf: "center", marginTop: 12, marginBottom: 12 },
  closeButton: { position: "absolute", top: 14, right: 16, width: 32, height: 32, borderRadius: 16, backgroundColor: colors.slateSoft, alignItems: "center", justifyContent: "center", zIndex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 2, paddingBottom: 24 },
  header: { paddingRight: 36, marginBottom: 20 },
  title: { color: colors.text, fontSize: 22, lineHeight: 28, fontWeight: "800" },
  subtitle: { color: colors.mutedText, fontSize: 13, lineHeight: 19, marginTop: 6 },
  label: { color: colors.text, fontSize: 11, lineHeight: 16, fontWeight: "800", letterSpacing: 0.8, marginBottom: 8 },
  emailCard: { minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.slateSoft, paddingHorizontal: 14, justifyContent: "center" },
  emailText: { color: colors.text, fontSize: 15, fontWeight: "600" },
  helper: { color: colors.mutedText, fontSize: 11, lineHeight: 16, marginTop: 8, marginBottom: 22 },
  success: { minHeight: 50, borderRadius: 12, borderWidth: 1, borderColor: colors.emeraldBorder, backgroundColor: colors.emeraldSoft, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, justifyContent: "center" },
  successText: { flex: 1, color: colors.emeraldText, fontSize: 12, lineHeight: 17, fontWeight: "700" },
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 7, padding: 11, borderRadius: 10, borderWidth: 1, borderColor: colors.crimsonBorder, backgroundColor: colors.crimsonSoft, marginBottom: 16 },
  errorText: { flex: 1, color: colors.crimson, fontSize: 11, lineHeight: 16, fontWeight: "600" },
  actions: { gap: 8 },
  sendButton: { height: 50, borderRadius: 12, backgroundColor: colors.crimson, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, shadowColor: colors.crimson, shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  sendButtonDisabled: { opacity: 0.55 },
  sendText: { color: colors.surface, fontSize: 15, fontWeight: "800" },
  cancelButton: { height: 34, alignItems: "center", justifyContent: "center" },
  cancelText: { color: colors.mutedText, fontSize: 13, fontWeight: "600" },
});