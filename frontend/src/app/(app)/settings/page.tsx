"use client";

// Settings — administration and platform preferences. User management lives on
// its own /users page; SMS review queue and app preferences live here.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Info, MessageSquareText, MoonStar, SignalLow, UserPlus, Users as UsersIcon, X, Zap } from "lucide-react";
import { smsApi } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { ThemeSegmented } from "@/components/ui/ThemeToggle";
import { usePrefs } from "@/lib/prefs";
import { formatDateTime } from "@/lib/format";
import { apiErrorMessage } from "@/lib/http";
import type { SmsPendingSubmission } from "@/types";

type Tab = "preferences" | "sms" | "about";

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("preferences");

  const tabs: { id: Tab; label: string; icon: typeof Info }[] = [
    { id: "preferences", label: "Preferences", icon: MoonStar },
    { id: "sms", label: "SMS Queue", icon: MessageSquareText },
    { id: "about", label: "About", icon: Info },
  ];

  return (
    <div>
      <PageHeader title="Settings" description="Administration and platform configuration." />
      <div className="mb-6 flex gap-2 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
              tab === t.id
                ? "bg-brand-600 text-white"
                : "bg-white text-slate-600 border border-surface-line hover:bg-surface-sunken"
            }`}
          >
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>
      {tab === "preferences" && <PreferencesTab />}
      {tab === "sms" && <SmsTab />}
      {tab === "about" && <AboutTab />}
    </div>
  );
}

function PreferencesTab() {
  const { lowData, setLowData } = usePrefs();

  return (
    <div className="space-y-5">
      <Card title="Appearance" bodyClassName="p-5">
        <p className="text-sm text-slate-500">
          Choose light, dark, or follow your device. Your choice is remembered on this device.
        </p>
        <div className="mt-3">
          <ThemeSegmented />
        </div>
      </Card>

      <Card title="Low Data Mode" bodyClassName="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
              <SignalLow size={15} className="text-amber-600" /> Reduce data usage
            </p>
            <p className="mt-1 max-w-md text-xs text-slate-500">
              Pauses WebSocket-driven refreshes and non-essential polling. Report synchronization from the
              field always takes priority and is never disabled.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={lowData}
            onClick={() => setLowData(!lowData)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              lowData ? "bg-brand-600" : "bg-slate-300"
            }`}
            aria-label="Toggle Low Data Mode"
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                lowData ? "translate-x-[22px]" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </Card>

      <Card title="Administration" bodyClassName="p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Link
            href="/users"
            className="flex items-center gap-3 rounded-xl border border-surface-line p-4 hover:bg-surface-sunken"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <UsersIcon size={18} />
            </span>
            <span>
              <span className="block text-sm font-semibold text-ink">Manage users</span>
              <span className="block text-xs text-slate-500">Accounts, roles and scoping</span>
            </span>
          </Link>
          <Link
            href="/audit"
            className="flex items-center gap-3 rounded-xl border border-surface-line p-4 hover:bg-surface-sunken"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
              <Zap size={18} />
            </span>
            <span>
              <span className="block text-sm font-semibold text-ink">Audit logs</span>
              <span className="block text-xs text-slate-500">Who changed what, and when</span>
            </span>
          </Link>
        </div>
      </Card>
    </div>
  );
}

function SmsTab() {
  const { push } = useToast();
  const [items, setItems] = useState<SmsPendingSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await smsApi.pending({ page_size: 100, status: "pending" } as never);
      setItems(res.results || []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const action = async (id: string, approve: boolean) => {
    try {
      if (approve) await smsApi.approve(id);
      else await smsApi.reject(id);
      push("success", approve ? "SMS submission approved." : "SMS submission rejected.");
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch (err) {
      push("error", apiErrorMessage(err, "Action failed."));
    }
  };

  return (
    <Card bodyClassName="p-0">
      {error && <ErrorState onRetry={load} />}
      {loading && !items.length && <SkeletonRows rows={6} />}
      {!loading && !items.length && (
        <EmptyState
          icon={<MessageSquareText size={22} />}
          title="No pending SMS submissions"
          description="SMS-based field submissions awaiting approval will appear here."
        />
      )}
      {!loading && items.length > 0 && (
        <ul className="divide-y divide-surface-line">
          {items.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium capitalize text-ink">{s.message_type}</p>
                <p className="truncate text-xs text-slate-500">
                  #{s.polling_unit_code} · official {s.official.slice(0, 8)}
                </p>
                <p className="text-[10px] text-slate-400">{formatDateTime(s.created_at)}</p>
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => action(s.id, true)}
                  className="rounded-lg bg-emerald-50 p-2 text-emerald-600 hover:bg-emerald-100"
                  aria-label="Approve"
                >
                  <Check size={15} />
                </button>
                <button
                  onClick={() => action(s.id, false)}
                  className="rounded-lg bg-red-50 p-2 text-red-600 hover:bg-red-100"
                  aria-label="Reject"
                >
                  <X size={15} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function AboutTab() {
  return (
    <div className="space-y-5">
      <Card bodyClassName="p-6">
        <h3 className="text-sm font-semibold text-ink">
          Y-COMPS — Yobe Campaign Operations &amp; Monitoring Platform
        </h3>
        <p className="mt-2 text-sm text-slate-600">
          DMD Y-COMPS provides real-time field reporting, incident triage, official assignment, secure
          chat, offline-first sync and audit logging for campaign operations across Yobe State.
        </p>
        <dl className="mt-5 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-500">Version</dt>
            <dd className="font-mono">1.1.0</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Data</dt>
            <dd className="font-mono">Real backend (Django DRF)</dd>
          </div>
        </dl>
      </Card>
      <Card bodyClassName="p-5">
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <UserPlus size={13} />
          Need to onboard field personnel? Use <Link href="/users" className="font-medium text-brand-600 hover:underline">Users → New user</Link>.
        </p>
      </Card>
    </div>
  );
}
