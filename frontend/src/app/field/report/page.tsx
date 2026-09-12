"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, FileText, CloudOff, X } from "lucide-react";
import { reportsApi, assignmentsApi, apiUpload } from "@/lib/api";
import { useConnectivity } from "@/lib/connectivity";
import { enqueueItem } from "@/lib/sync-store";
import type { Assignment, ReportCategory, OperationalStatus } from "@/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Select, Input, Textarea } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { OPERATIONAL_STATUS_LABELS } from "@/lib/format";
import { apiErrorMessage } from "@/lib/http";

const STATUS_OPTIONS: OperationalStatus[] = [
  "active_reporting",
  "recently_reported",
  "report_overdue",
  "incident_reported",
  "awaiting_assignment",
  "official_offline",
];

interface AttachmentPreview {
  file: File;
  preview: string;
  id: string;
}

export default function FieldReportPage() {
  const router = useRouter();
  const { online } = useConnectivity();
  const { push } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [categories, setCategories] = useState<ReportCategory[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [puId, setPuId] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<OperationalStatus>("active_reporting");
  const [narrative, setNarrative] = useState("");
  const [capturedAt, setCapturedAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [submitting, setSubmitting] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentPreview[]>([]);

  const load = useCallback(async () => {
    try {
      const [cats, asg] = await Promise.all([
        reportsApi.categories(),
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newAttachments: AttachmentPreview[] = [];
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) {
        push("error", `${file.name} is not an image file.`);
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        push("error", `${file.name} exceeds 10MB limit.`);
        return;
      }
      const id = newId();
      const preview = URL.createObjectURL(file);
      newAttachments.push({ file, preview, id });
    });
    setAttachments((prev) => [...prev, ...newAttachments]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const att = prev.find((a) => a.id === id);
      if (att) URL.revokeObjectURL(att.preview);
      return prev.filter((a) => a.id !== id);
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!puId || !category) return;
    const payload = {
      polling_unit: puId,
      category,
      operational_status: status,
      narrative,
      device_captured_at: capturedAt ? new Date(capturedAt).toISOString() : new Date().toISOString(),
    };
    const cgid = newId();

    if (!online) {
      await enqueueItem({ client_generated_id: cgid, object_type: "report", payload, created_at: new Date().toISOString() });
      push("info", "Saved offline. Will sync when back online.");
      router.push("/field/sync");
      return;
    }

    setSubmitting(true);
    try {
      const report = await reportsApi.create({ ...payload, client_generated_id: cgid });
      // Upload attachments if any
      if (attachments.length > 0 && report?.id) {
        for (const att of attachments) {
          const form = new FormData();
          form.append("report", report.id);
          form.append("file", att.file);
          form.append("priority", "2");
          try {
            await apiUpload(`/report-attachments/`, form);
          } catch {
            push("warning", `Failed to upload ${att.file.name}`);
          }
        }
      }
      push("success", "Report submitted.");
      router.push("/field/my-reports");
    } catch (err) {
      push("error", apiErrorMessage(err, "Couldn't submit report."));
    } finally {
      setSubmitting(false);
      attachments.forEach((a) => URL.revokeObjectURL(a.preview));
      setAttachments([]);
    }
  };

  return (
    <div>
      <PageHeader title="Submit Report" description="Log status for one of your polling units." />
      <Card bodyClassName="p-5">
        <form onSubmit={submit} className="space-y-4">
          {!online && (
            <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
              <CloudOff size={14} /> You&apos;re offline — this will be queued and synced later.
            </p>
          )}
          <Field label="Polling unit">
            <Select value={puId} onChange={(e) => setPuId(e.target.value)} required>
              <option value="">Select your unit…</option>
              {assignments.map((a) => (
                <option key={a.id} value={a.polling_unit}>#{a.polling_unit_code}</option>
              ))}
              {assignments.length === 0 && <option value="">No active assignments</option>}
            </Select>
          </Field>
          <Field label="Category">
            <Select value={category} onChange={(e) => setCategory(e.target.value)} required>
              <option value="">Select category…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Operational status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as OperationalStatus)}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{OPERATIONAL_STATUS_LABELS[s]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Captured at" hint="Defaults to now">
            <Input type="datetime-local" value={capturedAt} onChange={(e) => setCapturedAt(e.target.value)} />
          </Field>
          <Field label="Narrative">
            <Textarea value={narrative} onChange={(e) => setNarrative(e.target.value)} rows={5} required placeholder="Describe the situation on the ground…" />
          </Field>

          {/* Image Attachments */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-ink">Supporting Images <span className="text-slate-400 font-normal">(optional)</span></label>
            <p className="text-xs text-slate-500">Attach photos to support your report. Max 10MB per image.</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              id="report-attachments"
            />
            <div className="flex flex-wrap gap-2">
              {attachments.map((att) => (
                <div key={att.id} className="relative h-20 w-20 overflow-hidden rounded-lg border border-surface-line">
                  <img src={att.preview} alt={att.file.name} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeAttachment(att.id)}
                    className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-red-600"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-surface-line text-slate-400 hover:border-brand-500 hover:text-brand-600 transition-colors"
              >
                <Camera size={18} />
                <span className="text-[10px] font-medium">Add Photo</span>
              </button>
            </div>
          </div>

          <Button type="submit" className="w-full" size="lg" loading={submitting}>
            <FileText size={16} /> {online ? "Submit report" : "Save for sync"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
