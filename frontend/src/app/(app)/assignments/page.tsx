"use client";

import { useCallback, useEffect, useState } from "react";
import { UserPlus, MapPin, User } from "lucide-react";
import { assignmentsApi } from "@/lib/api";
import { usePagedList } from "@/hooks/usePagedList";
import type { Assignment, AssignmentOptionOfficial, AssignmentOptionPU } from "@/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { Pagination } from "@/components/ui/Pagination";
import { Modal } from "@/components/ui/Overlay";
import { Field, Select, Input } from "@/components/ui/Field";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime, timeAgo } from "@/lib/format";
import { apiErrorMessage } from "@/lib/http";

export default function AssignmentsPage() {
  const { push } = useToast();
  const [showModal, setShowModal] = useState(false);

  const paged = usePagedList<Assignment>(
    (page, pageSize) => assignmentsApi.list({ page, page_size: pageSize } as never),
    [],
    { pageSize: 50 },
  );

  return (
    <div>
      <PageHeader
        title="Assignments"
        description="Match field officials to polling units."
        actions={
          <Button onClick={() => setShowModal(true)}>
            <UserPlus size={16} /> New assignment
          </Button>
        }
      />

      <Card bodyClassName="p-0">
        {paged.error && <ErrorState onRetry={paged.reload} />}
        {paged.loading && !paged.data.length && <SkeletonRows rows={8} />}
        {!paged.loading && !paged.data.length && (
          <EmptyState
            icon={<UserPlus size={22} />}
            title="No assignments yet"
            description="Assign officials to polling units to begin monitoring."
          />
        )}

        {!paged.loading && paged.data.length > 0 && (
          <ul className="divide-y divide-surface-line">
            {paged.data.map((a: Assignment) => (
              <li key={a.id} className="flex items-center gap-3 px-5 py-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:text-emerald-400">
                  <User size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{a.official_name}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {a.polling_unit_code} · assigned {timeAgo(a.assigned_at)}
                  </span>
                </span>
                <StatusPill
                  tone={a.status === "active" ? "success" : a.status === "ended" ? "neutral" : "warning"}
                  label={a.status}
                />
              </li>
            ))}
          </ul>
        )}
        <Pagination page={paged.page} totalPages={paged.totalPages} count={paged.count} pageSize={50} onChange={paged.goTo} />
      </Card>

      <AssignModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onDone={() => {
          setShowModal(false);
          paged.reload();
        }}
        toast={push}
      />
    </div>
  );
}

function AssignModal({
  open,
  onClose,
  onDone,
  toast,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  toast: (kind: "success" | "error" | "info" | "warning", message: string) => void;
}) {
  const [officials, setOfficials] = useState<AssignmentOptionOfficial[]>([]);
  const [units, setUnits] = useState<AssignmentOptionPU[]>([]);
  const [official, setOfficial] = useState("");
  const [unit, setUnit] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadOptions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await assignmentsApi.options();
      setOfficials(res.officials || []);
      setUnits(res.polling_units || []);
    } catch (err) {
      toast("error", apiErrorMessage(err, "Couldn't load assignment options."));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (open) {
      setOfficial("");
      setUnit("");
      loadOptions();
    }
  }, [open, loadOptions]);

  const unassignedUnits = units
    .filter((u) => !u.assigned_official)
    .sort((a, b) => a.lga_name.localeCompare(b.lga_name) || a.ward_name.localeCompare(b.ward_name));

  const selectedUnit = units.find((u) => u.id === unit);
  const unitAlreadyAssigned = !!selectedUnit?.assigned_official;

  const canSubmit = official && unit && !unitAlreadyAssigned;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await assignmentsApi.create({ official, polling_unit: unit });
      toast("success", "Assignment created.");
      onDone();
    } catch (err) {
      toast("error", apiErrorMessage(err, "Couldn't create assignment."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New assignment"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit} loading={submitting}>Create</Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-slate-500">
          Assign a field official to a polling unit. Unassigned units are listed first.
        </p>
        <Field label="Field official">
          <Select value={official} onChange={(e) => setOfficial(e.target.value)}>
            <option value="">Select official…</option>
            {officials.map((o) => (
              <option key={o.id} value={o.id}>
                {o.full_name} ({o.official_reference})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Polling unit">
          {unitAlreadyAssigned && selectedUnit?.assigned_official && (
            <p className="text-[11px] text-amber-700 dark:text-amber-300">
              Already assigned to {selectedUnit.assigned_official.name} — end that assignment first.
            </p>
          )}
          {loading ? (
            <SkeletonRows rows={3} height="h-8" />
          ) : (
            <Select value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="">Select unit…</option>
              {unassignedUnits.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.official_code} · {u.name} ({u.lga_name})
                </option>
              ))}
              {units.filter((u) => u.assigned_official).map((u) => (
                <option key={u.id} value={u.id} disabled>
                  {u.official_code} · assigned
                </option>
              ))}
            </Select>
          )}
        </Field>
        {selectedUnit && !unitAlreadyAssigned && (
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <MapPin size={13} className="text-slate-400" />
            #{selectedUnit.official_code} · {selectedUnit.ward_name}, {selectedUnit.lga_name}
          </p>
        )}
      </div>
    </Modal>
  );
}
