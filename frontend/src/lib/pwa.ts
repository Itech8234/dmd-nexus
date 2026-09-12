"use client";

import { useEffect } from "react";

export function usePwaRegistration() {
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      process.env.NODE_ENV === "production"
    ) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* SW is best-effort; ignore registration failures in dev */
      });
    }
  }, []);
}
