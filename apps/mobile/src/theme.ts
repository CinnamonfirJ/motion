// MOMENT design tokens (black + purple). Same 20-color palette as the web root tokens.
// `lime` keeps its name as the accent-FILL token but is now bright purple; `brand` is the
// primary-button purple (with white text).
export const color = {
  night: "#000000",
  surface1: "#28283C",
  surface2: "#323248",
  surface3: "#3C3C54",
  border: "#505064",
  borderStrong: "#6450A0",
  text: "#FFFFFF",
  textSecondary: "#A0A0B4",
  textMuted: "#78788C",
  textDisabled: "#6E6E82",
  brand: "#5028DC", // primary buttons (white text)
  brandHover: "#7850C8",
  lime: "#8C64FF", // accent fill (marks / active) — bright purple
  tint: "#C8B4FF",
  curatorGold: "#F0DCA0",
  electric: "#50C8FF", // info / graph / spike line
  fire: "#FF6A3D",
  laugh: "#FFD84D",
  wow: "#4DA3FF",
  moment: "#FF78B4",
  success: "#8CFFC8",
  warning: "#F4C95D",
  error: "#F06464", // LIVE / error
  celebration: ["#5028DC", "#8C64FF", "#DC78FF"] as const,
};

import { Platform } from "react-native";

// Sharp scaffolding: structural corners are square. Avatars/among a few product bits stay round.
export const radius = { xs: 0, sm: 0, md: 0, lg: 0, xl: 0, pill: 999, full: 999 };
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48 };

// Platform monospace — core to the reference's label/meta/button style.
export const MONO = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }) as string;

/** Mono uppercase eyebrow/label style. */
export const eyebrow = (size = 11): { fontFamily: string; fontSize: number; letterSpacing: number; textTransform: "uppercase" } => ({
  fontFamily: MONO,
  fontSize: size,
  letterSpacing: 1.4,
  textTransform: "uppercase",
});
/** Mono body/meta (not uppercased). */
export const monoText = (size = 13): { fontFamily: string; fontSize: number } => ({ fontFamily: MONO, fontSize: size });

export const type = {
  micro: { fontSize: 11, lineHeight: 14, fontWeight: "500" as const },
  label: { fontSize: 12, lineHeight: 16, fontWeight: "600" as const },
  bodysm: { fontSize: 13, lineHeight: 18 },
  body: { fontSize: 15, lineHeight: 22 },
  bodylg: { fontSize: 17, lineHeight: 25 },
  h3: { fontSize: 20, lineHeight: 26, fontWeight: "600" as const },
  h2: { fontSize: 24, lineHeight: 30, fontWeight: "700" as const },
  h1: { fontSize: 32, lineHeight: 38, fontWeight: "700" as const },
  display: { fontSize: 40, lineHeight: 44, fontWeight: "700" as const },
};

export const REACTION_ICON = { fire: "🔥", laugh: "😂", wow: "😮" } as const;
