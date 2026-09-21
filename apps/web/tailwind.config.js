/** @type {import('tailwindcss').Config} */
// Design tokens are the single source of truth (PRODUCT-DESIGN.md §9–§15).
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Neutrals + accent text (`leaf`) come from CSS variables (MOMENT black+purple).
        night: "var(--c-night)",
        surface1: "var(--c-surface1)",
        surface2: "var(--c-surface2)",
        surface3: "var(--c-surface3)",
        border: "var(--c-border)",
        borderStrong: "var(--c-border-strong)",
        text: {
          DEFAULT: "var(--c-text)",
          secondary: "var(--c-text-secondary)",
          muted: "var(--c-text-muted)",
          disabled: "var(--c-text-disabled)",
        },
        // MOMENT brand purple. These accents are theme-independent (fixed hex) so Tailwind's
        // /opacity modifiers (bg-lime/10, border-error/40, …) render correctly.
        brand: "#5028DC", // --color-9 — primary buttons (white text)
        brandHover: "#7850C8", // --color-13
        brandPressed: "#6450A0", // --color-10
        lime: "#8C64FF", // --color-11 — accent fill (marks, active bars)
        leaf: "var(--c-leaf)", // accent TEXT (links/active) — themed (deep purple on light, bright on dark)
        ink: "#14150D", // dark text on bright fills (badges/avatars)
        tint: "#C8B4FF", // --color-12 — badge / tint backgrounds
        curatorGold: "#F0DCA0", // --color-19 — Founding Curator badge
        electric: "#50C8FF", // --color-4 — info / graph / spike line
        fire: "#FF6A3D",
        laugh: "#FFD84D",
        wow: "#4DA3FF",
        moment: "#FF78B4", // --color-17 — Moment / reaction highlight
        momentTint: "#FFB4DC", // --color-16
        success: "#8CFFC8", // --color-3
        warning: "#F4C95D",
        error: "#F06464", // --color-18 — LIVE / error
        info: "#50C8FF",
        celebration: { start: "#5028DC", mid: "#8C64FF", end: "#DC78FF" },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        // Monospace is core to the Talise-style scaffolding: labels, meta, body-support, buttons.
        mono: ["'JetBrains Mono'", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        micro: ["11px", { lineHeight: "14px", fontWeight: "500" }],
        label: ["12px", { lineHeight: "16px", fontWeight: "600" }],
        bodysm: ["13px", { lineHeight: "18px" }],
        body: ["15px", { lineHeight: "22px" }],
        bodylg: ["17px", { lineHeight: "25px" }],
        h3: ["20px", { lineHeight: "26px", fontWeight: "600" }],
        h2: ["24px", { lineHeight: "30px", fontWeight: "700" }],
        h1: ["32px", { lineHeight: "38px", fontWeight: "700" }],
        display: ["40px", { lineHeight: "44px", fontWeight: "700" }],
        displayxl: ["48px", { lineHeight: "52px", fontWeight: "700" }],
      },
      borderRadius: {
        xs: "8px",
        sm: "12px",
        md: "16px",
        lg: "20px",
        xl: "24px",
        full: "999px",
      },
      spacing: {
        1: "4px",
        2: "8px",
        3: "12px",
        4: "16px",
        5: "20px",
        6: "24px",
        8: "32px",
        10: "40px",
        12: "48px",
        16: "64px",
        20: "80px",
      },
      boxShadow: {
        modal: "0 16px 48px rgba(0,0,0,0.45)",
        glow: "0 0 0 1px rgba(140,100,255,0.25), 0 0 32px rgba(140,100,255,0.18)",
        glowBlue: "0 0 0 1px rgba(80,200,255,0.3), 0 0 28px rgba(80,200,255,0.22)",
      },
      transitionDuration: {
        quick: "120ms",
        standard: "220ms",
        expressive: "380ms",
        celebration: "700ms",
      },
      keyframes: {
        popIn: {
          "0%": { transform: "scale(0.9)", opacity: "0" },
          "60%": { transform: "scale(1.04)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        floatUp: {
          "0%": { transform: "translateY(0) scale(1)", opacity: "1" },
          "100%": { transform: "translateY(-64px) scale(1.1)", opacity: "0" },
        },
        pulseRing: {
          "0%": { transform: "scale(0.8)", opacity: "0.7" },
          "100%": { transform: "scale(2.2)", opacity: "0" },
        },
        sweep: {
          "0%": { transform: "translateX(-120%)" },
          "100%": { transform: "translateX(120%)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
      },
      animation: {
        popIn: "popIn 380ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        floatUp: "floatUp 700ms ease-out forwards",
        pulseRing: "pulseRing 1.4s ease-out infinite",
        sweep: "sweep 900ms ease-in-out",
        shimmer: "shimmer 1.4s linear infinite",
      },
    },
  },
  plugins: [],
};
