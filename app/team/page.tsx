"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import AppLayout from "@/components/Layout";
import { Avatar, Modal, FormField, HubInput, HubSelect, ConfirmModal, useToast, ToastList, EmptyState } from "@/components/ui/shared";
import type { TeamMember, Department } from "@/lib/types";

const STATUSES = ["active", "away", "busy", "offline"];
const ROLES: { value: "admin" | "leader" | "member"; label: string }[] = [
  { value: "admin",  label: "Admin" },
  { value: "leader", label: "Leader" },
  { value: "member", label: "Member" },
];
const SCOL: Record<string, string> = {
  active:  "var(--success)",
  away:    "var(--warning)",
  busy:    "var(--danger)",
  offline: "var(--text-muted)",
};
const TMMD = new Date().toISOString().slice(5, 10);

const blank = {
  name: "",
  jobTitle: "",
  role: "member" as "admin" | "leader" | "member",
  departmentId: "" as string,
  status: "active" as string,
  birthday: "" as string,
};

export default function TeamPage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string })?.role === "admin";

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
  // Credentials modal shown ONCE after adding a new member — contains the
  // auto-generated email + temporary password the admin needs to share.
  // Password resets live on /users; this modal is create-only here.
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
      || (m.departmentName ?? "").toLowerCase().includes(q.toLowerCase()))
    && (!df || m.departmentName === df)
  );

  const openAdd = () => {
    setForm({
      ...blank,
      departmentId: String(depts[0]?.id ?? ""),
    });
    setShowAdd(true);
  };

  const openEdit = (m: TeamMember) => {
    setEditing(m);
    setForm({
      name: m.name,
      jobTitle: m.jobTitle ?? "",
      role: m.role,
      departmentId: String(m.departmentId ?? ""),
      status: m.status,
      birthday: m.birthday ?? "",
    });
  };

  const save = async () => {
    if (!form.name.trim()) return toast("Name is required", "er");
    const res = await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      return toast(e.error || "Failed to add member", "er");
    }
    const d = await res.json();
    await load();
    setShowAdd(false);
    // Pop the created-credentials modal so the admin can copy and share
    setCredentials({
      name: form.name,
      email: d.email,
      password: d.tempPassword,
    });
  };

  const update = async () => {
    if (!editing) return;
    if (!form.name.trim()) return toast("Name is required", "er");
    const res = await fetch(`/api/team/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) return toast("Update failed", "er");
    await load();
    setEditing(null);
    toast("Member updated");
  };

  const del = async () => {
    if (!deleting) return;
    await fetch(`/api/team/${deleting.id}`, { method: "DELETE" });
    await load();
    toast("Member deactivated", "wa");
  };

  const toggleCI = async (m: TeamMember) => {
    await fetch(`/api/team/${m.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkedInToday: !m.checkedInToday }),
    });
    setTeam(p => p.map(x => (String(x.id) === String(m.id) ? { ...x, checkedInToday: !x.checkedInToday } : x)));
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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <FormField label="Role">
          <HubSelect value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value as "admin" | "leader" | "member" }))}>
            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </HubSelect>
        </FormField>
        <FormField label="Department">
          <HubSelect value={form.departmentId} onChange={e => setForm(p => ({ ...p, departmentId: e.target.value }))}>
            <option value="">— None —</option>
            {depts.map(d => <option key={d.id} value={String(d.id)}>{d.name}</option>)}
          </HubSelect>
        </FormField>
        <FormField label="Status">
          <HubSelect value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
            {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </HubSelect>
        </FormField>
      </div>
      <FormField label="Birthday (optional)">
        <HubInput type="date" value={form.birthday} onChange={e => setForm(p => ({ ...p, birthday: e.target.value }))} />
      </FormField>
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
              <tr>{["Member", "Job Title", "Role", "Department", "Status", "Check-In", ""].map(h => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map(m => (
                <tr
                  key={m.id}
                  onMouseEnter={() => setHov(String(m.id))}
                  onMouseLeave={() => setHov(null)}
                  style={{ background: hov === String(m.id) ? "var(--bg-card-hover)" : "transparent" }}
                >
                  <td>
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
                  <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>{m.jobTitle ?? "—"}</td>
                  <td>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 5, fontWeight: 700, textTransform: "capitalize", background: m.role === "leader" ? "var(--warning-bg)" : m.role === "admin" ? "var(--violet-bg)" : "var(--accent-bg)", color: m.role === "leader" ? "var(--warning)" : m.role === "admin" ? "var(--violet)" : "var(--accent)" }}>
                      {m.role}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: "var(--text-primary)" }}>{m.departmentName ?? "—"}</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: SCOL[m.status] }} />
                      <span style={{ fontSize: 11, color: SCOL[m.status], fontWeight: 600, textTransform: "capitalize" }}>{m.status}</span>
                    </div>
                  </td>
                  <td>
                    <button
                      onClick={() => toggleCI(m)}
                      style={{ padding: "3px 10px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, background: m.checkedInToday ? "var(--success-bg)" : "var(--bg-input)", color: m.checkedInToday ? "var(--success)" : "var(--text-secondary)" }}
                    >
                      {m.checkedInToday ? "✓ Done" : "Mark In"}
                    </button>
                  </td>
                  <td>
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
        entity="member (will be deactivated, not deleted)"
      />
    </AppLayout>
  );
}
