import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "ab-bg": "#0F1117",
        "ab-card": "#1A1D27",
        "ab-border": "#2A2D3E",
        "ab-hover": "#1E2130",
        "ab-accent": "#6C63FF",
        "ab-accent-hover": "#8B5CF6",
        "ab-teal": "#00D4AA",
        "ab-danger": "#FF5C5C",
        "ab-text": "#E8E9F0",
        "ab-muted": "#8B8FA8",
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
