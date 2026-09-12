"use client";

// Theme controls — a compact cycling button for tight headers and a segmented
// control for the settings screen. Both write through lib/theme.tsx.

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemeMode } from "@/lib/theme";

const ORDER: ThemeMode[] = ["system", "light", "dark"];
const ICONS: Record<ThemeMode, typeof Sun> = { system: Monitor, light: Sun, dark: Moon };
const LABELS: Record<ThemeMode, string> = {
  system: "System theme",
  light: "Light theme",
  dark: "Dark theme",
};

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { mode, setMode } = useTheme();
  const Icon = ICONS[mode];
  const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
  return (
    <button
      onClick={() => setMode(next)}
      className={`p-2 rounded-lg text-slate-500 hover:bg-surface-sunken hover:text-ink ${className}`}
      aria-label={`${LABELS[mode]} — switch to ${LABELS[next]}`}
      title={`${LABELS[mode]} — click for ${LABELS[next]}`}
    >
      <Icon size={18} />
    </button>
  );
}

export function ThemeSegmented() {
  const { mode, setMode } = useTheme();
  return (
    <div
      className="inline-flex rounded-lg border border-surface-line bg-surface-sunken p-1"
      role="group"
      aria-label="Colour theme"
    >
      {ORDER.map((m) => {
        const Icon = ICONS[m];
        const active = mode === m;
        return (
          <button
            key={m}
            onClick={() => setMode(m)}
            aria-pressed={active}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              active ? "bg-surface-panel text-ink shadow-card" : "text-slate-500 hover:text-ink"
            }`}
          >
            <Icon size={14} /> {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        );
      })}
    </div>
  );
}