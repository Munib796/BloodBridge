export const colors = {
  background: "#FAFAFA",
  surface: "#FFFFFF",
  border: "#E5E7EB",

  text: "#111827",
  textMuted: "#6B7280",
  textFaint: "#9CA3AF",

  primary: "#D6293E", // BloodBridge red — used sparingly (brand, primary buttons)
  primaryDark: "#A81F30",

  success: "#16A34A",
  warning: "#D97706",

  // Urgency palette — this is the single most important visual signal in the
  // app, so each level gets a distinct background, border and text color
  // rather than just a colored dot.
  urgency: {
    critical: {
      bg: "#FDE8E8",
      border: "#F1A9A9",
      text: "#B91C1C",
      solid: "#DC2626",
    },
    urgent: {
      bg: "#FEF3E2",
      border: "#F6C88E",
      text: "#B45309",
      solid: "#D97706",
    },
    routine: {
      bg: "#EEF2FF",
      border: "#C7D2FE",
      text: "#3730A3",
      solid: "#4F46E5",
    },
  },

  statusNeutral: "#6B7280",
} as const;

export type UrgencyKey = keyof typeof colors.urgency;
