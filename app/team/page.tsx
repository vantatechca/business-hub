"use client";
import { useState, useEffect } from "react";
import AppLayout from "@/components/Layout";
import { Avatar, Modal, FormField, HubInput, HubSelect, ConfirmModal, useToast, ToastList, EmptyState } from "@/components/ui/shared";
import type { TeamMember, Department } from "@/lib/types";

const STATUSES = ["active","away","busy","offline"];
const SCOL: Record<string,string> = { active:"var(--success)", away:"var(--warning)", busy:"var(--danger)", offline:"var(--text-muted)" };
const TMMD = new Date().toISOString().slice(5, 10);
const blank = { name:"", role:"", departmentId:0, departmentName:"", status:"active", birthday:"" };

export default function TeamPage() {
  const [team, setTeam]   = useState<TeamMember[]>([]);
  const [depts, setDepts] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ]         = useState("");
  const [df, setDf]       = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [deleting, setDeleting] = useState<TeamMember | null>(null);
  const [form, setForm]   = useState<typeof blank>(blank);
  const [hov, setHov]     = useState<number | null>(null);
  const { ts, toast }     = useToast();

  const load = () => Promise.all([
    fetch("/api/team").then(r => r.json()),
    fetch("/api/departments").then(r => r.json()),
  ]).then(([t, d]) => { setTeam(t.data ?? []); setDepts(d.data ?? []); setLoading(false); });
  useEffect(() => { load(); }, []);

  const rows = team.filter(m =>
    (m.name.toLowerCase().includes(q.toLowerCase()) || m.role.toLowerCase().includes(q.toLowerCase()) || (m.departmentName ?? "").toLowerCase().includes(q.toLowerCase())) &&
    (!df || m.departmentName === df)
  );

  const openAdd = () => { setForm({ ...blank, departmentId: Number(depts[0]?.id) ?? 0, departmentName: depts[0]?.name ?? "" }); setShowAdd(true); };
  const openEdit = (m: TeamMember) => { setEditing(m); setForm({ name:m.name, role:m.role, departmentId:m.departmentId, departmentName:m.departmentName ?? "", status:m.status, birthday:m.birthday ?? "" }); };

  const selectDept = (id: string | number) => {
    const d = depts.find(d => Number(d.id) === id);
    setForm(p => ({ ...p, departmentId: id as number, departmentName: d?.name ?? "" }));
  };

  const save = async () => {
    if (!form.name || !form.role) return toast("Name and role are required", "er");
    await fetch("/api/team", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(form) });
    await load(); setShowAdd(false); toast(`${form.name} added`);
  };

  const update = async () => {
    if (!editing) return;
    await fetch(`/api/team/${editing.id}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify(form) });
    await load(); setEditing(null); toast("Member updated");
  };

  const del = async () => {
    if (!deleting) return;
    await fetch(`/api/team/${deleting.id}`, { method:"DELETE" });
    await load(); toast("Member removed", "er");
  };

  const toggleCI = async (m: TeamMember) => {
    await fetch(`/api/team/${m.id}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ checkedInToday: !m.checkedInToday }) });
    setTeam(p => p.map(x => String(x.id) === String(m.id) ? { ...x, checkedInToday: !x.checkedInToday } : x));
    toast(m.checkedInToday ? "Check-in removed" : "Checked in ✓");
  };

  const memberForm = (
    <div>
      <div style={{ display:"flex", gap:12, alignItems:"center", marginBottom:14 }}>
        <Avatar s={form.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0,2) || "??"} size={44} />
        <div style={{ fontSize:11, color:"var(--text-secondary)" }}>Initials auto-generated from name</div>
      </div>
      <FormField label="Full Name"><HubInput value={form.name} onChange={e => setForm(p => ({...p, name:e.target.value}))} placeholder="First Last" /></FormField>
      <FormField label="Role"><HubInput value={form.role} onChange={e => setForm(p => ({...p, role:e.target.value}))} placeholder="e.g. Senior Engineer" /></FormField>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <FormField label="Department">
          <HubSelect value={form.departmentId} onChange={e => selectDept(+e.target.value)}>
            {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </HubSelect>
        </FormField>
        <FormField label="Status">
          <HubSelect value={form.status} onChange={e => setForm(p => ({...p, status:e.target.value}))}>
            {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
          </HubSelect>
        </FormField>
      </div>
      <FormField label="Birthday (optional)"><HubInput type="date" value={form.birthday} onChange={e => setForm(p => ({...p, birthday:e.target.value}))} /></FormField>
    </div>
  );

  const Btn = ({ onClick, children, v="sec" }: { onClick:()=>void; children:React.ReactNode; v?:"sec"|"dan" }) => (
    <button onClick={onClick} style={{ padding:"4px 10px", borderRadius:7, border:`1px solid ${v==="dan"?"rgba(220,38,38,.3)":"var(--border-card)"}`, background:v==="dan"?"var(--danger-bg)":"var(--bg-input)", color:v==="dan"?"var(--danger)":"var(--text-primary)", fontSize:11, fontWeight:700, cursor:"pointer" }}>{children}</button>
  );

  return (
    <AppLayout title="Team Members" onNew={openAdd} newLabel="Add Member">
      <ToastList ts={ts} />
      <div style={{ display:"flex", gap:10, marginBottom:14, alignItems:"center", flexWrap:"wrap" }}>
        <div style={{ flex:1, minWidth:160, display:"flex", alignItems:"center", gap:8, background:"var(--bg-card)", border:"1px solid var(--border-card)", borderRadius:8, padding:"7px 11px" }}>
          <span style={{ color:"var(--text-muted)", fontSize:14 }}>⌕</span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search members, roles, departments…" style={{ border:"none", background:"transparent", outline:"none", fontSize:12, color:"var(--text-primary)", width:"100%" }} />
        </div>
        <select value={df} onChange={e => setDf(e.target.value)} style={{ background:"var(--bg-card)", border:"1px solid var(--border-card)", borderRadius:8, padding:"7px 11px", color:"var(--text-primary)", fontSize:12, outline:"none" }}>
          <option value="">All Departments</option>
          {depts.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
        </select>
        <span style={{ fontSize:12, color:"var(--text-secondary)" }}>{rows.length} member{rows.length !== 1 ? "s" : ""}</span>
      </div>

      {loading ? (
        <div className="skeleton" style={{ height:300, borderRadius:12 }} />
      ) : rows.length === 0 ? (
        <EmptyState icon="👥" title="No members found" desc={q || df ? "Try adjusting your filters." : "Add your first team member."} />
      ) : (
        <div className="hub-card" style={{ padding:0, overflow:"hidden" }}>
          <table className="hub-table">
            <thead>
              <tr>{["Member","Role","Department","Status","Check-In",""].map(h => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map(m => (
                <tr key={m.id} onMouseEnter={() => setHov(m.id)} onMouseLeave={() => setHov(null)} style={{ background: hov === m.id ? "var(--bg-card-hover)" : "transparent" }}>
                  <td>
                    <div style={{ display:"flex", alignItems:"center", gap:9 }}>
                      <Avatar s={m.initials} size={30} />
                      <div>
                        <div style={{ fontSize:12, fontWeight:700, color:"var(--text-primary)" }}>{m.name}</div>
                        {m.birthday?.slice(5) === TMMD && <div style={{ fontSize:10, color:"var(--warning)" }}>🎂 Birthday today!</div>}
                      </div>
                    </div>
                  </td>
                  <td style={{ fontSize:12, color:"var(--text-secondary)" }}>{m.role}</td>
                  <td style={{ fontSize:12, color:"var(--text-primary)" }}>{m.departmentName}</td>
                  <td>
                    <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                      <div style={{ width:6, height:6, borderRadius:"50%", background:SCOL[m.status] }} />
                      <span style={{ fontSize:11, color:SCOL[m.status], fontWeight:600, textTransform:"capitalize" }}>{m.status}</span>
                    </div>
                  </td>
                  <td>
                    <button onClick={() => toggleCI(m)} style={{ padding:"3px 10px", borderRadius:6, border:"none", cursor:"pointer", fontSize:11, fontWeight:700, background:m.checkedInToday?"var(--success-bg)":"var(--bg-input)", color:m.checkedInToday?"var(--success)":"var(--text-secondary)" }}>
                      {m.checkedInToday ? "✓ Done" : "Mark In"}
                    </button>
                  </td>
                  <td>
                    <div style={{ display:"flex", gap:6 }}>
                      <Btn onClick={() => openEdit(m)}>Edit</Btn>
                      <Btn onClick={() => setDeleting(m)} v="dan">✕</Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Team Member">
        {memberForm}
        <div style={{ display:"flex", gap:9, justifyContent:"flex-end", marginTop:4 }}>
          <button onClick={() => setShowAdd(false)} style={{ padding:"7px 14px", borderRadius:8, border:"1px solid var(--border-card)", background:"var(--bg-input)", color:"var(--text-primary)", fontSize:12, fontWeight:600, cursor:"pointer" }}>Cancel</button>
          <button onClick={save} style={{ padding:"7px 14px", borderRadius:8, background:"var(--accent)", color:"#fff", border:"none", fontSize:12, fontWeight:700, cursor:"pointer" }}>Add Member</button>
        </div>
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Edit: ${editing?.name}`}>
        {memberForm}
        <div style={{ display:"flex", gap:9, justifyContent:"flex-end", marginTop:4 }}>
          <button onClick={() => setEditing(null)} style={{ padding:"7px 14px", borderRadius:8, border:"1px solid var(--border-card)", background:"var(--bg-input)", color:"var(--text-primary)", fontSize:12, fontWeight:600, cursor:"pointer" }}>Cancel</button>
          <button onClick={update} style={{ padding:"7px 14px", borderRadius:8, background:"var(--accent)", color:"#fff", border:"none", fontSize:12, fontWeight:700, cursor:"pointer" }}>Save Changes</button>
        </div>
      </Modal>

      <ConfirmModal open={!!deleting} onClose={() => setDeleting(null)} onConfirm={del} name={deleting?.name ?? ""} entity="team member" />
    </AppLayout>
  );
}
