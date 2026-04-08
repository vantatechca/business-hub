"use client";
import { useState, useEffect } from "react";
import AppLayout from "@/components/Layout";
import { Card, ProgressBar, Modal, FormField, HubInput, HubSelect, ConfirmModal, useToast, ToastList, EmptyState, formatValue } from "@/components/ui/shared";
import type { Goal } from "@/lib/types";

const COLORS = ["#34d399","#5b8ef8","#a78bfa","#fbbf24","#f87171","#22d3ee","#fb923c","#6366f1","#84cc16","#e879f9"];
const blank = { name:"", target:100, current:0, format:"number" as Goal["format"], color:COLORS[0] };

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [deleting, setDeleting] = useState<Goal | null>(null);
  const [form, setForm] = useState<typeof blank>({ ...blank });
  const { ts, toast } = useToast();

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

  const bump = async (g: Goal) => {
    const inc = Math.max(1, Math.round(g.target * 0.05));
    const current = Math.min(g.target, g.current + inc);
    await fetch(`/api/goals/${g.id}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ current }) });
    setGoals(p => p.map(x => x.id === g.id ? { ...x, current } : x));
    toast(`+${formatValue(inc, g.format)} progress`);
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
    </div>
  );

  const ActionBtn = ({ onClick, children, style={} }: { onClick:()=>void; children:React.ReactNode; style?:React.CSSProperties }) => (
    <button onClick={onClick} style={{ padding:"5px 10px", borderRadius:7, fontSize:11, fontWeight:700, cursor:"pointer", border:"1px solid var(--border-card)", background:"var(--bg-input)", color:"var(--text-primary)", ...style }}>{children}</button>
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
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(340px,1fr))", gap:12 }} className="stagger-children">
          {goals.map(g => {
            const pct = Math.min(100, (g.current / Math.max(g.target, 1)) * 100);
            const done = pct >= 100;
            return (
              <Card key={g.id}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"var(--text-primary)", flex:1, marginRight:8 }}>{g.name}</div>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    {done && <span style={{ fontSize:14 }}>🎉</span>}
                    <div style={{ fontSize:14, fontWeight:800, color:g.color }}>{Math.round(pct)}%</div>
                  </div>
                </div>
                <ProgressBar value={pct} color={g.color} height={8} />
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"var(--text-secondary)", marginTop:8, marginBottom:12 }}>
                  <span>Current: <strong style={{ color:"var(--text-primary)" }}>{formatValue(g.current, g.format)}</strong></span>
                  <span>Target: <strong style={{ color:"var(--text-primary)" }}>{formatValue(g.target, g.format)}</strong></span>
                </div>
                <div style={{ display:"flex", gap:7 }}>
                  {!done && <button onClick={() => bump(g)} style={{ flex:1, padding:"5px 8px", borderRadius:7, border:`1px solid ${g.color}44`, background:`${g.color}11`, color:g.color, fontSize:11, fontWeight:700, cursor:"pointer" }}>+5% Progress</button>}
                  <ActionBtn onClick={() => { setEditing(g); setForm({ name:g.name, target:g.target, current:g.current, format:g.format, color:g.color }); }}>Edit</ActionBtn>
                  <ActionBtn onClick={() => setDeleting(g)} style={{ background:"var(--danger-bg)", color:"var(--danger)", borderColor:"rgba(220,38,38,.3)" }}>✕</ActionBtn>
                </div>
              </Card>
            );
          })}
        </div>
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

      <ConfirmModal open={!!deleting} onClose={() => setDeleting(null)} onConfirm={del} name={deleting?.name ?? ""} entity="goal" />
    </AppLayout>
  );
}
