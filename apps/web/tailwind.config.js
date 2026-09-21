/** @type {import('tailwindcss').Config} */
// Design tokens are the single source of truth (PRODUCT-DESIGN.md §9–§15).
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Neutrals + the text-accent (`leaf`) are themed via CSS variables (light default,
        // dark under [data-theme="dark"]). The video theater / Live screen opt into dark.
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
        // Fixed across themes: bright lime is a FILL (with `ink` text); `leaf` is accent TEXT.
        lime: "#A7F46A",
        leaf: "var(--c-leaf)",
        ink: "#14150D",
        electric: "#258BFF",
        fire: "#FF6A3D",
        laugh: "#FFD84D",
        wow: "#4DA3FF",
        success: "#63D88C",
        warning: "#F4C95D",
        error: "#FF626B",
        info: "#5A9FFF",
        celebration: { start: "#FF7A21", mid: "#FF3F91", end: "#695CFF" },
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
        glow: "0 0 0 1px rgba(167,244,106,0.25), 0 0 32px rgba(167,244,106,0.18)",
        glowBlue: "0 0 0 1px rgba(37,139,255,0.3), 0 0 28px rgba(37,139,255,0.22)",
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
