// Design tokens (PRODUCT-DESIGN.md §9–§15), shared across all mobile screens.
export const color = {
  night: "#070708",
  surface1: "#111113",
  surface2: "#18181B",
  surface3: "#212126",
  border: "#2A2A30",
  borderStrong: "#3B3B43",
  text: "#F7F7F5",
  textSecondary: "#B6B6BC",
  textMuted: "#77777F",
  textDisabled: "#525259",
  lime: "#A7F46A",
  electric: "#258BFF",
  fire: "#FF6A3D",
  laugh: "#FFD84D",
  wow: "#4DA3FF",
  success: "#63D88C",
  warning: "#F4C95D",
  error: "#FF626B",
  celebration: ["#FF7A21", "#FF3F91", "#695CFF"] as const,
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
