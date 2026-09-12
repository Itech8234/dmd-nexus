"use client";

import { useEffect, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ToastProvider } from "@/components/ui/Toast";
import { ConnectivityProvider } from "@/lib/connectivity";

function Inner({ children, role }: { children: ReactNode; role: "admin" | "field" }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    const isField = user.role === "field_official";
    if (role === "field" && !isField) {
      router.replace("/dashboard");
      return;
    }
    if (role === "admin" && isField) {
      router.replace("/field");
      return;
    }
    setChecked(true);
  }, [user, loading, role, router]);

  if (loading || !checked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-9 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
          <p className="text-xs text-slate-500">Loading…</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

export function Protected({ children, role }: { children: ReactNode; role: "admin" | "field" }) {
  return (
    <Inner role={role}>{children}</Inner>
  );
}
