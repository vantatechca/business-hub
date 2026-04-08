"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import AppLayout from "@/components/Layout";
import { Card, ProgressBar, Modal, FormField, HubInput, HubSelect, ConfirmModal, useToast, ToastList, EmptyState, formatValue } from "@/components/ui/shared";
import { Sortable, useSortableItem, DragHandle, overlayCardStyle } from "@/components/ui/Sortable";
import { GripVertical } from "lucide-react";
import type { Goal } from "@/lib/types";

const COLORS = ["#34d399","#5b8ef8","#a78bfa","#fbbf24","#f87171","#22d3ee","#fb923c","#6366f1","#84cc16","#e879f9"];
const blank = { name:"", target:100, current:0, format:"number" as Goal["format"], color:COLORS[0], notes:"" };

export default function GoalsPage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role ?? "member";
  const canReorder = role === "admin" || role === "super_admin" || role === "manager" || role === "leader";

  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [deleting, setDeleting] = useState<Goal | null>(null);
  // Dedicated "Update current value" modal — opened via the Update button on
  // a goal card. Captures the new value + an optional notes append.
  const [updating, setUpdating] = useState<{ goal: Goal; value: string; notes: string } | null>(null);
  const [form, setForm] = useState<typeof blank>({ ...blank });
  const { ts, toast } = useToast();

  const handleReorder = async (ids: (string | number)[]) => {
    const map = new Map(goals.map(g => [String(g.id), g]));
    const next = ids.map(id => map.get(String(id))).filter(Boolean) as Goal[];
    setGoals(next);
    const res = await fetch("/api/goals/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) { toast("Reorder failed", "er"); await load(); }
  };

  const load = () => fetch("/api/goals").then(r => r.json()).then(d => { setGoals(d.data ?? []); setLoading(false); });
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.name) return toast("Name required", "er");
    await fetch("/api/goals", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(form) });
    await load(); setShowAdd(false); toast("Goal added");
  };

  const update = async () => {
    if (!editing) return;
    await fetch(`/api/goals/${editing.id}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify(form) });
    await load(); setEditing(null); toast("Goal updated");
  };

  const del = async () => {
    if (!deleting) return;
    await fetch(`/api/goals/${deleting.id}`, { method:"DELETE" });
    await load(); toast("Goal deleted", "er");
  };

  // Open the update-value modal pre-filled with the current value.
  const openUpdate = (g: Goal) => setUpdating({ goal: g, value: String(g.current), notes: g.notes ?? "" });

  // Commit the new current value + notes. Empty notes string writes null.
  const saveUpdate = async () => {
    if (!updating) return;
    const v = parseFloat(updating.value);
    if (isNaN(v)) return toast("Enter a valid number", "er");
    const res = await fetch(`/api/goals/${updating.goal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current: v, notes: updating.notes }),
    });
    if (!res.ok) return toast("Update failed", "er");
    setGoals(p => p.map(x => x.id === updating.goal.id ? { ...x, current: v, notes: updating.notes || null } : x));
    setUpdating(null);
    toast(`${updating.goal.name} updated`);
  };

  const goalForm = (
    <div>
      <FormField label="Goal Name"><HubInput value={form.name} onChange={e => setForm(p => ({...p,name:e.target.value}))} placeholder="e.g. Annual Revenue, NPS Score…" /></FormField>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
        <FormField label="Target"><HubInput type="number" value={form.target} onChange={e => setForm(p => ({...p,target:+e.target.value}))} /></FormField>
        <FormField label="Current"><HubInput type="number" value={form.current} onChange={e => setForm(p => ({...p,current:+e.target.value}))} /></FormField>
        <FormField label="Format">
          <HubSelect value={form.format} onChange={e => setForm(p => ({...p,format:e.target.value as Goal["format"]}))}>
            <option value="number">Number</option>
            <option value="currency">Currency</option>
            <option value="percent">Percent</option>
          </HubSelect>
        </FormField>
      </div>
      <FormField label="Color">
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {COLORS.map(c => <button key={c} onClick={() => setForm(p => ({...p,color:c}))} style={{ width:26, height:26, borderRadius:"50%", background:c, cursor:"pointer", border:`3px solid ${form.color===c?"var(--text-primary)":"transparent"}` }} />)}
        </div>
      </FormField>
      <FormField label="Notes (optional)">
        <textarea
          value={form.notes}
          onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
          placeholder="Context, milestones, whatever helps…"
          rows={3}
          style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-card)", borderRadius: "var(--radius-md)", padding: "8px 12px", fontSize: 13, color: "var(--text-primary)", outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
        />
      </FormField>
    </div>
  );

  return (
    <AppLayout title="Goals & OKRs" onNew={() => { setForm({...blank}); setShowAdd(true); }} newLabel="Add Goal">
      <ToastList ts={ts} />
      <div style={{ fontSize:12, color:"var(--text-secondary)", marginBottom:14 }}>
        {goals.length} goal{goals.length!==1?"s":""} tracked · {goals.filter(g=>(g.current/Math.max(g.target,1))>=1).length} completed
      </div>

      {loading ? (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:12 }}>
          {[0,1,2,3].map(i => <div key={i} className="skeleton" style={{ height:150, borderRadius:12 }} />)}
        </div>
      ) : goals.length === 0 ? (
        <EmptyState icon="◉" title="No goals yet" desc="Set your first goal to start tracking progress." action={<button onClick={() => setShowAdd(true)} style={{ padding:"8px 18px", borderRadius:8, background:"var(--accent)", color:"#fff", border:"none", fontWeight:700, fontSize:13, cursor:"pointer" }}>Add Goal</button>} />
      ) : (
        <Sortable
          items={goals}
          onReorder={handleReorder}
          strategy="grid"
          disabled={!canReorder}
          renderOverlay={g => <GoalCardPreview g={g} />}
        >
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(340px,1fr))", gap:12 }} className="stagger-children">
            {goals.map(g => (
              <GoalCard
                key={g.id}
                g={g}
                dragEnabled={canReorder}
                onUpdate={() => openUpdate(g)}
                onEdit={() => { setEditing(g); setForm({ name:g.name, target:g.target, current:g.current, format:g.format, color:g.color, notes: g.notes ?? "" }); }}
                onDelete={() => setDeleting(g)}
              />
            ))}
          </div>
        </Sortable>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Goal">
        {goalForm}
        <div style={{ display:"flex", gap:9, justifyContent:"flex-end", marginTop:4 }}>
          <button onClick={() => setShowAdd(false)} style={{ padding:"7px 14px", borderRadius:8, border:"1px solid var(--border-card)", background:"var(--bg-input)", color:"var(--text-primary)", fontSize:12, fontWeight:600, cursor:"pointer" }}>Cancel</button>
          <button onClick={save} style={{ padding:"7px 14px", borderRadius:8, background:"var(--accent)", color:"#fff", border:"none", fontSize:12, fontWeight:700, cursor:"pointer" }}>Add Goal</button>
        </div>
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Edit: ${editing?.name}`}>
        {goalForm}
        <div style={{ display:"flex", gap:9, justifyContent:"flex-end", marginTop:4 }}>
          <button onClick={() => setEditing(null)} style={{ padding:"7px 14px", borderRadius:8, border:"1px solid var(--border-card)", background:"var(--bg-input)", color:"var(--text-primary)", fontSize:12, fontWeight:600, cursor:"pointer" }}>Cancel</button>
          <button onClick={update} style={{ padding:"7px 14px", borderRadius:8, background:"var(--accent)", color:"#fff", border:"none", fontSize:12, fontWeight:700, cursor:"pointer" }}>Save Changes</button>
        </div>
      </Modal>

      <Modal
        open={!!updating}
        onClose={() => setUpdating(null)}
        title={`Update: ${updating?.goal.name ?? ""}`}
        width={420}
      >
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 8 }}>
            Current:&nbsp;
            <strong style={{ color: "var(--text-primary)" }}>
              {updating ? formatValue(updating.goal.current, updating.goal.format) : ""}
            </strong>
            &nbsp;·&nbsp;Target:&nbsp;
            <strong style={{ color: "var(--text-primary)" }}>
              {updating ? formatValue(updating.goal.target, updating.goal.format) : ""}
            </strong>
          </div>
          <FormField label="New current value">
            <HubInput
              type="number"
              value={updating?.value ?? ""}
              onChange={e => setUpdating(p => (p ? { ...p, value: e.target.value } : null))}
              autoFocus
            />
          </FormField>
          <FormField label="Notes (optional)">
            <textarea
              value={updating?.notes ?? ""}
              onChange={e => setUpdating(p => (p ? { ...p, notes: e.target.value } : null))}
              placeholder="What changed, any context…"
              rows={3}
              style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-card)", borderRadius: "var(--radius-md)", padding: "8px 12px", fontSize: 13, color: "var(--text-primary)", outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
            />
          </FormField>
        </div>
        <div style={{ display: "flex", gap: 9, justifyContent: "flex-end" }}>
          <button onClick={() => setUpdating(null)} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
          <button onClick={saveUpdate} style={{ padding: "7px 14px", borderRadius: 8, background: "var(--accent)", color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Save</button>
        </div>
      </Modal>

      <ConfirmModal open={!!deleting} onClose={() => setDeleting(null)} onConfirm={del} name={deleting?.name ?? ""} entity="goal" />
    </AppLayout>
  );
}

function GoalCardBody({
  g,
  dragHandle,
  actions,
}: {
  g: Goal;
  dragHandle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const pct = Math.min(100, (g.current / Math.max(g.target, 1)) * 100);
  const done = pct >= 100;
  return (
    <Card>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
        <div style={{ display:"flex", alignItems:"center", gap:6, flex:1, marginRight:8, minWidth:0 }}>
          {dragHandle}
          <div style={{ fontSize:13, fontWeight:700, color:"var(--text-primary)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{g.name}</div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          {done && <span style={{ fontSize:14 }}>🎉</span>}
          <div style={{ fontSize:14, fontWeight:800, color:g.color }}>{Math.round(pct)}%</div>
        </div>
      </div>
      <ProgressBar value={pct} color={g.color} height={8} />
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"var(--text-secondary)", marginTop:8, marginBottom:g.notes ? 8 : 12 }}>
        <span>Current: <strong style={{ color:"var(--text-primary)" }}>{formatValue(g.current, g.format)}</strong></span>
        <span>Target: <strong style={{ color:"var(--text-primary)" }}>{formatValue(g.target, g.format)}</strong></span>
      </div>
      {g.notes && (
        <div style={{ fontSize:11, color:"var(--text-secondary)", padding:"8px 10px", borderRadius:7, background:"var(--bg-input)", marginBottom:12, lineHeight:1.5, whiteSpace:"pre-wrap" }}>
          {g.notes}
        </div>
      )}
      {actions}
    </Card>
  );
}

function GoalCard({
  g,
  dragEnabled,
  onUpdate,
  onEdit,
  onDelete,
}: {
  g: Goal;
  dragEnabled: boolean;
  onUpdate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { setNodeRef, style, listeners, attributes } = useSortableItem(g.id);
  // Whole card draggable. The grip is just a passive visual cue.
  const handle = dragEnabled ? (
    <span aria-hidden style={{ color: "var(--text-muted)", display: "inline-flex", opacity: 0.5 }}>
      <GripVertical size={14} />
    </span>
  ) : undefined;
  const actions = (
    // Stop pointerdown on the action row so dragging doesn't kick in when
    // a user clicks Update / Edit / Delete.
    <div style={{ display:"flex", gap:7 }} onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
      <button onClick={onUpdate} style={{ flex:1, padding:"5px 8px", borderRadius:7, border:`1px solid ${g.color}44`, background:`${g.color}11`, color:g.color, fontSize:11, fontWeight:700, cursor:"pointer" }}>Update</button>
      <button onClick={onEdit} style={{ padding:"5px 10px", borderRadius:7, fontSize:11, fontWeight:700, cursor:"pointer", border:"1px solid var(--border-card)", background:"var(--bg-input)", color:"var(--text-primary)" }}>Edit</button>
      <button onClick={onDelete} style={{ padding:"5px 10px", borderRadius:7, fontSize:11, fontWeight:700, cursor:"pointer", background:"var(--danger-bg)", color:"var(--danger)", borderColor:"rgba(220,38,38,.3)", border:"1px solid rgba(220,38,38,.3)" }}>✕</button>
    </div>
  );
  return (
    <div
      ref={dragEnabled ? setNodeRef : undefined}
      style={{
        ...(dragEnabled ? style : {}),
        cursor: dragEnabled ? "grab" : undefined,
        touchAction: dragEnabled ? "none" : undefined,
      }}
      {...(dragEnabled ? listeners : {})}
      {...(dragEnabled ? attributes : {})}
    >
      <GoalCardBody g={g} dragHandle={handle} actions={actions} />
    </div>
  );
}

function GoalCardPreview({ g }: { g: Goal }) {
  return (
    <div style={overlayCardStyle}>
      <GoalCardBody
        g={g}
        dragHandle={<GripVertical size={14} style={{ color: "var(--text-muted)" }} />}
      />
    </div>
  );
}
