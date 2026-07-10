import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    borderRadius: {
      none: "0px",
      sm: "0px",
      DEFAULT: "0px",
      md: "0px",
      lg: "0px",
      xl: "0px",
      "2xl": "0px",
      "3xl": "0px",
      full: "0px",
    },
    extend: {
      fontFamily: {
        sans: [
          "IBM Plex Sans",
          "IBM Plex Mono",
          "JetBrains Mono",
          "system-ui",
          "sans-serif",
        ],
        mono: ["JetBrains Mono", "IBM Plex Mono", "ui-monospace", "monospace"],
      },
      colors: {
        canvas: "var(--color-canvas)",
        surface: "var(--color-surface)",
        "surface-subtle": "var(--color-surface-subtle)",
        "surface-muted": "var(--color-surface-muted)",
        "surface-hover": "var(--color-surface-hover)",
        "surface-active": "var(--color-surface-active)",
        editor: "var(--color-editor-canvas)",
        border: "var(--color-border)",
        "border-muted": "var(--color-border-muted)",
        "border-strong": "var(--color-border-strong)",
        text: {
          primary: "var(--color-text-primary)",
          secondary: "var(--color-text-secondary)",
          muted: "var(--color-text-muted)",
          subtle: "var(--color-text-subtle)",
          disabled: "var(--color-text-disabled)",
          inverse: "var(--color-text-inverse)",
        },
        accent: {
          DEFAULT: "var(--color-accent)",
          hover: "var(--color-accent-hover)",
          active: "var(--color-accent-active)",
          subtle: "var(--color-accent-subtle)",
          border: "var(--color-accent-border)",
          foreground: "var(--color-accent-foreground)",
        },
        success: {
          DEFAULT: "var(--color-success)",
          subtle: "var(--color-success-subtle)",
          border: "var(--color-success-border)",
        },
        warning: {
          DEFAULT: "var(--color-warning)",
          subtle: "var(--color-warning-subtle)",
          border: "var(--color-warning-border)",
        },
        danger: {
          DEFAULT: "var(--color-danger)",
          subtle: "var(--color-danger-subtle)",
          border: "var(--color-danger-border)",
        },
        info: {
          DEFAULT: "var(--color-info)",
          subtle: "var(--color-info-subtle)",
          border: "var(--color-info-border)",
        },
      },
      boxShadow: {
        panel: "0 0 0 1px rgba(148, 163, 184, 0.06)",
        dialog: "0 18px 64px rgba(3, 8, 14, 0.68)",
        dropdown: "0 12px 32px rgba(3, 8, 14, 0.58)",
      },
      fontSize: {
        "2xs": ["10px", "14px"],
      },
    },
  },
  plugins: [],
} satisfies Config;
