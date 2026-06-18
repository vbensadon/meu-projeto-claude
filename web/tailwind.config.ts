import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "ab-bg":           "rgb(var(--ab-bg) / <alpha-value>)",
        "ab-card":         "rgb(var(--ab-card) / <alpha-value>)",
        "ab-border":       "rgb(var(--ab-border) / <alpha-value>)",
        "ab-hover":        "rgb(var(--ab-hover) / <alpha-value>)",
        "ab-accent":       "rgb(var(--ab-accent) / <alpha-value>)",
        "ab-accent-hover": "rgb(var(--ab-accent-hover) / <alpha-value>)",
        "ab-teal":         "rgb(var(--ab-teal) / <alpha-value>)",
        "ab-danger":       "rgb(var(--ab-danger) / <alpha-value>)",
        "ab-text":         "rgb(var(--ab-text) / <alpha-value>)",
        "ab-muted":        "rgb(var(--ab-muted) / <alpha-value>)",
      },
      borderRadius: {
        card: "12px",
        input: "8px",
        chip: "20px",
      },
    },
  },
  plugins: [],
} satisfies Config;
