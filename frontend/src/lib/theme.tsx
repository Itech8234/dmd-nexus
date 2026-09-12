"use client";

// Theme provider — SYSTEM | LIGHT | DARK, persisted in localStorage and
// applied as a `dark` class on <html>. The boot script in src/app/layout.tsx
// sets the class before first paint (no wrong-theme flash); this provider
// keeps React state in sync and follows OS changes while in SYSTEM mode.

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "ycomps.theme";

function systemDark(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function resolve(mode: ThemeMode): ResolvedTheme {
  return mode === "dark" || (mode === "system" && systemDark()) ? "dark" : "light";
}

function applyTheme(mode: ThemeMode): ResolvedTheme {
  const resolved = resolve(mode);
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
  return resolved;
}

interface ThemeState {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeState | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [resolved, setResolved] = useState<ResolvedTheme>("light");

  // Restore the persisted preference after mount.
  useEffect(() => {
    const stored = (window.localStorage.getItem(STORAGE_KEY) as ThemeMode | null) || "system";
    setModeState(stored);
    setResolved(applyTheme(stored));
  }, []);

  // Follow OS changes while in SYSTEM mode.
  useEffect(() => {
    if (mode !== "system" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setResolved(applyTheme("system"));
    if (mq.addEventListener) {
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
    return undefined;
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable — session-only theme */
    }
    setResolved(applyTheme(next));
  }, []);

  return <ThemeContext.Provider value={{ mode, resolved, setMode }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}