"use client";

// User management — full CRUD for privileged admins, mirroring the backend's
// UserViewSet (list/retrieve coordinator+, create/update privileged; only a
// Super Admin can create Super Admins — enforced server-side and reflected
// in the UI).

import { useCallback, useEffect, useMemo, useState } from "react";
import { UserPlus, Users as UsersIcon, Pencil, Search } from "lucide-react";
import { geographyApi, usersApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Overlay";
import { Field, Input, Select } from "@/components/ui/Field";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime, ROLE_LABELS } from "@/lib/format";
import { apiErrorMessage } from "@/lib/http";
import type { LGA, Role, UserAdmin, Ward } from "@/types";

const ROLES: Role[] = ["super_admin", "campaign_admin", "lga_coordinator", "ward_coordinator", "field_official"];

export default function UsersPage() {
  const { user: me } = useAuth();
  const isPrivileged = me?.role === "super_admin" || me?.role === "campaign_admin";
  const isSuper = me?.role === "super_admin";

  const [users, setUsers] = useState<UserAdmin[] | null>(null);
  const [error, setError] = useState(false);
  const [roleFilter, setRoleFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<UserAdmin | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await usersApi.list({
        page_size: 200,
        role: roleFilter || undefined,
        is_active: activeFilter === "" ? undefined : activeFilter === "true",
      } as never);
      setUsers(res.results || []);
    } catch {
      setError(true);
    }
  }, [roleFilter, activeFilter]);

  useEffect(() => {
    load();
  }, [load]);

  // The users endpoint has no server-side search — filter the (admin-scoped)
  // result set client-side on name/username/email.
  const filtered = useMemo(() => {
    const q = searchInput.trim().toLowerCase();
    if (!q || !users) return users;
    return users.filter((u) =>
      `${u.first_name} ${u.last_name} ${u.username} ${u.email}`.toLowerCase().includes(q),
    );
  }, [users, searchInput]);

  return (
    <div>
      <PageHeader
        title="Users"
        description="Platform accounts, roles and geographic scoping."
        actions={
          isPrivileged && (
            <Button onClick={() => setShowCreate(true)}>
              <UserPlus size={16} /> New user
            </Button>
          )
        }
      />

      <Card bodyClassName="p-4" className="mb-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Search" htmlFor="u-search">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                id="u-search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Name, username or email…"
                className="pl-8"
              />
            </div>
          </Field>
          <Field label="Role" htmlFor="u-role">
            <Select id="u-role" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="">All roles</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r] || r}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status" htmlFor="u-active">
            <Select id="u-active" value={activeFilter} onChange={(e) => setActiveFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option value="true">Active</option>
              <option value="false">Deactivated</option>
            </Select>
          </Field>
        </div>
      </Card>

      <Card bodyClassName="p-0">
        {error && <ErrorState onRetry={load} />}
        {users === null && !error && <SkeletonRows rows={8} />}
        {filtered && filtered.length === 0 && !error && (
          <EmptyState
            icon={<UsersIcon size={22} />}
            title="No users found"
            description="Adjust the filters, or onboard new field personnel with “New user”."
          />
        )}
        {filtered && filtered.length > 0 && (
          <ul className="divide-y divide-surface-line">
            {filtered.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700 dark:text-brand-300">
                  {(u.first_name?.[0] || u.username?.[0] || "?").toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {u.first_name} {u.last_name}
                    {u.id === me?.id && <span className="text-slate-400"> (you)</span>}
                    {!u.is_active && (
                      <span className="ml-2 text-xs font-medium text-red-600 dark:text-red-400">Deactivated</span>
                    )}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {u.username} · {u.email || "—"} · joined {formatDateTime(u.created_at)}
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                  {ROLE_LABELS[u.role] || u.role}
                </span>
                {isPrivileged && (
                  <button
                    onClick={() => setEditing(u)}
                    className="flex items-center gap-1.5 rounded-lg border border-surface-line px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-surface-sunken"
                    aria-label={`Manage ${u.username}`}
                  >
                    <Pencil size={13} /> Manage
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {showCreate && (
        <UserFormModal
          mode="create"
          isSuper={isSuper}
          onClose={() => setShowCreate(false)}
          onDone={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}
      {editing && (
        <UserFormModal
          mode="edit"
          isSuper={isSuper}
          user={editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

interface UserFormProps {
  mode: "create" | "edit";
  isSuper: boolean;
  user?: UserAdmin;
  onClose: () => void;
  onDone: () => void;
}

function UserFormModal({ mode, isSuper, user, onClose, onDone }: UserFormProps) {
  const { push } = useToast();
  const [lgas, setLgas] = useState<LGA[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    username: user?.username ?? "",
    password: "",
    first_name: user?.first_name ?? "",
    last_name: user?.last_name ?? "",
    email: user?.email ?? "",
    phone_number: user?.phone_number ?? "",
    role: (user?.role ?? "field_official") as Role,
    scoped_lga: user?.scoped_lga ?? "",
    scoped_ward: user?.scoped_ward ?? "",
    is_active: user?.is_active ?? true,
    is_active_field_user: user?.is_active_field_user ?? true,
  });

  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    geographyApi
      .lgas()
      .then((res) => setLgas(Array.isArray(res) ? res : []))
      .catch(() => setLgas([]));
  }, []);

  useEffect(() => {
    if (!form.scoped_lga) {
      setWards([]);
      return;
    }
    geographyApi
      .wards(form.scoped_lga)
      .then((res) => setWards(Array.isArray(res) ? res : []))
      .catch(() => setWards([]));
  }, [form.scoped_lga]);

  // Roles the current admin may grant: only Super Admins can create/assign
  // Super Admins (mirrors the backend check in UserAdminSerializer.create).
  const assignableRoles = isSuper ? ROLES : ROLES.filter((r) => r !== "super_admin");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "create") {
        const payload: Record<string, unknown> = { ...form };
        if (!payload.password) delete payload.password;
        if (!payload.scoped_lga) delete payload.scoped_lga;
        if (!payload.scoped_ward) delete payload.scoped_ward;
        await usersApi.create(payload);
        push("success", "User created.");
      } else if (user) {
        const payload: Record<string, unknown> = {
          first_name: form.first_name,
          last_name: form.last_name,
          email: form.email,
          phone_number: form.phone_number,
          role: form.role,
          scoped_lga: form.scoped_lga || null,
          scoped_ward: form.scoped_ward || null,
          is_active: form.is_active,
          is_active_field_user: form.is_active_field_user,
        };
        if (form.password) payload.password = form.password;
        await usersApi.update(user.id, payload);
        push("success", "User updated.");
      }
      onDone();
    } catch (err) {
      push("error", apiErrorMessage(err, "Couldn't save user."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === "create" ? "Create user" : `Manage — ${user?.username}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={submitting}>
            {mode === "create" ? "Create" : "Save changes"}
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit} className="space-y-4">
        {mode === "create" && (
          <>
            <Field label="Username">
              <Input value={form.username} onChange={(e) => set("username", e.target.value)} required />
            </Field>
            <Field label="Password" hint="Minimum 10 characters. Leave blank to set an unusable password.">
              <Input
                type="password"
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
                minLength={10}
              />
            </Field>
          </>
        )}
        {mode === "edit" && (
          <Field label="Reset password" hint="Leave blank to keep the current password.">
            <Input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} minLength={10} />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name">
            <Input value={form.first_name} onChange={(e) => set("first_name", e.target.value)} />
          </Field>
          <Field label="Last name">
            <Input value={form.last_name} onChange={(e) => set("last_name", e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Phone">
            <Input value={form.phone_number} onChange={(e) => set("phone_number", e.target.value)} />
          </Field>
        </div>
        <Field label="Role">
          <Select value={form.role} onChange={(e) => set("role", e.target.value as Role)}>
            {assignableRoles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r] || r}
              </option>
            ))}
          </Select>
        </Field>
        {(form.role === "lga_coordinator" || form.role === "ward_coordinator") && (
          <Field label="Scoped LGA" hint="Coordinators only see data inside their scoped area.">
            <Select value={form.scoped_lga} onChange={(e) => set("scoped_lga", e.target.value)}>
              <option value="">— None —</option>
              {lgas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {form.role === "ward_coordinator" && (
          <Field label="Scoped ward">
            <Select
              value={form.scoped_ward}
              onChange={(e) => set("scoped_ward", e.target.value)}
              disabled={!form.scoped_lga}
            >
              <option value="">— None —</option>
              {wards.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {mode === "edit" && (
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => set("is_active", e.target.checked)}
              className="h-4 w-4 rounded border-surface-line"
            />
            Account active (deactivated users cannot sign in)
          </label>
        )}
      </form>
    </Modal>
  );
}
