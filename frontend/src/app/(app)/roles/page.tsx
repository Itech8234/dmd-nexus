"use client";

// Roles & Permissions — a read-only reference of the RBAC matrix actually
// enforced by the backend (accounts/permissions.py + per-viewset permission
// classes). The UI mirrors these rules; the server remains the authority.

import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { ROLE_LABELS } from "@/lib/format";
import type { Role } from "@/types";

const ROLES: Role[] = ["super_admin", "campaign_admin", "lga_coordinator", "ward_coordinator", "field_official"];

type Cell = "yes" | "scoped" | "no";

interface Capability {
  capability: string;
  note?: string;
  byRole: Record<Role, Cell>;
}

const MATRIX: Capability[] = [
  {
    capability: "View reports",
    note: "Field officials see their own submissions; coordinators see their area.",
    byRole: { super_admin: "yes", campaign_admin: "yes", lga_coordinator: "scoped", ward_coordinator: "scoped", field_official: "scoped" },
  },
  {
    capability: "Submit reports / incidents",
    byRole: { super_admin: "yes", campaign_admin: "yes", lga_coordinator: "yes", ward_coordinator: "yes", field_official: "yes" },
  },
  {
    capability: "Advance incident lifecycle",
    note: "New → Reviewing → Assigned → Investigating → Resolved → Closed.",
    byRole: { super_admin: "yes", campaign_admin: "yes", lga_coordinator: "yes", ward_coordinator: "yes", field_official: "no" },
  },
  {
    capability: "Assign officials to polling units",
    note: "One active official per unit; duplicates rejected with 409.",
    byRole: { super_admin: "yes", campaign_admin: "yes", lga_coordinator: "scoped", ward_coordinator: "scoped", field_official: "no" },
  },
  {
    capability: "View geography (LGAs, wards, polling units)",
    byRole: { super_admin: "yes", campaign_admin: "yes", lga_coordinator: "scoped", ward_coordinator: "scoped", field_official: "scoped" },
  },
  {
    capability: "Create / edit / deactivate users",
    note: "Only a Super Admin can create Super Admin accounts.",
    byRole: { super_admin: "yes", campaign_admin: "yes", lga_coordinator: "no", ward_coordinator: "no", field_official: "no" },
  },
  {
    capability: "View chat conversations",
    note: "Membership-scoped; role-aware visibility is enforced server-side.",
    byRole: { super_admin: "yes", campaign_admin: "yes", lga_coordinator: "yes", ward_coordinator: "yes", field_official: "yes" },
  },
  {
    capability: "Review SMS fallback queue",
    byRole: { super_admin: "yes", campaign_admin: "yes", lga_coordinator: "no", ward_coordinator: "no", field_official: "no" },
  },
  {
    capability: "View audit logs",
    byRole: { super_admin: "yes", campaign_admin: "yes", lga_coordinator: "no", ward_coordinator: "no", field_official: "no" },
  },
  {
    capability: "View command centre & analytics",
    note: "Values are scoped to the viewer's geographic area.",
    byRole: { super_admin: "yes", campaign_admin: "yes", lga_coordinator: "scoped", ward_coordinator: "scoped", field_official: "no" },
  },
];

const CELL_LABEL: Record<Cell, { text: string; className: string }> = {
  yes: { text: "Full", className: "bg-emerald-50 text-emerald-700 dark:text-emerald-300" },
  scoped: { text: "Scoped", className: "bg-blue-50 text-blue-700 dark:text-blue-300" },
  no: { text: "—", className: "bg-slate-100 text-slate-400" },
};

export default function RolesPage() {
  return (
    <div>
      <PageHeader
        title="Roles & Permissions"
        description="Reference of the access model enforced by the backend. The server is the single source of truth — the UI only mirrors it."
      />
      <Card bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-line text-left text-xs text-slate-500">
                <th className="px-5 py-3 font-medium">Capability</th>
                {ROLES.map((r) => (
                  <th key={r} className="px-4 py-3 text-center font-medium">
                    {ROLE_LABELS[r] || r}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-line">
              {MATRIX.map((row) => (
                <tr key={row.capability} className="hover:bg-surface-sunken/40">
                  <td className="px-5 py-3">
                    <p className="font-medium text-ink">{row.capability}</p>
                    {row.note && <p className="mt-0.5 text-xs text-slate-400">{row.note}</p>}
                  </td>
                  {ROLES.map((r) => {
                    const cell = CELL_LABEL[row.byRole[r]];
                    return (
                      <td key={r} className="px-4 py-3 text-center">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${cell.className}`}>
                          {cell.text}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card bodyClassName="p-5" className="mt-5">
        <p className="flex items-start gap-2 text-xs text-slate-500">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-600" />
          <span>
            <strong className="text-ink">Scoped</strong> means the capability exists but is restricted to the
            user&apos;s assigned LGA/ward (or, for field officials, their own records and active assignment).
            These boundaries are enforced by Django REST Framework permission classes and query-set scoping —
            attempting an unauthorized action from any client returns 403.
          </span>
        </p>
      </Card>
    </div>
  );
}
