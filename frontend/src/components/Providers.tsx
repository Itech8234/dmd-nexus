"use client";

import { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/Toast";
import { ConnectivityProvider } from "@/lib/connectivity";
import { ThemeProvider } from "@/lib/theme";
import { PreferencesProvider } from "@/lib/prefs";
import { AuthProvider } from "@/lib/auth";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <PreferencesProvider>
        <ToastProvider>
          <ConnectivityProvider>
            <AuthProvider>{children}</AuthProvider>
          </ConnectivityProvider>
        </ToastProvider>
      </PreferencesProvider>
    </ThemeProvider>
  );
}
