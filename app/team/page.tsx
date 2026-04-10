"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import AppLayout from "@/components/Layout";
import { Avatar, Modal, FormField, HubInput, HubSelect, ConfirmModal, useToast, ToastList, EmptyState } from "@/components/ui/shared";
import ProfileDrawer from "@/components/ProfileDrawer";
import MultiDeptSelect from "@/components/MultiDeptSelect";
import type { TeamMember, Department, UserRole } from "@/lib/types";

const STATUSES = ["active", "away", "busy", "offline"];
// Base role options shown in the add/edit form. The super_admin row is
// appended at runtime ONLY for super_admin viewers — see the ROLES const
// inside the component.
const BASE_ROLE_OPTIONS: { value: Exclude<UserRole, "super_admin" | "leader">; label: string }[] = [
  { value: "admin",   label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "lead",    label: "Lead" },
  { value: "member",  label: "Member" },
];
const ROLE_BG: Record<string, string> = {
  super_admin: "var(--danger-bg)",
  admin:       "var(--violet-bg)",
  manager:     "var(--warning-bg)",
  leader:      "var(--warning-bg)",
  lead:        "var(--accent-bg)",
  member:      "var(--accent-bg)",
};
const ROLE_FG: Record<string, string> = {
  super_admin: "var(--danger)",
  admin:       "var(--violet)",
  manager:     "var(--warning)",
  leader:      "var(--warning)",
  lead:        "var(--accent)",
  member:      "var(--accent)",
};
const SCOL: Record<string, string> = {
  active:  "var(--success)",
  away:    "var(--warning)",
  busy:    "var(--danger)",
  offline: "var(--text-muted)",
};
const TMMD = new Date().toISOString().slice(5, 10);

// FormRole is wider than the dropdown set so super_admin viewers can keep
// the super_admin role on existing super_admin rows. Non-SA viewers never
// see super_admin in the dropdown — see ROLES inside the component.
type FormRole = Exclude<UserRole, "leader">;

const blank = {
  name: "",
  jobTitle: "",
  role: "member" as FormRole,
  departmentIds: [] as string[],
  status: "active" as string,
  birthday: "" as string,
  requiresCheckin: false,
  birthdayNotifications: false,
};

export default function TeamPage() {
  const { data: session } = useSession();
  const myRole = (session?.user as { role?: string })?.role ?? "member";
  const myId = (session?.user as { id?: string })?.id;
  const isAdmin = myRole === "admin" || myRole === "super_admin";
  const isSuperAdmin = myRole === "super_admin";
  // Lead and member shouldn't see other people's role / status — only
  // their job title and department membership. Hide both columns
  // entirely for those roles. Manager+ keeps the full view.
  const canSeeRoleAndStatus = myRole === "manager" || myRole === "leader" || isAdmin;
  // Profile drawer opens for anyone above lead. Lead still gets a click that
  // shows a minimal read-only card (the drawer handles the minimal branch).
  const canOpenProfileDrawer = myRole !== "member";

  // Super admin viewers see super_admin as a selectable role so they can
  // promote / demote other accounts and (importantly) keep their own role
  // intact when editing themselves.
  const ROLES: { value: FormRole; label: string }[] = isSuperAdmin
    ? [{ value: "super_admin", label: "Super Admin" }, ...BASE_ROLE_OPTIONS]
    : [...BASE_ROLE_OPTIONS];

  const [team, setTeam]   = useState<TeamMember[]>([]);
  const [depts, setDepts] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ]         = useState("");
  const [df, setDf]       = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [deleting, setDeleting] = useState<TeamMember | null>(null);
  const [form, setForm]   = useState<typeof blank>({ ...blank });
  const [hov, setHov]     = useState<string | null>(null);
  const [drawerUserId, setDrawerUserId] = useState<string | null>(null);
  // When a lead clicks a card we still show a minimal summary (name / role /
  // departments) without fetching the full profile from the server.
  const [drawerHint, setDrawerHint] = useState<TeamMember | null>(null);
  const [credentials, setCredentials] = useState<{ email: string; password: string; name: string } | null>(null);
  const { ts, toast } = useToast();

  const load = () => Promise.all([
    fetch("/api/team").then(r => r.json()),
    fetch("/api/departments").then(r => r.json()),
  ]).then(([t, d]) => {
    setTeam(t.data ?? []);
    setDepts(d.data ?? []);
    setLoading(false);
  });
  useEffect(() => { load(); }, []);

  const rows = team.filter(m =>
    (m.name.toLowerCase().includes(q.toLowerCase())
      || (m.jobTitle ?? "").toLowerCase().includes(q.toLowerCase())
      || (m.departments ?? []).some(d => (d.name ?? "").toLowerCase().includes(q.toLowerCase())))
    && (!df || (m.departments ?? []).some(d => (d.name ?? "") === df))
  );

  const openAdd = () => {
    setForm({ ...blank, departmentIds: [] });
    setShowAdd(true);
  };

  const openEdit = (m: TeamMember) => {
    setEditing(m);
    // Preserve the user's role in the form. "leader" → "manager" (deprecated
    // alias). "super_admin" stays as super_admin for super admin viewers, or
    // falls back to "admin" for everyone else (the option is hidden anyway).
    let formRole: FormRole;
    if (m.role === "leader") formRole = "manager";
    else if (m.role === "super_admin") formRole = isSuperAdmin ? "super_admin" : "admin";
    else formRole = m.role as FormRole;
    setForm({
      name: m.name,
      jobTitle: m.jobTitle ?? "",
      role: formRole,
      departmentIds: (m.departments ?? []).map(d => String(d.id)),
      status: m.status,
      birthday: m.birthday ?? "",
      requiresCheckin: !!m.requiresCheckin,
      birthdayNotifications: !!m.birthdayNotifications,
    });
  };

  const openDrawer = (m: TeamMember) => {
    if (!canOpenProfileDrawer) return;
    setDrawerHint(m);
    setDrawerUserId(String(m.id));
  };

  const save = async () => {
    if (!form.name.trim()) return toast("Name is required", "er");
    const res = await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        requiresCheckin: form.requiresCheckin,
        birthdayNotifications: form.birthdayNotifications,
        // Backwards-compat: also send a primary departmentId for any code
        // path that hasn't moved to multi-dept yet.
        departmentId: form.departmentIds[0] ?? null,
      }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      return toast(e.error || "Failed to add member", "er");
    }
    const d = await res.json();
    await load();
    setShowAdd(false);
    setCredentials({
      name: form.name,
      email: d.email,
      password: d.tempPassword,
    });
  };

  const update = async () => {
    if (!editing) return;
    if (!form.name.trim()) return toast("Name is required", "er");
    // Self-role-change confirm — prevents the "I edited myself and lost my
    // super admin power" footgun. Same guard as on /users.
    if (editing.id === myId && editing.role !== form.role) {
      const ok = window.confirm(
        `You are about to change YOUR OWN role from "${editing.role}" to "${form.role}". This may lock you out of admin features. Continue?`
      );
      if (!ok) return;
    }
    const res = await fetch(`/api/team/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        requiresCheckin: form.requiresCheckin,
        birthdayNotifications: form.birthdayNotifications,
        departmentIds: form.departmentIds,
        departmentId: form.departmentIds[0] ?? null,
      }),
    });
    if (!res.ok) return toast("Update failed", "er");
    await load();
    setEditing(null);
    toast("Member updated");
  };

  const del = async () => {
    if (!deleting) return;
    const res = await fetch(`/api/team/${deleting.id}`, { method: "DELETE" });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      return toast(e.error || "Delete failed", "er");
    }
    await load();
    toast("Member deleted", "wa");
  };

  // Reusable form JSX (NOT a component — defining as a value keeps inputs
  // focus-safe across re-renders).
  const memberForm = (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
        <Avatar s={form.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) || "??"} size={44} />
        <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
          {editing
            ? "Editing member — changes are saved to their user account."
            : "A user account will be created automatically. An email + temporary password will be generated on save."}
        </div>
      </div>
      <FormField label="Full Name">
        <HubInput value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="First Last" />
      </FormField>
      <FormField label="Job Title">
        <HubInput value={form.jobTitle} onChange={e => setForm(p => ({ ...p, jobTitle: e.target.value }))} placeholder="e.g. Senior Engineer" />
      </FormField>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <FormField label="Role">
          <HubSelect value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value as FormRole }))}>
            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </HubSelect>
        </FormField>
        <FormField label="Status">
          <HubSelect value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
            {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </HubSelect>
        </FormField>
      </div>
      <FormField label="Departments (select one or more)">
        <MultiDeptSelect
          departments={depts}
          selectedIds={form.departmentIds}
          onChange={ids => setForm(p => ({ ...p, departmentIds: ids }))}
        />
      </FormField>
      <FormField label="Birthday (optional)">
        <HubInput type="date" value={form.birthday} onChange={e => setForm(p => ({ ...p, birthday: e.target.value }))} />
      </FormField>

      {/* Per-user preference toggles. Admin / super_admin can flip these
          for any user, including managers (so an admin can opt a specific
          manager OUT of birthday notifications even though manager is the
          default-on role). */}
      {isAdmin && (
        <div style={{ padding: "12px 14px", borderRadius: 10, background: "var(--bg-input)", border: "1px solid var(--border-card)", marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text-muted)", letterSpacing: ".07em", marginBottom: 9 }}>PREFERENCES</div>
          <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12, color: "var(--text-primary)", marginBottom: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={form.requiresCheckin}
              onChange={e => setForm(p => ({ ...p, requiresCheckin: e.target.checked }))}
            />
            Requires daily check-in
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12, color: "var(--text-primary)", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={form.birthdayNotifications}
              onChange={e => setForm(p => ({ ...p, birthdayNotifications: e.target.checked }))}
            />
            Send birthday notifications when this person's birthday comes up
          </label>
        </div>
      )}

      {form.role === "manager" && !editing && (
        <div style={{ padding: "10px 12px", borderRadius: 8, background: "var(--accent-bg)", border: "1px solid var(--accent)30", fontSize: 11, color: "var(--accent)", marginBottom: 4 }}>
          Managers are set to require daily check-ins and receive birthday notifications by default. You can toggle these above before saving, or per-user later.
        </div>
      )}
    </div>
  );

  return (
    <AppLayout title="Team Members" onNew={isAdmin ? openAdd : undefined} newLabel="Add Member">
      <ToastList ts={ts} />

      {!isAdmin && (
        <div style={{ padding: "12px 16px", borderRadius: 10, background: "var(--warning-bg)", border: "1px solid var(--warning)44", color: "var(--warning)", fontSize: 12, fontWeight: 600, marginBottom: 14 }}>
          ⚠ Admin access required to add / edit / reset members. You can view only.
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 160, display: "flex", alignItems: "center", gap: 8, background: "var(--bg-card)", border: "1px solid var(--border-card)", borderRadius: 8, padding: "7px 11px" }}>
          <span style={{ color: "var(--text-muted)", fontSize: 14 }}>⌕</span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search members, titles, departments…" style={{ border: "none", background: "transparent", outline: "none", fontSize: 12, color: "var(--text-primary)", width: "100%" }} />
        </div>
        <select value={df} onChange={e => setDf(e.target.value)} style={{ background: "var(--bg-card)", border: "1px solid var(--border-card)", borderRadius: 8, padding: "7px 11px", color: "var(--text-primary)", fontSize: 12, outline: "none" }}>
          <option value="">All Departments</option>
          {depts.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
        </select>
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{rows.length} member{rows.length !== 1 ? "s" : ""}</span>
      </div>

      {loading ? (
        <div className="skeleton" style={{ height: 300, borderRadius: 12 }} />
      ) : rows.length === 0 ? (
        <EmptyState icon="👥" title="No members found" desc={q || df ? "Try adjusting your filters." : "Add your first team member."} />
      ) : (
        <div className="hub-card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="hub-table">
            <thead>
              {(() => {
                // Build the header list dynamically so we can drop the
                // Role and Status columns for lead / member viewers.
                const headers: string[] = ["Member", "Job Title"];
                if (canSeeRoleAndStatus) headers.push("Role");
                headers.push("Departments");
                if (canSeeRoleAndStatus) headers.push("Status");
                headers.push(""); // actions cell
                return <tr>{headers.map(h => <th key={h || "actions"}>{h}</th>)}</tr>;
              })()}
            </thead>
            <tbody>
              {rows.map(m => (
                <tr
                  key={m.id}
                  onMouseEnter={() => setHov(String(m.id))}
                  onMouseLeave={() => setHov(null)}
                  style={{ background: hov === String(m.id) ? "var(--bg-card-hover)" : "transparent", cursor: canOpenProfileDrawer ? "pointer" : "default" }}
                >
                  <td onClick={() => openDrawer(m)}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <Avatar s={m.initials} size={30} />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{m.name}</div>
                        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{m.email}</div>
                        {m.birthday?.slice(5) === TMMD && (
                          <div style={{ fontSize: 10, color: "var(--warning)" }}>🎂 Birthday today!</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td onClick={() => openDrawer(m)} style={{ fontSize: 12, color: "var(--text-secondary)" }}>{m.jobTitle ?? "—"}</td>
                  {canSeeRoleAndStatus && (
                    <td onClick={() => openDrawer(m)}>
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 5, fontWeight: 700, textTransform: "capitalize", background: ROLE_BG[m.role] ?? "var(--accent-bg)", color: ROLE_FG[m.role] ?? "var(--accent)" }}>
                        {m.role === "super_admin" ? "Super Admin" : m.role.replace("_", " ")}
                      </span>
                    </td>
                  )}
                  <td onClick={() => openDrawer(m)}>
                    {(m.departments && m.departments.length > 0) ? (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", maxWidth: 220 }}>
                        {m.departments.map(d => (
                          <span key={d.id} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5, background: (d.color ?? "#5b8ef8") + "22", color: d.color ?? "var(--accent)", fontWeight: 600 }}>
                            {d.name}{d.roleInDept === "lead" ? " ·L" : ""}
                          </span>
                        ))}
                      </div>
                    ) : <span style={{ fontSize: 12, color: "var(--text-muted)" }}>—</span>}
                  </td>
                  {canSeeRoleAndStatus && (
                    <td onClick={() => openDrawer(m)}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: SCOL[m.status] }} />
                        <span style={{ fontSize: 11, color: SCOL[m.status], fontWeight: 600, textTransform: "capitalize" }}>{m.status}</span>
                      </div>
                    </td>
                  )}
                  <td onClick={e => e.stopPropagation()}>
                    {isAdmin && (
                      <div style={{ display: "flex", gap: 5 }}>
                        <button onClick={() => openEdit(m)} style={{ padding: "4px 9px", borderRadius: 7, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-secondary)", fontSize: 11, cursor: "pointer" }}>Edit</button>
                        <button onClick={() => setDeleting(m)} style={{ padding: "4px 7px", borderRadius: 7, border: "1px solid rgba(220,38,38,.3)", background: "var(--danger-bg)", color: "var(--danger)", fontSize: 11, cursor: "pointer" }}>✕</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Team Member">
        {memberForm}
        <div style={{ display: "flex", gap: 9, justifyContent: "flex-end", marginTop: 4 }}>
          <button onClick={() => setShowAdd(false)} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
          <button onClick={save} style={{ padding: "7px 14px", borderRadius: 8, background: "var(--accent)", color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Add Member</button>
        </div>
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Edit: ${editing?.name}`}>
        {memberForm}
        <div style={{ display: "flex", gap: 9, justifyContent: "flex-end", marginTop: 4 }}>
          <button onClick={() => setEditing(null)} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
          <button onClick={update} style={{ padding: "7px 14px", borderRadius: 8, background: "var(--accent)", color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Save Changes</button>
        </div>
      </Modal>

      {/* One-time credentials modal */}
      <Modal
        open={!!credentials}
        onClose={() => setCredentials(null)}
        title="Member Created"
        width={440}
      >
        <div style={{ textAlign: "center", padding: "8px 0" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔑</div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 14, lineHeight: 1.5 }}>
            Share these credentials with <strong style={{ color: "var(--text-primary)" }}>{credentials?.name}</strong>.
            The password is <strong style={{ color: "var(--warning)" }}>shown once</strong> and cannot be retrieved again — copy it now.
            The user will be prompted to change it on first login.
          </div>
          <div style={{ padding: "12px 20px", background: "var(--bg-input)", borderRadius: 10, textAlign: "left", fontFamily: "monospace" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>EMAIL</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 10, wordBreak: "break-all" }}>{credentials?.email}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>TEMPORARY PASSWORD</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "0.08em" }}>{credentials?.password}</div>
          </div>
          <button
            onClick={() => {
              if (credentials) {
                navigator.clipboard.writeText(`${credentials.email}\n${credentials.password}`);
                toast("Copied!");
              }
            }}
            style={{ marginTop: 14, padding: "8px 18px", borderRadius: 8, background: "var(--accent)", color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
          >
            Copy to clipboard
          </button>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={del}
        name={deleting?.name ?? ""}
        entity="member (this is permanent)"
      />

      <ProfileDrawer
        userId={drawerUserId}
        open={!!drawerUserId}
        onClose={() => { setDrawerUserId(null); setDrawerHint(null); }}
        onSaved={() => { load(); setDrawerUserId(null); setDrawerHint(null); }}
        minimalHint={drawerHint ? {
          name: drawerHint.name,
          email: drawerHint.email,
          role: drawerHint.role,
          initials: drawerHint.initials,
          departments: drawerHint.departments,
        } : undefined}
      />
    </AppLayout>
  );
}
