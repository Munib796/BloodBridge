import { StyleSheet } from "react-native";

import { colors } from "../theme/colors";

export const deleteAccountModalStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.48)", justifyContent: "flex-end" },
  dismissArea: { flex: 1 },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 10 },
  handle: { width: 46, height: 5, borderRadius: 3, backgroundColor: "#cbd5e1", alignSelf: "center", marginBottom: 8 },
  closeButton: { position: "absolute", top: 18, right: 16, width: 32, height: 32, borderRadius: 16, backgroundColor: colors.slateSoft, alignItems: "center", justifyContent: "center", zIndex: 1 },
  content: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 26, alignItems: "center" },
  iconWrap: { width: 54, height: 54, borderRadius: 18, backgroundColor: colors.crimsonSoft, borderWidth: 1, borderColor: colors.crimsonBorder, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  title: { color: colors.text, fontSize: 21, fontWeight: "800" },
  subtitle: { color: colors.mutedText, fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 7, maxWidth: 310 },
  notice: { width: "100%", flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 11, borderRadius: 11, backgroundColor: colors.amberSoft, borderWidth: 1, borderColor: colors.amberBorder, marginTop: 18 },
  noticeText: { flex: 1, color: colors.amberText, fontSize: 11, lineHeight: 16, fontWeight: "700" },
  errorBox: { width: "100%", flexDirection: "row", alignItems: "flex-start", gap: 7, padding: 10, borderRadius: 10, backgroundColor: colors.crimsonSoft, borderWidth: 1, borderColor: colors.crimsonBorder, marginTop: 14 },
  errorText: { flex: 1, color: colors.crimson, fontSize: 11, lineHeight: 16, fontWeight: "600" },
  deleteButton: { width: "100%", height: 50, borderRadius: 12, backgroundColor: colors.crimson, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 16 },
  deleteButtonText: { color: colors.surface, fontSize: 14, fontWeight: "800" },
  busy: { opacity: 0.7 },
  cancelButton: { height: 38, alignItems: "center", justifyContent: "center" },
  cancelText: { color: colors.mutedText, fontSize: 13, fontWeight: "700" },
});