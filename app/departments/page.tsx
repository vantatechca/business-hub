"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/Layout";
import { Card, ProgressBar, Modal, FormField, HubInput, HubSelect, ConfirmModal, healthColor, useToast, ToastList, EmptyState } from "@/components/ui/shared";
import { Sortable, useSortableItem, DragHandle, overlayCardStyle } from "@/components/ui/Sortable";
import { GripVertical } from "lucide-react";
import type { Department } from "@/lib/types";

const ICONS = ["💼","⚙️","📣","📊","👥","🔧","🎯","⭐","⚖️","🏗️","🌐","💡","🔬","📦","🎨","🧬","🚀","💰","📱","🎓"];
const COLORS = ["#5b8ef8","#34d399","#a78bfa","#fbbf24","#f87171","#22d3ee","#84cc16","#fb923c","#e879f9","#6366f1"];

const blank = { name:"", head:"", icon:"💼", color:COLORS[0], health:80, memberCount:1 };

export default function DepartmentsPage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role ?? "member";
  const canReorder = role === "admin" || role === "super_admin" || role === "manager" || role === "leader";

  const [depts, setDepts] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [deleting, setDeleting] = useState<Department | null>(null);
  const [form, setForm] = useState(blank);
  const [q, setQ] = useState("");
  const { ts, toast } = useToast();

  // Filtered list — name + description (head). Empty query shows everything.
  // Search is plain case-insensitive substring; the list is small so a more
  // sophisticated index isn't needed.
  const filteredDepts = q.trim()
    ? depts.filter(d => {
        const needle = q.toLowerCase();
        return (
          d.name.toLowerCase().includes(needle)
          || (d.description ?? "").toLowerCase().includes(needle)
        );
      })
    : depts;

  const handleReorder = async (ids: (string | number)[]) => {
    const map = new Map(depts.map(d => [String(d.id), d]));
    const next = ids.map(id => map.get(String(id))).filter(Boolean) as Department[];
    setDepts(next);
    const res = await fetch("/api/departments/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) { toast("Reorder failed", "er"); await load(); }
  };

  const load = () => fetch("/api/departments").then(r => r.json()).then(d => { setDepts(d.data ?? []); setLoading(false); });
  useEffect(() => { load(); }, []);

  const openAdd = () => { setForm(blank); setShowAdd(true); };
  const openEdit = (d: Department) => { setEditing(d); setForm({ name:d.name, head:d.description ?? "", icon:d.icon, color:d.color, health:d.health ?? 0, memberCount:d.memberCount ?? 0 }); };

  const save = async () => {
    if (!form.name || !form.head) return toast("Name and head are required", "er");
    await fetch("/api/departments", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(form) });
    await load(); setShowAdd(false); toast(`${form.name} added`);
  };

  const update = async () => {
    if (!editing) return;
    await fetch(`/api/departments/${editing.id}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify(form) });
    await load(); setEditing(null); toast("Department updated");
  };

  const del = async () => {
    if (!deleting) return;
    await fetch(`/api/departments/${deleting.id}`, { method:"DELETE" });
    await load(); toast("Department deleted", "er");
  };

  const deptForm = (
    <div>
      <FormField label="Department Name"><HubInput value={form.name} onChange={e => setForm(p => ({...p, name:e.target.value}))} placeholder="e.g. Legal, Design…" /></FormField>
      <FormField label="Department Head"><HubInput value={form.head} onChange={e => setForm(p => ({...p, head:e.target.value}))} placeholder="Full name" /></FormField>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <FormField label="Members"><HubInput type="number" min="1" value={form.memberCount} onChange={e => setForm(p => ({...p, memberCount:+e.target.value}))} /></FormField>
        <FormField label="Health (%)"><HubInput type="number" min="0" max="100" value={form.health} onChange={e => setForm(p => ({...p, health:+e.target.value}))} /></FormField>
      </div>
      <FormField label="Icon">
        <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
          {ICONS.map(ic => <button key={ic} onClick={() => setForm(p => ({...p, icon:ic}))} style={{ width:34, height:34, borderRadius:8, border:`2px solid ${form.icon===ic?"var(--accent)":"var(--border-card)"}`, background:"var(--bg-input)", fontSize:16, cursor:"pointer" }}>{ic}</button>)}
        </div>
      </FormField>
      <FormField label="Color">
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {COLORS.map(c => <button key={c} onClick={() => setForm(p => ({...p, color:c}))} style={{ width:26, height:26, borderRadius:"50%", background:c, cursor:"pointer", border:`3px solid ${form.color===c?"var(--text-primary)":"transparent"}` }} />)}
        </div>
      </FormField>
    </div>
  );

  return (
    <AppLayout title="Departments" onNew={openAdd} newLabel="Add Department">
      <ToastList ts={ts} />

      {/* Search + counter row. Reordering is disabled while a search filter
          is active because the visible list isn't the canonical order. */}
      <div style={{ display:"flex", gap:10, marginBottom:14, alignItems:"center", flexWrap:"wrap" }}>
        <div style={{ flex:1, minWidth:200, display:"flex", alignItems:"center", gap:8, background:"var(--bg-card)", border:"1px solid var(--border-card)", borderRadius:8, padding:"7px 11px" }}>
          <span style={{ color:"var(--text-muted)", fontSize:14 }}>⌕</span>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search departments by name or description…"
            style={{ border:"none", background:"transparent", outline:"none", fontSize:12, color:"var(--text-primary)", width:"100%" }}
          />
        </div>
        <span style={{ fontSize:12, color:"var(--text-secondary)" }}>
          {filteredDepts.length} department{filteredDepts.length !== 1 ? "s" : ""}
          {q && depts.length !== filteredDepts.length && ` of ${depts.length}`}
        </span>
      </div>

      {loading ? (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
          {[0,1,2,3,4,5].map(i => <div key={i} className="skeleton" style={{ height:180, borderRadius:12 }} />)}
        </div>
      ) : depts.length === 0 ? (
        <EmptyState icon="⬡" title="No departments yet" desc="Add your first department to get started." action={<button onClick={openAdd} style={{ padding:"8px 18px", borderRadius:8, background:"var(--accent)", color:"#fff", border:"none", fontWeight:700, fontSize:13, cursor:"pointer" }}>Add Department</button>} />
      ) : filteredDepts.length === 0 ? (
        <EmptyState icon="🔎" title="No matches" desc={`Nothing matches "${q}". Try a different search.`} />
      ) : (
        <Sortable
          items={filteredDepts}
          onReorder={handleReorder}
          strategy="grid"
          disabled={!canReorder || !!q}
          renderOverlay={d => <DeptCardPreview d={d} />}
        >
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:12 }} className="stagger-children">
            {filteredDepts.map(d => (
              <DeptCard
                key={d.id}
                d={d}
                dragEnabled={canReorder && !q}
                onEdit={() => openEdit(d)}
                onDelete={() => setDeleting(d)}
              />
            ))}
          </div>
        </Sortable>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Department">
        {deptForm}
        <div style={{ display:"flex", gap:9, justifyContent:"flex-end", marginTop:4 }}>
          <button onClick={() => setShowAdd(false)} style={{ padding:"7px 14px", borderRadius:8, border:"1px solid var(--border-card)", background:"var(--bg-input)", color:"var(--text-primary)", fontSize:12, fontWeight:600, cursor:"pointer" }}>Cancel</button>
          <button onClick={save} style={{ padding:"7px 14px", borderRadius:8, background:"var(--accent)", color:"#fff", border:"none", fontSize:12, fontWeight:700, cursor:"pointer" }}>Add Department</button>
        </div>
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Edit: ${editing?.name}`}>
        {deptForm}
        <div style={{ display:"flex", gap:9, justifyContent:"flex-end", marginTop:4 }}>
          <button onClick={() => setEditing(null)} style={{ padding:"7px 14px", borderRadius:8, border:"1px solid var(--border-card)", background:"var(--bg-input)", color:"var(--text-primary)", fontSize:12, fontWeight:600, cursor:"pointer" }}>Cancel</button>
          <button onClick={update} style={{ padding:"7px 14px", borderRadius:8, background:"var(--accent)", color:"#fff", border:"none", fontSize:12, fontWeight:700, cursor:"pointer" }}>Save Changes</button>
        </div>
      </Modal>

      <ConfirmModal open={!!deleting} onClose={() => setDeleting(null)} onConfirm={del} name={deleting?.name ?? ""} entity="department" />
    </AppLayout>
  );
}

function DeptCardBody({
  d,
  dragHandle,
  actions,
}: {
  d: Department;
  dragHandle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <Card>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
        {dragHandle}
        <div style={{ width:38, height:38, borderRadius:10, background:`${d.color}18`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>{d.icon}</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:700, color:"var(--text-primary)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{d.name}</div>
          <div style={{ fontSize:11, color:"var(--text-secondary)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{d.description ?? ""}</div>
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:2 }}>
        <Stat label="MEMBERS" value={d.memberCount ?? 0} />
        <Stat label="TASKS"   value={(d as unknown as { taskCount?: number }).taskCount ?? 0} />
        <Stat label="METRICS" value={d.metricCount ?? 0} />
      </div>
      {actions}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ textAlign:"center", padding:"8px 4px", borderRadius:8, background:"var(--bg-input)" }}>
      <div style={{ fontSize:9, fontWeight:800, color:"var(--text-muted)", letterSpacing:".08em" }}>{label}</div>
      <div style={{ fontSize:18, fontWeight:800, color:"var(--text-primary)", marginTop:2 }}>{value}</div>
    </div>
  );
}

function DeptCard({
  d,
  dragEnabled,
  onEdit,
  onDelete,
}: {
  d: Department;
  dragEnabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const router = useRouter();
  const { setNodeRef, style, listeners, attributes } = useSortableItem(d.id);
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const goToDetail = () => router.push(`/departments/${d.id}`);
  const handle = dragEnabled ? (
    <span onClick={stop}><DragHandle listeners={listeners} attributes={attributes} /></span>
  ) : undefined;
  const actions = (
    <div style={{ display:"flex", gap:8, marginTop:12 }} onClick={stop}>
      <button onClick={onEdit} style={{ flex:1, padding:"6px 12px", borderRadius:8, border:"1px solid var(--border-card)", background:"var(--bg-input)", color:"var(--text-primary)", fontSize:12, fontWeight:600, cursor:"pointer" }}>Edit</button>
      <button onClick={onDelete} style={{ padding:"6px 12px", borderRadius:8, border:"1px solid rgba(220,38,38,.3)", background:"var(--danger-bg)", color:"var(--danger)", fontSize:12, fontWeight:700, cursor:"pointer" }}>Delete</button>
    </div>
  );
  return (
    <div ref={dragEnabled ? setNodeRef : undefined} style={dragEnabled ? style : undefined}>
      <div onClick={goToDetail} style={{ cursor: "pointer" }} className="hub-card-hover">
        <DeptCardBody d={d} dragHandle={handle} actions={actions} />
      </div>
    </div>
  );
}

// Floating clone rendered inside DragOverlay — follows the cursor across the page
function DeptCardPreview({ d }: { d: Department }) {
  return (
    <div style={overlayCardStyle}>
      <DeptCardBody
        d={d}
        dragHandle={<GripVertical size={14} style={{ color: "var(--text-muted)" }} />}
      />
    </div>
  );
}
