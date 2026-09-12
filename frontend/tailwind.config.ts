import type { Config } from "tailwindcss";

// Colours are wired to CSS variables (rgb triplets) so light/dark themes flip
// without losing Tailwind's opacity-modifier support (bg-surface-sunken/50 etc).
// Light values in :root equal the previous hard-coded palette; .dark overrides
// the subset of steps the UI actually uses. See src/app/globals.css.
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: [
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand / surfaces — a restrained command-centre palette.
        brand: {
          50: v("brand-50"),
          100: v("brand-100"),
          200: v("brand-200"),
          300: v("brand-300"),
          400: v("brand-400"),
          500: v("brand-500"),
          600: v("brand-600"),
          700: v("brand-700"),
          800: v("brand-800"),
          900: v("brand-900"),
          950: v("brand-950"),
        },
        ink: {
          DEFAULT: v("ink"),
          soft: v("ink-soft"),
          muted: v("ink-muted"),
          faint: v("ink-faint"),
        },
        surface: {
          DEFAULT: v("surface"),
          panel: v("surface-panel"),
          raised: v("surface-raised"),
          sunken: v("surface-sunken"),
          line: v("surface-line"),
        },
        // Neutral scale used directly across the UI (text-slate-500, bg-slate-100…)
        slate: {
          50: v("slate-50"),
          100: v("slate-100"),
          200: v("slate-200"),
          300: v("slate-300"),
          400: v("slate-400"),
          500: v("slate-500"),
          600: v("slate-600"),
          700: v("slate-700"),
          800: v("slate-800"),
          900: v("slate-900"),
          950: "#020617",
        },
        // Status tints — only the 50-level backgrounds flip for dark mode;
        // the 500/600 dot/background levels stay vivid in both themes.
        red: { 50: v("red-50"), 500: "#ef4444", 600: "#dc2626", 700: "#b91c1c" },
        emerald: { 50: v("emerald-50"), 100: v("emerald-100"), 500: "#10b981", 600: "#059669", 700: "#047857", 800: "#065f46" },
        amber: { 50: v("amber-50"), 500: "#f59e0b", 600: "#d97706", 700: "#b45309", 800: "#92400e" },
        blue: { 50: v("blue-50"), 500: "#3b82f6", 600: "#2563eb", 700: "#1d4ed8" },
        orange: { 50: v("orange-50"), 500: "#f97316", 600: "#ea580c" },
        indigo: { 50: v("indigo-50"), 500: "#6366f1", 600: "#4f46e5" },
        violet: { 50: v("violet-50"), 500: "#8b5cf6", 600: "#7c3aed" },
        purple: { 50: v("purple-50"), 500: "#a855f7", 600: "#9333ea" },
        fuchsia: { 50: v("fuchsia-50"), 500: "#d946ef", 700: "#a21caf" },
        success: "#15803d",
        warning: "#b45309",
        danger: "#dc2626",
        info: "#2563eb",
        offline: "#64748b",
        syncing: "#9333ea",
      },
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(15 23 42 / 0.05)",
        lift: "0 4px 16px -2px rgb(15 23 42 / 0.12)",
        pop: "0 12px 40px -8px rgb(15 23 42 / 0.22)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.25s ease-out forwards",
        "slide-in-right": "slide-in-right 0.28s ease-out forwards",
        "scale-in": "scale-in 0.18s ease-out forwards",
        shimmer: "shimmer 1.6s linear infinite",
        "pulse-soft": "pulse-soft 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
