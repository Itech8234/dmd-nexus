"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudUpload, CloudOff, RefreshCw, CheckCircle2 } from "lucide-react";
import { useConnectivity } from "@/lib/connectivity";
import { listQueue, clearQueue } from "@/lib/sync-store";
import type { QueuedItem } from "@/lib/sync-store";
import { useSync } from "@/hooks/useSync";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/States";
import { formatDateTime } from "@/lib/format";

export default function FieldSyncPage() {
  const router = useRouter();
  const { online } = useConnectivity();
  const { pending, syncing, flush } = useSync();
  const [items, setItems] = useState<QueuedItem[]>([]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const q = await listQueue();
        if (mounted) setItems(q);
      } catch {
        /* noop */
      }
    };
    load();
    const t = setInterval(load, 5000);
    return () => {
      mounted = false;
      clearInterval(t);
    };
  }, [pending]);

  return (
    <div>
      <PageHeader title="Sync" description="Manage your offline queue." />
      <div className="space-y-4">
        <Card bodyClassName="p-5">
          <div className="flex items-center gap-3">
            {online ? <CloudUpload size={22} className="text-emerald-600" /> : <CloudOff size={22} className="text-red-500" />}
            <div className="flex-1">
              <p className="text-sm font-semibold text-ink">{online ? "Online" : "Offline"}</p>
              <p className="text-xs text-slate-500">
                {online ? "Connected to the platform." : "Working offline — changes are queued."}
              </p>
            </div>
          </div>
        </Card>

        <Card title={`Offline queue (${items.length})`} bodyClassName="p-0">
          {items.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 size={22} />}
              title="All caught up"
              description="No items waiting to sync."
            />
          ) : (
            <ul className="divide-y divide-surface-line">
              {items.map((it) => (
                <li key={it.client_generated_id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-ink capitalize">{it.object_type}</p>
                    <p className="text-[11px] text-slate-400">{formatDateTime(it.created_at)}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!online}
                    onClick={() => void flush()}
                  >
                    Sync
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="secondary"
            loading={syncing}
            disabled={!online || items.length === 0}
            onClick={() => void flush()}
          >
            <RefreshCw size={15} /> Sync now
          </Button>
          <Button
            variant="ghost"
            disabled={items.length === 0}
            onClick={() => { void clearQueue(); setItems([]); }}
          >
            Clear queue
          </Button>
        </div>
      </div>
    </div>
  );
}
