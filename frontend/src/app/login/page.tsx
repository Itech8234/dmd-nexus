"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { apiErrorMessage } from "@/lib/http";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const { push } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(username.trim(), password);
      push("success", "Welcome back to Y-COMPS.");
      // Role routing: field officials get the mobile console, everyone else
      // the command centre at /dashboard. Redirect conservatively; guards
      // re-check anyway.
      router.replace("/dashboard");
    } catch (err) {
      const msg = apiErrorMessage(err, "Unable to sign in.");
      setError(msg);
      push("error", msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-surface px-4 overflow-hidden">
      {/* restrained brand backdrop */}
      <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-brand-100/50 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-brand-50 blur-3xl" />

      <div className="relative w-full max-w-sm animate-fade-in">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white font-bold text-xl shadow-lift">
            YC
          </div>
          <h1 className="text-xl font-bold text-ink">Y-COMPS</h1>
          <p className="mt-1 text-sm text-slate-500">
            Yobe Campaign Operations &amp; Monitoring Platform
          </p>
        </div>

        <div className="rounded-2xl border border-surface-line bg-white p-6 shadow-card">
          <form onSubmit={submit} className="space-y-4">
            <Field label="Username" htmlFor="username">
              <Input
                id="username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
                placeholder="e.g. admin"
              />
            </Field>
            <Field label="Password" htmlFor="password">
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
              />
            </Field>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
            )}

            <Button type="submit" size="lg" className="w-full" loading={loading}>
              Sign in
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Authorised personnel only.
        </p>
      </div>
    </div>
  );
}
