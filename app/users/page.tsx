"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import AppLayout from "@/components/Layout";
import { Avatar, Modal, FormField, HubInput, HubSelect, ConfirmModal, useToast, ToastList, EmptyState } from "@/components/ui/shared";
import ProfileDrawer from "@/components/ProfileDrawer";
import type { User, UserRole } from "@/lib/types";
import { getInitials } from "@/lib/types";

// Roles selectable in the form. super_admin is appended ONLY for super_admin
// viewers (see ROLES const inside the component). "leader" is the deprecated
// alias and never appears in the dropdown.
type FormRole = Exclude<UserRole, "leader">;
const BASE_ROLES: Exclude<FormRole, "super_admin">[] = ["admin", "manager", "lead", "member"];
const TZONES = ["America/Toronto","America/New_York","America/Chicago","America/Los_Angeles","Europe/Paris","Asia/Manila"];
const SCOL: Record<string, string> = {
  super_admin: "var(--danger)",
  admin:       "var(--violet)",
  manager:     "var(--warning)",
  leader:      "var(--warning)",
  lead:        "var(--accent)",
  member:      "var(--accent)",
};
const blank = { name:"", email:"", role:"member" as FormRole, timezone:"America/Toronto", password:"member123", birthday:"" as string, requiresCheckin: false, birthdayNotifications: false };

export default function UsersPage() {
  const { data: session } = useSession();
  const myRole = (session?.user as { role?: string })?.role ?? "member";
  const myId = (session?.user as { id?: string })?.id;
  const isAdmin = myRole === "admin" || myRole === "super_admin";
  const isSuperAdmin = myRole === "super_admin";
  // Super admin viewers see super_admin as an additional role option, so they
  // can promote/demote other accounts. Everyone else only sees the base roles.
  const ROLES: FormRole[] = isSuperAdmin
    ? ["super_admin", ...BASE_ROLES]
    : [...BASE_ROLES];
  const [users, setUsers]     = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ]             = useState("");
  const [rf, setRf]           = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [deleting, setDeleting] = useState<User | null>(null);
  const [resetting, setResetting] = useState<User | null>(null);
  const [form, setForm]       = useState<typeof blank>({ ...blank });
  const [drawerUserId, setDrawerUserId] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{ email: string; password: string; name: string; kind: "created" | "reset" } | null>(null);
  const { ts, toast } = useToast();

  const load = () =>
    fetch("/api/users").then(r => r.json()).then(d => {
      const u = (d.data ?? []).map((x: Record<string,unknown>) => ({ ...x, initials: getInitials(x.name as string) }));
      setUsers(u); setLoading(false);
    });
  useEffect(() => { load(); }, []);

  const rows = users.filter(u =>
    (u.name.toLowerCase().includes(q.toLowerCase()) || u.email.toLowerCase().includes(q.toLowerCase())) &&
    (!rf || u.role === rf)
  );

  const save = async () => {
    if (!form.name || !form.email) return toast("Name and email required", "er");
    const res = await fetch("/api/users", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(form) });
    if (!res.ok) { const e = await res.json(); return toast(e.error || "Failed", "er"); }
    const d = await res.json();
    await load();
    setShowAdd(false);
    setCredentials({
      name: form.name,
      email: form.email,
      password: d.tempPassword ?? form.password,
      kind: "created",
    });
  };

  const update = async () => {
    if (!editing) return;
    // Refuse self-role-change without a confirm. Otherwise it's too easy for
    // a super admin (or admin) to nuke their own access by accident — which
    // is the exact bug the user hit before this fix.
    const isEditingSelf = editing.id === myId;
    if (isEditingSelf && editing.role !== form.role) {
      const ok = window.confirm(
        `You are about to change YOUR OWN role from "${editing.role}" to "${form.role}". This may lock you out of admin features. Continue?`
      );
      if (!ok) return;
    }
    const res = await fetch(`/api/users/${editing.id}`, {
      method:"PATCH",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        name: form.name,
        role: form.role,
        timezone: form.timezone,
        birthday: form.birthday || null,
        requiresCheckin: form.requiresCheckin,
        birthdayNotifications: form.birthdayNotifications,
      }),
    });
    if (!res.ok) return toast("Update failed", "er");
    await load(); setEditing(null); toast("User updated");
  };

  const deactivate = async () => {
    if (!deleting) return;
    const res = await fetch(`/api/users/${deleting.id}`, { method:"DELETE" });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      return toast(e.error || "Delete failed", "er");
    }
    await load(); toast("User deleted", "wa");
  };

  // Admin-only: regenerate a temp password for the selected user.
  const resetPassword = async () => {
    if (!resetting) return;
    const res = await fetch(`/api/users/${resetting.id}/reset-password`, { method: "POST" });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      setResetting(null);
      return toast(e.error || "Reset failed", "er");
    }
    const d = await res.json();
    setCredentials({
      name: resetting.name,
      email: resetting.email,
      password: d.tempPassword,
      kind: "reset",
    });
    setResetting(null);
  };

  const openEdit = (u: User) => {
    setEditing(u);
    // Preserve the user's role in the form. Two important rules:
    //   1. "leader" (deprecated alias) maps to "manager".
    //   2. "super_admin" is preserved AS-IS for super_admin viewers — for
    //      everyone else the form falls back to "admin" so they can't see
    //      or unintentionally clobber the SA role.
    //
    // The previous version always mapped super_admin → "manager" which
    // silently demoted any super_admin whose row was opened in the editor.
    // That was the source of the "I edited my profile and lost my super
    // admin power" bug.
    let role: FormRole;
    if (u.role === "leader") role = "manager";
    else if (u.role === "super_admin") role = isSuperAdmin ? "super_admin" : "admin";
    else role = u.role as FormRole;
    setForm({
      name: u.name,
      email: u.email,
      role,
      timezone: u.timezone ?? "America/Toronto",
      password: "",
      birthday: ((u as unknown as { birthday?: string | null }).birthday) ?? "",
      requiresCheckin: !!u.requiresCheckin,
      birthdayNotifications: !!u.birthdayNotifications,
    });
  };

  const userForm = (
    <div>
      <FormField label="Full Name"><HubInput value={form.name} onChange={e => setForm(p => ({...p, name:e.target.value}))} placeholder="First Last"/></FormField>
      <FormField label="Email"><HubInput type="email" value={form.email} onChange={e => setForm(p => ({...p, email:e.target.value}))} placeholder="user@hub.com" disabled={!!editing}/></FormField>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:11 }}>
        <FormField label="Role">
          <HubSelect value={form.role} onChange={e => setForm(p => ({...p, role:e.target.value as FormRole}))}>
            {ROLES.map(r => <option key={r} value={r}>{r === "super_admin" ? "Super Admin" : r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
          </HubSelect>
        </FormField>
        <FormField label="Timezone">
          <HubSelect value={form.timezone} onChange={e => setForm(p => ({...p, timezone:e.target.value}))}>
            {TZONES.map(t => <option key={t} value={t}>{t}</option>)}
          </HubSelect>
        </FormField>
      </div>
      <FormField label="Birthday (optional)">
        <HubInput
          type="date"
          value={form.birthday ?? ""}
          onChange={e => setForm(p => ({ ...p, birthday: e.target.value }))}
        />
      </FormField>
      {!editing && <FormField label="Initial Password"><HubInput value={form.password} onChange={e => setForm(p => ({...p, password:e.target.value}))} placeholder="member123"/></FormField>}

      {/* Per-user preference toggles for admins. Lets you flip a manager's
          birthday notifications off without going to the profile drawer. */}
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
        <div style={{ padding: "10px 12px", borderRadius: 8, background: "var(--accent-bg)", border: "1px solid var(--accent)30", fontSize: 11, color: "var(--accent)" }}>
          Managers default to requiring daily check-ins and receiving birthday notifications. You can override above before saving.
        </div>
      )}
    </div>
  );

  const roleCount = (r: string) => users.filter(u => u.role === r).length;

  return (
    <AppLayout title="User Management" onNew={isAdmin ? () => { setForm({...blank}); setShowAdd(true); } : undefined} newLabel="Add User">
      <ToastList ts={ts} />

      {!isAdmin && (
        <div style={{ padding:"12px 16px", borderRadius:10, background:"var(--warning-bg)", border:"1px solid var(--warning)44", color:"var(--warning)", fontSize:12, fontWeight:600, marginBottom:14 }}>
          ⚠ Admin access required to manage users. You can view but not edit.
        </div>
      )}

      {/* Role summary */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:11, marginBottom:14 }}>
        {[
          ["admin","Admins","var(--violet)"],
          ["manager","Managers","var(--warning)"],
          ["lead","Leads","var(--accent)"],
          ["member","Members","var(--accent)"],
        ].map(([r,l,c]) => (
          <div key={r} className="hub-card" style={{ padding:"14px 16px" }}>
            <div style={{ fontSize:11, fontWeight:600, color:"var(--text-secondary)", marginBottom:5 }}>{l}</div>
            <div style={{ fontSize:26, fontWeight:800, color:c as string }}>{roleCount(r)}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display:"flex", gap:10, marginBottom:14, alignItems:"center", flexWrap:"wrap" }}>
        <div style={{ flex:1, minWidth:180, display:"flex", alignItems:"center", gap:8, background:"var(--bg-card)", border:"1px solid var(--border-card)", borderRadius:8, padding:"7px 11px" }}>
          <span style={{ color:"var(--text-muted)" }}>⌕</span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search users…" style={{ border:"none", background:"transparent", outline:"none", fontSize:12, color:"var(--text-primary)", width:"100%" }}/>
        </div>
        <select value={rf} onChange={e => setRf(e.target.value)} style={{ background:"var(--bg-card)", border:"1px solid var(--border-card)", borderRadius:8, padding:"7px 11px", color:"var(--text-primary)", fontSize:12, outline:"none" }}>
          <option value="">All Roles</option>
          {ROLES.map(r => <option key={r} value={r}>{r === "super_admin" ? "Super Admin" : r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
        </select>
        <span style={{ fontSize:12, color:"var(--text-secondary)" }}>{rows.length} users</span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="skeleton" style={{ height:400, borderRadius:12 }}/>
      ) : rows.length === 0 ? (
        <EmptyState icon="👥" title="No users found" desc={isAdmin ? "Add your first team member." : "No users match your filter."}/>
      ) : (
        <div className="hub-card" style={{ padding:0, overflow:"hidden" }}>
          <table className="hub-table">
            <thead><tr>{["User","Email","Role","Timezone","Last Login",""].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map(u => (
                <tr key={u.id} style={{ cursor: "pointer" }} onClick={() => setDrawerUserId(String(u.id))}>
                  <td>
                    <div style={{ display:"flex", alignItems:"center", gap:9 }}>
                      <Avatar s={u.initials ?? "?"} size={30}/>
                      <div style={{ fontSize:12, fontWeight:700, color:"var(--text-primary)" }}>{u.name}</div>
                    </div>
                  </td>
                  <td style={{ fontSize:12, color:"var(--text-secondary)" }}>{u.email}</td>
                  <td>
                    <span style={{ padding:"2px 9px", borderRadius:6, fontSize:11, fontWeight:700, background:`${SCOL[u.role]}22`, color:SCOL[u.role], textTransform:"capitalize" }}>{u.role === "super_admin" ? "Super Admin" : u.role.replace("_", " ")}</span>
                  </td>
                  <td style={{ fontSize:11, color:"var(--text-secondary)" }}>{u.timezone ?? "—"}</td>
                  <td style={{ fontSize:11, color:"var(--text-secondary)" }}>
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "Never"}
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    {isAdmin && (
                      <div style={{ display:"flex", gap:5 }}>
                        <button onClick={() => openEdit(u)} style={{ padding:"4px 9px", borderRadius:7, border:"1px solid var(--border-card)", background:"var(--bg-input)", color:"var(--text-secondary)", fontSize:11, cursor:"pointer" }}>Edit</button>
                        <button onClick={() => setResetting(u)} title="Reset password" style={{ padding:"4px 9px", borderRadius:7, border:"1px solid var(--border-card)", background:"var(--bg-input)", color:"var(--text-secondary)", fontSize:11, cursor:"pointer" }}>🔑</button>
                        <button onClick={() => setDeleting(u)} style={{ padding:"4px 7px", borderRadius:7, border:"1px solid rgba(220,38,38,.3)", background:"var(--danger-bg)", color:"var(--danger)", fontSize:11, cursor:"pointer" }}>✕</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add User">
        {userForm}
        <div style={{ display:"flex", gap:9, justifyContent:"flex-end", marginTop:4 }}>
          <button onClick={() => setShowAdd(false)} style={{ padding:"7px 14px", borderRadius:8, border:"1px solid var(--border-card)", background:"var(--bg-input)", color:"var(--text-primary)", fontSize:12, fontWeight:600, cursor:"pointer" }}>Cancel</button>
          <button onClick={save} style={{ padding:"7px 14px", borderRadius:8, background:"var(--accent)", color:"#fff", border:"none", fontSize:12, fontWeight:700, cursor:"pointer" }}>Add User</button>
        </div>
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Edit: ${editing?.name}`}>
        {userForm}
        <div style={{ display:"flex", gap:9, justifyContent:"flex-end", marginTop:4 }}>
          <button onClick={() => setEditing(null)} style={{ padding:"7px 14px", borderRadius:8, border:"1px solid var(--border-card)", background:"var(--bg-input)", color:"var(--text-primary)", fontSize:12, fontWeight:600, cursor:"pointer" }}>Cancel</button>
          <button onClick={update} style={{ padding:"7px 14px", borderRadius:8, background:"var(--accent)", color:"#fff", border:"none", fontSize:12, fontWeight:700, cursor:"pointer" }}>Save Changes</button>
        </div>
      </Modal>

      {/* One-time credentials modal */}
      <Modal
        open={!!credentials}
        onClose={() => setCredentials(null)}
        title={credentials?.kind === "reset" ? "Password Reset" : "User Created"}
        width={440}
      >
        <div style={{ textAlign: "center", padding: "8px 0" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔑</div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 14, lineHeight: 1.5 }}>
            Share these credentials with <strong style={{ color: "var(--text-primary)" }}>{credentials?.name}</strong>.
            The password is <strong style={{ color: "var(--warning)" }}>shown once</strong> and cannot be retrieved again — copy it now.
            They will be prompted to change it on their next login.
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

      <ConfirmModal open={!!deleting} onClose={() => setDeleting(null)} onConfirm={deactivate} name={deleting?.name ?? ""} entity="user (this is permanent)"/>

      <ConfirmModal
        open={!!resetting}
        onClose={() => setResetting(null)}
        onConfirm={resetPassword}
        name={resetting?.name ?? ""}
        title="Reset Password"
        confirmLabel="Reset"
        message={
          <>Generate a new temporary password for <strong style={{ color: "var(--text-primary)" }}>{resetting?.name}</strong>? The password is shown once and they&apos;ll be forced to change it on next login.</>
        }
      />

      <ProfileDrawer
        userId={drawerUserId}
        open={!!drawerUserId}
        onClose={() => setDrawerUserId(null)}
        onSaved={() => { load(); setDrawerUserId(null); }}
      />
    </AppLayout>
  );
}
