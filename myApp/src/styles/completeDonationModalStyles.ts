import { StyleSheet } from "react-native";

import { colors } from "../theme/colors";

export const completeDonationModalStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.48)", justifyContent: "flex-end" },
  modal: { backgroundColor: colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28 },
  handle: { width: 46, height: 5, borderRadius: 3, backgroundColor: colors.border, alignSelf: "center", marginBottom: 12 },
  closeButton: { position: "absolute", top: 16, right: 16, width: 34, height: 34, borderRadius: 17, backgroundColor: colors.slateSoft, alignItems: "center", justifyContent: "center" },
  iconWrap: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.emeraldSoft, borderWidth: 1, borderColor: colors.emeraldBorder, alignItems: "center", justifyContent: "center", alignSelf: "center", marginTop: 8 },
  title: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: "800", textAlign: "center", marginTop: 14 },
  body: { color: colors.mutedText, fontSize: 13, lineHeight: 20, textAlign: "center", marginTop: 7 },
  actions: { gap: 9, marginTop: 22 },
  confirmButton: { minHeight: 48, borderRadius: 12, backgroundColor: colors.secondary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  confirmText: { color: colors.surface, fontSize: 14, fontWeight: "800" },
  cancelButton: { minHeight: 44, borderRadius: 12, backgroundColor: colors.slateSoft, alignItems: "center", justifyContent: "center" },
  cancelText: { color: colors.text, fontSize: 13, fontWeight: "700" },
});
