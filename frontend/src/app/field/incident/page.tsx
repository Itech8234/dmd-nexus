"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Siren, CloudOff } from "lucide-react";
import { incidentsApi, assignmentsApi } from "@/lib/api";
import { useConnectivity } from "@/lib/connectivity";
import { enqueueItem } from "@/lib/sync-store";
import type { Assignment, IncidentCategory, IncidentSeverity } from "@/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Select, Input, Textarea } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { SEVERITY_LABELS } from "@/lib/format";
import { apiErrorMessage } from "@/lib/http";

const SEVERITIES: IncidentSeverity[] = ["low", "medium", "high", "critical"];

export default function FieldIncidentPage() {
  const router = useRouter();
  const { online } = useConnectivity();
  const { push } = useToast();
  const [categories, setCategories] = useState<IncidentCategory[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [puId, setPuId] = useState("");
  const [category, setCategory] = useState("");
  const [severity, setSeverity] = useState<IncidentSeverity>("medium");
  const [description, setDescription] = useState("");
  const [capturedAt, setCapturedAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [cats, asg] = await Promise.all([
        incidentsApi.categories(),
        assignmentsApi.list({ status: "active", page_size: 100 } as never),
      ]);
      setCategories(cats || []);
      setAssignments(asg.results || []);
    } catch {
      push("error", "Couldn't load form options.");
    }
  }, [push]);

  useEffect(() => {
    load();
  }, [load]);

  const newId = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `cli-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!puId || !category) return;
    const payload = {
      polling_unit: puId,
      category,
      severity,
      description,
      device_captured_at: capturedAt ? new Date(capturedAt).toISOString() : new Date().toISOString(),
    };
    const cgid = newId();
    if (!online) {
      await enqueueItem({ client_generated_id: cgid, object_type: "incident", payload, created_at: new Date().toISOString() });
      push("info", "Saved offline. Will sync when back online.");
      router.push("/field/sync");
      return;
    }
    setSubmitting(true);
    try {
      await incidentsApi.create({ ...payload, client_generated_id: cgid });
      push("success", "Incident reported.");
      router.push("/field/my-reports");
    } catch (err) {
      push("error", apiErrorMessage(err, "Couldn't report incident."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader title="Report Incident" description="Describe a security or operational incident." />
      <Card bodyClassName="p-5">
        <form onSubmit={submit} className="space-y-4">
          {!online && (
            <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <CloudOff size={14} /> You&apos;re offline — this will be queued and synced later.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Polling unit">
              <Select value={puId} onChange={(e) => setPuId(e.target.value)} required>
                <option value="">Select your unit…</option>
                {assignments.map((a) => (
                  <option key={a.id} value={a.polling_unit}>#{a.polling_unit_code}</option>
                ))}
              </Select>
            </Field>
            <Field label="Severity">
              <Select value={severity} onChange={(e) => setSeverity(e.target.value as IncidentSeverity)}>
                {SEVERITIES.map((s) => <option key={s} value={s}>{SEVERITY_LABELS[s]}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Category">
            <Select value={category} onChange={(e) => setCategory(e.target.value)} required>
              <option value="">Select category…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Captured at">
            <Input type="datetime-local" value={capturedAt} onChange={(e) => setCapturedAt(e.target.value)} />
          </Field>
          <Field label="Description">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} required placeholder="What happened?" />
          </Field>
          <Button type="submit" className="w-full" size="lg" variant={severity === "critical" ? "danger" : "primary"} loading={submitting}>
            <Siren size={16} /> {online ? "Report incident" : "Save for sync"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
