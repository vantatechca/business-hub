"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import AppLayout from "@/components/Layout";
import { Avatar, Modal, FormField, HubInput, HubSelect, ConfirmModal, useToast, ToastList, EmptyState } from "@/components/ui/shared";
import type { User } from "@/lib/types";
import { getInitials } from "@/lib/types";

const ROLES  = ["admin","leader","member"];
const TZONES = ["America/Toronto","America/New_York","America/Chicago","America/Los_Angeles","Europe/Paris","Asia/Manila"];
const SCOL: Record<string,string> = { admin:"var(--violet)", leader:"var(--warning)", member:"var(--accent)" };
const blank = { name:"", email:"", role:"member" as User["role"], timezone:"America/Toronto", password:"member123" };

export default function UsersPage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string })?.role === "admin";
  const [users, setUsers]     = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ]             = useState("");
  const [rf, setRf]           = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [deleting, setDeleting] = useState<User | null>(null);
  const [form, setForm]       = useState<typeof blank>({ ...blank });
  const [newUserPw, setNewUserPw] = useState<string | null>(null);
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
    setNewUserPw(d.tempPassword ?? form.password);
    await load(); setShowAdd(false); toast(`${form.name} added`);
  };

  const update = async () => {
    if (!editing) return;
    const res = await fetch(`/api/users/${editing.id}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ name:form.name, role:form.role, timezone:form.timezone }) });
    if (!res.ok) return toast("Update failed", "er");
    await load(); setEditing(null); toast("User updated");
  };

  const deactivate = async () => {
    if (!deleting) return;
    await fetch(`/api/users/${deleting.id}`, { method:"DELETE" });
    await load(); toast("User deactivated", "wa");
  };

  const openEdit = (u: User) => { setEditing(u); setForm({ name:u.name, email:u.email, role:u.role, timezone:u.timezone ?? "America/Toronto", password:"" }); };

  const UserForm = () => (
    <div>
      <FormField label="Full Name"><HubInput value={form.name} onChange={e => setForm(p => ({...p, name:e.target.value}))} placeholder="First Last"/></FormField>
      <FormField label="Email"><HubInput type="email" value={form.email} onChange={e => setForm(p => ({...p, email:e.target.value}))} placeholder="user@hub.com" disabled={!!editing}/></FormField>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:11 }}>
        <FormField label="Role">
          <HubSelect value={form.role} onChange={e => setForm(p => ({...p, role:e.target.value as User["role"]}))}>
            {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
          </HubSelect>
        </FormField>
        <FormField label="Timezone">
          <HubSelect value={form.timezone} onChange={e => setForm(p => ({...p, timezone:e.target.value}))}>
            {TZONES.map(t => <option key={t} value={t}>{t}</option>)}
          </HubSelect>
        </FormField>
      </div>
      {!editing && <FormField label="Initial Password"><HubInput value={form.password} onChange={e => setForm(p => ({...p, password:e.target.value}))} placeholder="member123"/></FormField>}
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
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:11, marginBottom:14 }}>
        {[["admin","Admin","var(--violet)"],["leader","Leaders","var(--warning)"],["member","Members","var(--accent)"]].map(([r,l,c]) => (
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
          {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
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
            <thead><tr>{["User","Email","Role","Timezone","Last Login","Status",""].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map(u => (
                <tr key={u.id}>
                  <td>
                    <div style={{ display:"flex", alignItems:"center", gap:9 }}>
                      <Avatar s={u.initials ?? "?"} size={30}/>
                      <div style={{ fontSize:12, fontWeight:700, color:"var(--text-primary)" }}>{u.name}</div>
                    </div>
                  </td>
                  <td style={{ fontSize:12, color:"var(--text-secondary)" }}>{u.email}</td>
                  <td>
                    <span style={{ padding:"2px 9px", borderRadius:6, fontSize:11, fontWeight:700, background:`${SCOL[u.role]}18`, color:SCOL[u.role], textTransform:"capitalize" }}>{u.role}</span>
                  </td>
                  <td style={{ fontSize:11, color:"var(--text-secondary)" }}>{u.timezone ?? "—"}</td>
                  <td style={{ fontSize:11, color:"var(--text-secondary)" }}>
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "Never"}
                  </td>
                  <td>
                    <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:6, background: u.isActive ? "var(--success-bg)" : "var(--danger-bg)", color: u.isActive ? "var(--success)" : "var(--danger)" }}>
                      {u.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    {isAdmin && (
                      <div style={{ display:"flex", gap:5 }}>
                        <button onClick={() => openEdit(u)} style={{ padding:"4px 9px", borderRadius:7, border:"1px solid var(--border-card)", background:"var(--bg-input)", color:"var(--text-secondary)", fontSize:11, cursor:"pointer" }}>Edit</button>
                        {u.isActive && <button onClick={() => setDeleting(u)} style={{ padding:"4px 7px", borderRadius:7, border:"1px solid rgba(220,38,38,.3)", background:"var(--danger-bg)", color:"var(--danger)", fontSize:11, cursor:"pointer" }}>✕</button>}
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
        <UserForm/>
        <div style={{ display:"flex", gap:9, justifyContent:"flex-end", marginTop:4 }}>
          <button onClick={() => setShowAdd(false)} style={{ padding:"7px 14px", borderRadius:8, border:"1px solid var(--border-card)", background:"var(--bg-input)", color:"var(--text-primary)", fontSize:12, fontWeight:600, cursor:"pointer" }}>Cancel</button>
          <button onClick={save} style={{ padding:"7px 14px", borderRadius:8, background:"var(--accent)", color:"#fff", border:"none", fontSize:12, fontWeight:700, cursor:"pointer" }}>Add User</button>
        </div>
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Edit: ${editing?.name}`}>
        <UserForm/>
        <div style={{ display:"flex", gap:9, justifyContent:"flex-end", marginTop:4 }}>
          <button onClick={() => setEditing(null)} style={{ padding:"7px 14px", borderRadius:8, border:"1px solid var(--border-card)", background:"var(--bg-input)", color:"var(--text-primary)", fontSize:12, fontWeight:600, cursor:"pointer" }}>Cancel</button>
          <button onClick={update} style={{ padding:"7px 14px", borderRadius:8, background:"var(--accent)", color:"#fff", border:"none", fontSize:12, fontWeight:700, cursor:"pointer" }}>Save Changes</button>
        </div>
      </Modal>

      {/* New user password reveal */}
      <Modal open={!!newUserPw} onClose={() => setNewUserPw(null)} title="User Created" width={400}>
        <div style={{ textAlign:"center", padding:"8px 0" }}>
          <div style={{ fontSize:36, marginBottom:12 }}>🔑</div>
          <div style={{ fontSize:13, color:"var(--text-secondary)", marginBottom:14 }}>Share this temporary password with the user. They should change it on first login.</div>
          <div style={{ padding:"12px 20px", background:"var(--bg-input)", borderRadius:10, fontSize:18, fontWeight:800, letterSpacing:"0.1em", color:"var(--text-primary)", fontFamily:"monospace" }}>{newUserPw}</div>
          <button onClick={() => { navigator.clipboard.writeText(newUserPw ?? ""); toast("Copied!"); }} style={{ marginTop:12, padding:"7px 18px", borderRadius:8, background:"var(--accent)", color:"#fff", border:"none", fontSize:12, fontWeight:700, cursor:"pointer" }}>Copy Password</button>
        </div>
      </Modal>

      <ConfirmModal open={!!deleting} onClose={() => setDeleting(null)} onConfirm={deactivate} name={deleting?.name ?? ""} entity="user (will be deactivated, not deleted)"/>
    </AppLayout>
  );
}
