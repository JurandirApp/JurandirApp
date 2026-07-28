import type { Config } from "tailwindcss";

/**
 * Jurandir design system tokens.
 * Values taken directly from the hi-fi HTML prototypes (design_handoff_jurandir).
 * Signature visual: hard offset shadows on cards, no hover states.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Backgrounds
        page: "#F8EFDA",
        sand: "#EDD8A3",
        dune: {
          DEFAULT: "#EDD8A3",
          50: "rgba(237,216,163,.5)",
        },
        // Core ink
        ink: "#141821",
        // Coral (CTA / emphasis)
        coral: {
          DEFAULT: "#FF6B4A",
          emph: "#EF5130",
        },
        // Ocean
        ocean: {
          DEFAULT: "#0F7E84",
          700: "#0C6A70",
          900: "#0C4347",
        },
        // Sun (ranking badges, dark accents)
        sun: "#FFC24B",
        // Order / lead status palettes
        status: {
          "rose-bg": "#ffe4e6",
          "rose-fg": "#be123c",
          "amber-bg": "#fef3c7",
          "amber-fg": "#b45309",
          "emerald-bg": "#d1fae5",
          "emerald-fg": "#047857",
        },
        // Payment glyph circles
        pay: {
          card: "#3b82f6",
          debit: "#10b981",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        "20": "20px",
        "28": "28px",
      },
      boxShadow: {
        // Signature hard offset shadows
        hard: "4px 4px 0 0 #141821",
        "hard-lg": "6px 6px 0 0 #141821",
        // Soft occlusion shadows used across floating cards / dropdowns / modals
        float: "0 18px 40px -20px rgba(12,67,71,.35)",
        dropdown: "0 18px 40px -20px rgba(12,67,71,.45)",
        modal: "0 24px 60px -20px rgba(12,67,71,.5)",
      },
      letterSpacing: {
        display: "-0.02em",
        wordmark: "-0.05em",
      },
      keyframes: {
        marquee: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
        floaty: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-12px)" },
        },
        fadeUp: {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        pulseSoft: {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: ".35" },
        },
        notifIn: {
          from: { opacity: "0", transform: "translateX(24px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        riseIn: {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        marquee: "marquee 22s linear infinite",
        floaty: "floaty 5s ease-in-out infinite",
        "pulse-soft": "pulseSoft 2s infinite",
        "notif-in": "notifIn .3s ease-out",
        "rise-in": "riseIn .5s ease-out",
        // `backwards` (not `both`): applies the 0% state during the delay, then
        // reverts to base styles — so no residual transform lingers to create a
        // containing block that would trap a child's position:fixed backdrop.
        "fade-up": "fadeUp .5s backwards",
      },
    },
  },
  plugins: [],
};

export default config;
