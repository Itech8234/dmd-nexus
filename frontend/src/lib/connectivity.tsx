"use client";

// Global connectivity + sync status. Listens to the browser online/offline
// events and exposes a single source of truth for the connection indicator
// and the sync queue badge. The actual queue lives in the offline store
// (src/lib/sync-store.ts); this context just reflects it.

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

export type ConnectionState = "online" | "offline";

interface ConnectivityState {
  online: boolean;
}

const ConnectivityContext = createContext<ConnectivityState>({ online: true });

export function ConnectivityProvider({ children }: { children: React.ReactNode }) {
  const [online, setOnline] = useState<boolean>(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  return (
    <ConnectivityContext.Provider value={{ online }}>{children}</ConnectivityContext.Provider>
  );
}

export function useConnectivity() {
  return useContext(ConnectivityContext);
}
