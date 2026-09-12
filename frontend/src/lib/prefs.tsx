"use client";

// User preferences — field-operability settings persisted in localStorage.
// Low Data Mode reduces background requests, WebSocket-driven refetches and
// map refreshes so the app stays usable on weak/intermittent connectivity.

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

const LOW_DATA_KEY = "ycomps.lowData";

interface PrefsState {
  lowData: boolean;
  setLowData: (value: boolean) => void;
}

const PrefsContext = createContext<PrefsState | undefined>(undefined);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [lowData, setLowDataState] = useState(false);

  useEffect(() => {
    setLowDataState(window.localStorage.getItem(LOW_DATA_KEY) === "1");
  }, []);

  const setLowData = useCallback((value: boolean) => {
    setLowDataState(value);
    try {
      window.localStorage.setItem(LOW_DATA_KEY, value ? "1" : "0");
    } catch {
      /* storage unavailable — session-only preference */
    }
  }, []);

  return <PrefsContext.Provider value={{ lowData, setLowData }}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): PrefsState {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error("usePrefs must be used within PreferencesProvider");
  return ctx;
}