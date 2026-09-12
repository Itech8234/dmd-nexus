"use client";

// Authentication provider — restores the session, holds the current user,
// and exposes login/logout. The JWT tokens live in localStorage via the
// http client; this context is the React-facing surface.

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { authApi } from "./api";
import { clearTokens, setTokens } from "./http";
import type { User, Role } from "@/types";

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  /** True for users with the full privileged admin surface. */
  isPrivileged: boolean;
  /** True for coordinator-and-above (admin/ops navigation). */
  isCoordinatorOrAbove: boolean;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      const hasAccess = typeof window !== "undefined" && !!window.localStorage.getItem("ycomps.access");
      if (!hasAccess) {
        setLoading(false);
        return;
      }
      try {
        const me = await authApi.me();
        if (!cancelled) setUser(me);
      } catch {
        // Session invalid — leave user null; the router guard will redirect.
        if (!cancelled) clearTokens();
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const tokens = await authApi.login(username, password);
    setTokens(tokens.access, tokens.refresh);
    const me = await authApi.me();
    setUser(me);
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
    if (typeof window !== "undefined") window.location.href = "/login";
  }, []);

  const value: AuthState = {
    user,
    loading,
    login,
    logout,
    isPrivileged: !!user && (user.role === "super_admin" || user.role === "campaign_admin"),
    isCoordinatorOrAbove: !!user && !["field_official"].includes(user.role),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function isAdminRole(role: Role | undefined): boolean {
  return role === "super_admin" || role === "campaign_admin";
}
