"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { officialsApi } from "@/lib/api";
import type { Official } from "@/types";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { ErrorState, SkeletonRows } from "@/components/ui/States";
import { formatDateTime } from "@/lib/format";

export default function OfficialDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [official, setOfficial] = useState<Official | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setOfficial(await officialsApi.get(params.id));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !official) return <SkeletonRows rows={8} />;
  if (error && !official) return <ErrorState onRetry={load} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 rounded-lg text-slate-500 hover:bg-surface-sunken">
          <ArrowLeft size={18} />
        </button>
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-700 font-semibold">
          {(official?.full_name?.[0] || "?").toUpperCase()}
        </span>
        <div>
          <h1 className="text-xl font-bold text-ink">{official?.full_name}</h1>
          <p className="text-sm text-slate-500">{official?.official_reference}</p>
        </div>
        {official && (
          <div className="ml-auto">
            <StatusPill tone={official.id_verified ? "success" : "warning"} label={official.id_verified ? "Verified" : "Unverified"} />
          </div>
        )}
      </div>

      <Card title="Profile" bodyClassName="p-5">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <dt className="text-xs text-slate-500">Reference</dt>
            <dd className="font-mono text-sm font-medium text-ink">{official?.official_reference}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Registered</dt>
            <dd className="text-sm font-medium text-ink">{formatDateTime(official?.created_at)}</dd>
          </div>
          {official?.notes && (
            <div className="sm:col-span-2">
              <dt className="text-xs text-slate-500">Notes</dt>
              <dd className="text-sm text-ink">{official.notes}</dd>
            </div>
          )}
        </dl>
      </Card>
    </div>
  );
}
