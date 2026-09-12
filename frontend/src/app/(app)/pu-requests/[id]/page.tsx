"use client";

// Detail + review surface for a single polling unit request. Privileged
// admins can approve (materialising the official PollingUnit) or reject
// (with a mandatory note); everyone else gets a read-only view.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CheckCircle2, Map, MapPinPlus, XCircle } from "lucide-react";
import { puRequestsApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusPill, type Tone } from "@/components/ui/StatusPill";
import { Field, Textarea } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { apiErrorMessage } from "@/lib/http";
import { formatDateTime } from "@/lib/format";
import type { PuRequestStatus } from "@/types";

const STATUS_LABELS: Record<PuRequestStatus, string> = {
  pending: "Pending Review",
  approved: "Approved",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

const STATUS_TONE: Record<PuRequestStatus, Tone> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  withdrawn: "neutral",
};

type PollingUnitRequestDetail = {
  id: string;
  official_code: string;
  name: string;
  status: PuRequestStatus;
  ward_name: string;
  lga_name: string;
  location_description: string;
  latitude: string | null;
  longitude: string | null;
  source_note: string;
  submitted_by_name: string;
  submitted_at: string;
  reviewed_by_name: string;
  reviewed_at: string | null;
  review_note: string;
  created_polling_unit: string | null;
  created_polling_unit_code: string;
};

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{value}</dd>
    </div>
  );
}

export default function PURequestDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { isPrivileged } = useAuth();
  const { push } = useToast();

  const [req, setReq] = useState<PollingUnitRequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setReq(await puRequestsApi.get(id));
    } catch {
      push("error", "Couldn't load this request.");
    } finally {
      setLoading(false);
    }
  }, [id, push]);

  useEffect(() => {
    load();
  }, [load]);

  const review = async (kind: "approve" | "reject") => {
    if (!id) return;
    if (kind === "reject" && !note.trim()) {
      push("error", "A note is required when rejecting.");
      return;
    }
    setBusy(kind);
    try {
      const updated =
        kind === "approve" ? await puRequestsApi.approve(id) : await puRequestsApi.reject(id, note.trim());
      setReq(updated);
      setNote("");
      push(
        "success",
        kind === "approve" ? "Approved — official polling unit created." : "Request rejected.",
      );
    } catch (err) {
      push("error", apiErrorMessage(err, "Review failed."));
    } finally {
      setBusy(null);
    }
  };

  if (loading || !req) {
    return (
      <div>
        <PageHeader title="PU Request" description="Field proposal for a new polling unit." />
        <Card bodyClassName="p-8 text-center text-sm text-slate-500">
          {loading ? "Loading…" : "This request doesn't exist or you don't have access to it."}
        </Card>
      </div>
    );
  }

  const pending = req.status === "pending";

  return (
    <div className="space-y-5">
      <PageHeader
        title={`#${req.official_code} — ${req.name}`}
        description="Field proposal for a new polling unit."
        actions={<StatusPill tone={STATUS_TONE[req.status]} label={STATUS_LABELS[req.status]} />}
      />

      <Card title="Proposal" icon={<MapPinPlus size={15} className="text-amber-500" />} bodyClassName="p-5 space-y-4">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Detail label="Ward / LGA" value={`${req.ward_name}, ${req.lga_name}`} />
          <Detail label="Official code" value={`#${req.official_code}`} />
          <Detail label="Location description" value={req.location_description || "—"} />
          <Detail
            label="Coordinates"
            value={req.latitude && req.longitude ? `${req.latitude}, ${req.longitude}` : "Not provided"}
          />
          <Detail label="Submitted by" value={req.submitted_by_name || "Unknown"} />
          <Detail label="Submitted at" value={formatDateTime(req.submitted_at)} />
          {req.source_note && <Detail label="Source note" value={req.source_note} />}
        </dl>

        {req.latitude && req.longitude && (
          <Link
            href="/map"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700"
          >
            <Map size={14} /> View on live map
          </Link>
        )}
      </Card>

      <Card title="Review" bodyClassName="p-5 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Detail label="Reviewed by" value={req.reviewed_by_name || "—"} />
          <Detail label="Reviewed at" value={formatDateTime(req.reviewed_at)} />
        </div>
        <Detail label="Decision note" value={req.review_note || "—"} />

        {req.status === "approved" && req.created_polling_unit_code && (
          <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 size={14} />
            Materialised as official PU #{req.created_polling_unit_code} — now visible in the registry and on the
            live map.
          </p>
        )}

        {isPrivileged && pending && (
          <div className="space-y-3 border-t border-surface-line pt-4">
            <Field label="Review note" hint="Required when rejecting">
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="e.g. Verified via field visit — ward boundaries confirmed…"
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => review("approve")} loading={busy === "approve"}>
                <CheckCircle2 size={16} /> Approve &amp; create PU
              </Button>
              <Button variant="danger" onClick={() => review("reject")} loading={busy === "reject"}>
                <XCircle size={16} /> Reject
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}