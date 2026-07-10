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
        canvas: "var(--color-canvas)",
        surface: "var(--color-surface)",
        "surface-subtle": "var(--color-surface-subtle)",
        border: "var(--color-border)",
        "border-strong": "var(--color-border-strong)",
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
        success: {
          DEFAULT: "var(--color-success)",
          subtle: "var(--color-success-subtle)",
        },
        warning: {
          DEFAULT: "var(--color-warning)",
          subtle: "var(--color-warning-subtle)",
        },
        danger: {
          DEFAULT: "var(--color-danger)",
          subtle: "var(--color-danger-subtle)",
        },
        info: {
          DEFAULT: "var(--color-info)",
          subtle: "var(--color-info-subtle)",
        },
        accent: {
          DEFAULT: "var(--color-accent)",
          subtle: "var(--color-accent-subtle)",
        },
      },
      boxShadow: {
        panel: "0 10px 25px rgba(11, 15, 20, 0.08)",
        dialog: "0 20px 60px rgba(11, 15, 20, 0.2)",
        dropdown: "0 4px 16px rgba(11, 15, 20, 0.12)",
      },
      borderRadius: {
        DEFAULT: "8px",
        sm: "6px",
        lg: "12px",
      },
      fontSize: {
        "2xs": ["10px", "14px"],
      },
    },
  },
  plugins: [],
} satisfies Config;
