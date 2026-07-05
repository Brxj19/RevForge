import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Geist Sans", "Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "IBM Plex Mono", "ui-monospace", "monospace"],
      },
      colors: {
        canvas: "var(--rf-canvas)",
        surface: "var(--rf-surface)",
        border: "var(--rf-border)",
        ink: {
          950: "var(--rf-ink-950)",
          900: "var(--rf-ink-900)",
          800: "var(--rf-ink-800)",
        },
        slate: {
          700: "var(--rf-slate-700)",
          500: "var(--rf-slate-500)",
          300: "var(--rf-slate-300)",
          100: "var(--rf-slate-100)",
        },
        forge: {
          600: "var(--rf-forge-600)",
          500: "var(--rf-forge-500)",
          100: "var(--rf-forge-100)",
        },
      },
      boxShadow: {
        panel: "0 10px 25px rgba(11, 15, 20, 0.08)",
      },
    },
  },
  plugins: [],
} satisfies Config;

