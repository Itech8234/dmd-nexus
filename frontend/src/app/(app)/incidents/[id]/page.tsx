"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Siren, Send } from "lucide-react";
import { incidentsApi } from "@/lib/api";
import type { Incident, IncidentStatus } from "@/types";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { Select, Textarea, Field } from "@/components/ui/Field";
import { ErrorState, SkeletonRows } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime } from "@/lib/format";
import { quickStatusLabel, quickStatusTone } from "@/lib/dashboard";
import { severityTone, SEVERITY_LABELS } from "@/lib/format";
import { apiErrorMessage } from "@/lib/http";

const STATUS_ORDER: IncidentStatus[] = ["reported", "assigned", "investigating", "resolved", "closed"];

export default function IncidentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { push } = useToast();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [newStatus, setNewStatus] = useState<IncidentStatus>("reported");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setIncident(await incidentsApi.get(params.id));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (incident) setNewStatus(incident.status);
  }, [incident]);

  const submitUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!incident) return;
    setSubmitting(true);
    try {
      const updated = await incidentsApi.addUpdate(params.id, {
        new_status: newStatus,
        note: note || undefined,
      });
      setIncident(updated);
      setNote("");
      push("success", "Incident updated.");
      load();
    } catch (err) {
      push("error", apiErrorMessage(err, "Couldn't update incident."));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !incident) return <SkeletonRows rows={8} />;
  if (error && !incident) return <ErrorState onRetry={load} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 rounded-lg text-slate-500 hover:bg-surface-sunken">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-ink">{incident?.category}</h1>
          <p className="text-sm text-slate-500">Incident · {incident?.polling_unit_code}</p>
        </div>
        {incident && (
          <div className="ml-auto flex gap-2">
            <StatusPill tone={severityTone(incident.severity)} label={SEVERITY_LABELS[incident.severity]} />
            <StatusPill tone={quickStatusTone(incident.status)} label={quickStatusLabel(incident.status)} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card title="Description" bodyClassName="p-5">
            <p className="whitespace-pre-wrap text-sm text-slate-700">
              {incident?.description || "No description."}
            </p>
          </Card>

          <Card title="Update log" bodyClassName="divide-y divide-surface-line p-0">
            {incident && incident.updates && incident.updates.length > 0 ? (
              incident.updates
                .slice()
                .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
                .map((u) => (
                  <div key={u.id} className="px-5 py-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-ink">{u.author_name}</p>
                      <p className="text-xs text-slate-400">{formatDateTime(u.created_at)}</p>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{u.note || "Status updated."}</p>
                    {u.new_status && (
                      <div className="mt-1.5">
                        <StatusPill tone={quickStatusTone(u.new_status)} label={quickStatusLabel(u.new_status)} />
                      </div>
                    )}
                  </div>
                ))
            ) : (
              <p className="p-5 text-sm text-slate-500">No updates recorded yet.</p>
            )}
          </Card>
        </div>

        <Card title="Triage & update" bodyClassName="p-5">
          <form onSubmit={submitUpdate} className="space-y-4">
            <Field label="Status">
              <Select value={newStatus} onChange={(e) => setNewStatus(e.target.value as IncidentStatus)}>
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>{quickStatusLabel(s)}</option>
                ))}
              </Select>
            </Field>
            <Field label="Note">
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What's the latest on this incident?"
                rows={4}
              />
            </Field>
            <Button type="submit" className="w-full" loading={submitting}>
              <Send size={15} /> Update incident
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
