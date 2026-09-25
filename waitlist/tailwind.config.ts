import type { Config } from "tailwindcss";

// Tokens mirror the main ENNOIA web app (apps/web/tailwind.config.js) so the waitlist looks
// like the product it announces.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
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
        brand: "#5028DC",
        brandHover: "#7850C8",
        brandPressed: "#6450A0",
        lime: "#8C64FF",
        leaf: "var(--c-leaf)",
        electric: "#50C8FF",
        error: "#F06464",
        celebration: { start: "#5028DC", mid: "#8C64FF", end: "#DC78FF" },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
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
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(140,100,255,0.25), 0 0 32px rgba(140,100,255,0.18)",
      },
      transitionDuration: {
        quick: "120ms",
        standard: "220ms",
        expressive: "380ms",
      },
      keyframes: {
        popIn: {
          "0%": { transform: "scale(0.9)", opacity: "0" },
          "60%": { transform: "scale(1.04)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        pulseRing: {
          "0%": { transform: "scale(0.8)", opacity: "0.7" },
          "100%": { transform: "scale(2.2)", opacity: "0" },
        },
        sweep: {
          "0%": { transform: "translateX(-120%)" },
          "100%": { transform: "translateX(320%)" },
        },
        aurora: {
          "0%": { transform: "translate3d(-8%, -6%, 0) scale(1)" },
          "50%": { transform: "translate3d(6%, 4%, 0) scale(1.15)" },
          "100%": { transform: "translate3d(-4%, 8%, 0) scale(0.95)" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        rise: {
          "0%": { transform: "translateY(28px)", opacity: "0", filter: "blur(6px)" },
          "100%": { transform: "translateY(0)", opacity: "1", filter: "blur(0)" },
        },
        gradientPan: {
          "0%": { backgroundPosition: "0% 50%" },
          "100%": { backgroundPosition: "200% 50%" },
        },
        drift: {
          "0%": { transform: "translateY(0) rotate(0deg)", opacity: "0" },
          "10%": { opacity: "1" },
          "100%": { transform: "translateY(-340px) rotate(18deg)", opacity: "0" },
        },
        burst: {
          "0%": { transform: "translate(0, 0) scale(0.4)", opacity: "1" },
          "100%": { transform: "translate(var(--bx), var(--by)) scale(1.2)", opacity: "0" },
        },
      },
      animation: {
        popIn: "popIn 380ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        pulseRing: "pulseRing 1.4s ease-out infinite",
        sweep: "sweep 2.4s ease-in-out infinite",
        aurora: "aurora 18s ease-in-out infinite alternate",
        marquee: "marquee 32s linear infinite",
        rise: "rise 800ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
        gradientPan: "gradientPan 6s linear infinite",
        drift: "drift 3.6s ease-out forwards",
        burst: "burst 900ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards",
      },
    },
  },
  plugins: [],
};

export default config;
