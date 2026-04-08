"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import AppLayout from "@/components/Layout";
import { Card, Modal, FormField, HubInput, HubSelect, ConfirmModal, useToast, ToastList, EmptyState, ProgressBar, formatMetricValue, priorityColor, priorityLabel, healthColor } from "@/components/ui/shared";
import { Sortable, useSortableItem, DragHandle, overlayCardStyle } from "@/components/ui/Sortable";
import { GripVertical } from "lucide-react";
import MetricHistoryDrawer from "@/components/MetricHistoryDrawer";
import DueAlertBanner from "@/components/DueAlertBanner";
import type { Metric, Department } from "@/lib/types";
import { metricDelta, PRIORITY_OPTIONS, priorityToOption } from "@/lib/types";

// The DB stores 'value' but the UI label is "Total" — keep the storage value
// unchanged so existing rows don't need a migration / CHECK constraint update.
const TYPES: { value: Metric["metricType"]; label: string }[] = [
  { value: "value", label: "Total" },
  { value: "daily", label: "Daily" },
];
const DIRS  = ["higher_better","lower_better"];
const UNITS = ["count","USD","CAD","minutes","percent","pages","accounts"];
const blank = { departmentId:"", name:"", metricType:"value" as Metric["metricType"], direction:"higher_better" as Metric["direction"], currentValue:0, targetValue:undefined as number|undefined, unit:"count", priorityScore:25, notes:"", dueDate:"" as string };

// Convert a stored metric_type to its UI label.
function metricTypeLabel(t: string): string {
  if (t === "value") return "Total";
  if (t === "daily") return "Daily";
  return t.replace(/_/g, " ");
}

export default function MetricsPage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role ?? "member";
  const canReorder = role === "admin" || role === "super_admin" || role === "manager" || role === "leader";

  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [depts, setDepts]     = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ]             = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Metric | null>(null);
  const [deleting, setDeleting] = useState<Metric | null>(null);
  const [form, setForm]       = useState<typeof blank>({ ...blank });
  const [updating, setUpdating] = useState<{ metric: Metric; value: string } | null>(null);
  const [viewing, setViewing] = useState<Metric | null>(null);
  const { ts, toast } = useToast();

  const load = () => Promise.all([
    fetch("/api/metrics").then(r => r.json()),
    fetch("/api/departments").then(r => r.json()),
  ]).then(([m, d]) => { setMetrics(m.data ?? []); setDepts(d.data ?? []); setLoading(false); });

  useEffect(() => { load(); }, []);

  const filtered = metrics.filter(m =>
    m.name.toLowerCase().includes(q.toLowerCase()) &&
    (!deptFilter || m.departmentId === deptFilter) &&
    (!typeFilter || m.metricType === typeFilter)
  );
  const filterActive = !!(q || deptFilter || typeFilter);
  const dragEnabled = canReorder && !filterActive;

  const handleReorder = async (ids: (string | number)[]) => {
    // Optimistic: reorder local state to match dropped order
    const map = new Map(metrics.map(m => [String(m.id), m]));
    const next = ids.map(id => map.get(String(id))).filter(Boolean) as Metric[];
    // Preserve any items not in the dragged view (shouldn't happen since dragEnabled
    // only when filters inactive, but defensive)
    const used = new Set(ids.map(String));
    const rest = metrics.filter(m => !used.has(String(m.id)));
    setMetrics([...next, ...rest]);
    const res = await fetch("/api/metrics/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) { toast("Reorder failed", "er"); await load(); }
  };

  const save = async () => {
    if (!form.name || !form.departmentId) return toast("Name and department required", "er");
    const res = await fetch("/api/metrics", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(form) });
    if (!res.ok) { const e = await res.json(); return toast(e.error || "Failed", "er"); }
    await load(); setShowAdd(false); toast(`${form.name} added`);
  };

  const update = async () => {
    if (!editing) return;
    const res = await fetch(`/api/metrics/${editing.id}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify(form) });
    if (!res.ok) return toast("Update failed", "er");
    await load(); setEditing(null); toast("Metric updated");
  };

  const del = async () => {
    if (!deleting) return;
    await fetch(`/api/metrics/${deleting.id}`, { method:"DELETE" });
    await load(); toast("Metric deleted", "er");
  };

  const quickUpdate = async () => {
    if (!updating) return;
    const val = parseFloat(updating.value);
    if (isNaN(val)) return toast("Invalid value", "er");
    const res = await fetch(`/api/metrics/${updating.metric.id}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ currentValue: val, source:"manual" }) });
    if (!res.ok) return toast("Update failed", "er");
    await load(); setUpdating(null); toast(`${updating.metric.name} updated`);
  };

  const openEdit = (m: Metric) => {
    setEditing(m);
    setForm({
      departmentId: m.departmentId,
      name: m.name,
      metricType: m.metricType,
      direction: m.direction,
      currentValue: m.currentValue,
      targetValue: m.targetValue,
      unit: m.unit,
      priorityScore: m.priorityScore,
      notes: m.notes ?? "",
      dueDate: ((m as unknown as { dueDate?: string | null }).dueDate) ?? "",
    });
  };

  const metricForm = (
    <div>
      <FormField label="Department">
        <HubSelect value={form.departmentId} onChange={e => setForm(p => ({...p, departmentId:e.target.value}))}>
          <option value="">Select department…</option>
          {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </HubSelect>
      </FormField>
      <FormField label="Metric Name"><HubInput value={form.name} onChange={e => setForm(p => ({...p, name:e.target.value}))} placeholder="e.g. GMC accounts created today"/></FormField>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:11 }}>
        <FormField label="Type">
          <HubSelect value={form.metricType} onChange={e => setForm(p => ({...p, metricType:e.target.value as Metric["metricType"]}))}>
            {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </HubSelect>
        </FormField>
        <FormField label="Direction">
          <HubSelect value={form.direction} onChange={e => setForm(p => ({...p, direction:e.target.value as Metric["direction"]}))}>
            {DIRS.map(d => <option key={d} value={d}>{d.replace(/_/g," ")}</option>)}
          </HubSelect>
        </FormField>
        <FormField label="Unit">
          <HubSelect value={form.unit} onChange={e => setForm(p => ({...p, unit:e.target.value}))}>
            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </HubSelect>
        </FormField>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:11 }}>
        <FormField label="Current Value"><HubInput type="number" value={form.currentValue} onChange={e => setForm(p => ({...p, currentValue:+e.target.value}))}/></FormField>
        <FormField label="Target Value"><HubInput type="number" value={form.targetValue ?? ""} onChange={e => setForm(p => ({...p, targetValue:e.target.value?+e.target.value:undefined}))} placeholder="Optional"/></FormField>
        <FormField label="Priority">
          <HubSelect
            value={String(priorityToOption(form.priorityScore))}
            onChange={e => setForm(p => ({ ...p, priorityScore: Number(e.target.value) }))}
          >
            {PRIORITY_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </HubSelect>
        </FormField>
      </div>
      <FormField label="Notes"><HubInput value={form.notes} onChange={e => setForm(p => ({...p, notes:e.target.value}))} placeholder="Operational notes…"/></FormField>
      <FormField label="Due Date (optional)">
        <HubInput
          type="date"
          value={form.dueDate}
          onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))}
        />
      </FormField>
    </div>
  );

  const actionBtns = (onSave: () => void, onCancel: () => void, label: string) => (
    <div style={{ display:"flex", gap:9, justifyContent:"flex-end", marginTop:4 }}>
      <button onClick={onCancel} style={{ padding:"7px 14px", borderRadius:8, border:"1px solid var(--border-card)", background:"var(--bg-input)", color:"var(--text-primary)", fontSize:12, fontWeight:600, cursor:"pointer" }}>Cancel</button>
      <button onClick={onSave} style={{ padding:"7px 14px", borderRadius:8, background:"var(--accent)", color:"#fff", border:"none", fontSize:12, fontWeight:700, cursor:"pointer" }}>{label}</button>
    </div>
  );

  return (
    <AppLayout title="Metrics" onNew={() => { setForm({...blank, departmentId: depts[0]?.id ?? ""}); setShowAdd(true); }} newLabel="Add Metric">
      <ToastList ts={ts} />

      <DueAlertBanner
        items={metrics.map(m => ({
          id: m.id,
          title: m.name,
          dueDate: m.dueDate ?? null,
          metricType: m.metricType,
          departmentName: m.departmentName,
        }))}
        label="metrics"
      />

      {/* Summary bar */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:11, marginBottom:14 }}>
        {[
          { l:"Total Metrics",   v:metrics.length,                                                 c:"var(--accent)" },
          { l:"Above Target",    v:metrics.filter(m => m.targetValue && m.currentValue >= m.targetValue).length, c:"var(--success)" },
          { l:"Needs Attention", v:metrics.filter(m => { const d=metricDelta(m); return !d.isGood && Math.abs(d.value)>0; }).length, c:"var(--danger)" },
          { l:"High Priority",   v:metrics.filter(m => m.priorityScore >= 80).length,             c:"var(--warning)" },
        ].map((s,i) => (
          <Card key={i}>
            <div style={{ fontSize:11, fontWeight:600, color:"var(--text-secondary)", marginBottom:6 }}>{s.l}</div>
            <div style={{ fontSize:24, fontWeight:800, letterSpacing:"-0.02em", color:s.c }}>{s.v}</div>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display:"flex", gap:10, marginBottom:14, flexWrap:"wrap" }}>
        <div style={{ flex:1, minWidth:180, display:"flex", alignItems:"center", gap:8, background:"var(--bg-card)", border:"1px solid var(--border-card)", borderRadius:8, padding:"7px 11px" }}>
          <span style={{ color:"var(--text-muted)" }}>⌕</span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search metrics…" style={{ border:"none", background:"transparent", outline:"none", fontSize:12, color:"var(--text-primary)", width:"100%" }}/>
        </div>
        <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} style={{ background:"var(--bg-card)", border:"1px solid var(--border-card)", borderRadius:8, padding:"7px 11px", color:"var(--text-primary)", fontSize:12, outline:"none" }}>
          <option value="">All Departments</option>
          {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ background:"var(--bg-card)", border:"1px solid var(--border-card)", borderRadius:8, padding:"7px 11px", color:"var(--text-primary)", fontSize:12, outline:"none" }}>
          <option value="">All Types</option>
          {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <span style={{ fontSize:12, color:"var(--text-secondary)", alignSelf:"center" }}>{filtered.length} metrics</span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="skeleton" style={{ height:400, borderRadius:12 }}/>
      ) : filtered.length === 0 ? (
        <EmptyState icon="📊" title="No metrics found" desc="Try adjusting filters or add your first metric."/>
      ) : (
        <div className="hub-card" style={{ padding:0, overflow:"hidden" }}>
          <table className="hub-table">
            <thead>
              <tr>{[dragEnabled ? "" : null,"Metric","Department","Type","Current","Target","Progress","Priority",""].filter(h=>h!==null).map((h,i) => <th key={i}>{h}</th>)}</tr>
            </thead>
            <Sortable
              items={filtered}
              onReorder={handleReorder}
              strategy="vertical"
              disabled={!dragEnabled}
              renderOverlay={m => <MetricRowPreview m={m} />}
            >
              <tbody>
                {filtered.map(m => (
                  <MetricRow
                    key={m.id}
                    m={m}
                    dragEnabled={dragEnabled}
                    onView={() => setViewing(m)}
                    onUpdate={() => setUpdating({ metric:m, value:String(m.currentValue) })}
                    onEdit={() => openEdit(m)}
                    onDelete={() => setDeleting(m)}
                  />
                ))}
              </tbody>
            </Sortable>
          </table>
        </div>
      )}

      {/* Quick value update modal */}
      <Modal open={!!updating} onClose={() => setUpdating(null)} title={`Update: ${updating?.metric.name}`} width={380}>
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:12, color:"var(--text-secondary)", marginBottom:10 }}>Current value: <strong style={{ color:"var(--text-primary)" }}>{updating ? formatMetricValue(updating.metric.currentValue, updating.metric.unit) : ""}</strong></div>
          <FormField label="New Value">
            <HubInput type="number" value={updating?.value ?? ""} onChange={e => setUpdating(p => p ? {...p, value:e.target.value} : null)} autoFocus/>
          </FormField>
          <div style={{ fontSize:11, color:"var(--text-muted)" }}>This will be logged in the audit trail.</div>
        </div>
        {actionBtns(quickUpdate, () => setUpdating(null), "Update Value")}
      </Modal>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Metric" width={560}>{metricForm}{actionBtns(save, () => setShowAdd(false), "Add Metric")}</Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Edit: ${editing?.name}`} width={560}>{metricForm}{actionBtns(update, () => setEditing(null), "Save Changes")}</Modal>
      <ConfirmModal open={!!deleting} onClose={() => setDeleting(null)} onConfirm={del} name={deleting?.name ?? ""} entity="metric"/>
      <MetricHistoryDrawer metric={viewing} open={!!viewing} onClose={() => setViewing(null)} />
    </AppLayout>
  );
}

function MetricRow({
  m,
  dragEnabled,
  onView,
  onUpdate,
  onEdit,
  onDelete,
}: {
  m: Metric;
  dragEnabled: boolean;
  onView: () => void;
  onUpdate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { setNodeRef, style, listeners, attributes } = useSortableItem(m.id);
  const pct = m.targetValue ? Math.min(100, Math.round((m.currentValue / m.targetValue) * 100)) : null;
  const { isGood, value: delta } = metricDelta(m);
  const pc = priorityColor(m.priorityScore);
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <tr
      ref={dragEnabled ? setNodeRef : undefined}
      style={{ ...(dragEnabled ? style : {}), cursor: "pointer" }}
      onClick={onView}
    >
      {dragEnabled && (
        <td style={{ width:26 }} onClick={stop}>
          <DragHandle listeners={listeners} attributes={attributes} />
        </td>
      )}
      <td>
        <div>
          <div style={{ fontSize:12, fontWeight:700, color:"var(--text-primary)", maxWidth:200, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{m.name}</div>
          {m.notes && <div style={{ fontSize:10, color:"var(--text-muted)", marginTop:2 }}>{m.notes.slice(0,40)}</div>}
        </div>
      </td>
      <td>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <div style={{ width:6, height:6, borderRadius:"50%", background:m.departmentColor ?? "var(--accent)" }}/>
          <span style={{ fontSize:11, color:"var(--text-secondary)" }}>{m.departmentName}</span>
        </div>
      </td>
      <td><span style={{ fontSize:10, padding:"2px 7px", borderRadius:5, background:"var(--bg-input)", color:"var(--text-secondary)", fontWeight:700 }}>{metricTypeLabel(m.metricType)}</span></td>
      <td>
        <div>
          <div style={{ fontSize:13, fontWeight:800, color: isGood ? "var(--success)" : delta !== 0 ? "var(--danger)" : "var(--text-primary)" }}>
            {formatMetricValue(m.currentValue, m.unit)}
          </div>
          {delta !== 0 && <div style={{ fontSize:10, color: isGood ? "var(--success)" : "var(--danger)" }}>{delta > 0 ? "↑" : "↓"} {Math.abs(delta).toLocaleString()}</div>}
        </div>
      </td>
      <td style={{ fontSize:12, color:"var(--text-secondary)" }}>{m.targetValue ? formatMetricValue(m.targetValue, m.unit) : "—"}</td>
      <td style={{ minWidth:100 }}>
        {pct !== null ? (
          <div>
            <ProgressBar value={pct} color={healthColor(pct)} height={5}/>
            <div style={{ fontSize:10, color:"var(--text-muted)", marginTop:3 }}>{pct}%</div>
          </div>
        ) : <span style={{ color:"var(--text-muted)", fontSize:12 }}>—</span>}
      </td>
      <td>
        <span style={{ padding:"2px 8px", borderRadius:6, fontSize:10, fontWeight:700, background:`${pc}18`, color:pc }}>
          {priorityLabel(m.priorityScore)}
        </span>
      </td>
      <td onClick={stop}>
        <div style={{ display:"flex", gap:5 }}>
          <button onClick={onUpdate} style={{ padding:"4px 9px", borderRadius:7, border:"1px solid var(--border-card)", background:"var(--bg-input)", color:"var(--text-primary)", fontSize:11, cursor:"pointer" }}>Update</button>
          <button onClick={onEdit} style={{ padding:"4px 9px", borderRadius:7, border:"1px solid var(--border-card)", background:"var(--bg-input)", color:"var(--text-secondary)", fontSize:11, cursor:"pointer" }}>Edit</button>
          <button onClick={onDelete} style={{ padding:"4px 7px", borderRadius:7, border:"1px solid rgba(220,38,38,.3)", background:"var(--danger-bg)", color:"var(--danger)", fontSize:11, cursor:"pointer" }}>✕</button>
        </div>
      </td>
    </tr>
  );
}

// DragOverlay renders outside the table via a portal, so a <tr> clone would
// lose its table layout. Render a div-based card instead that summarizes the
// metric being dragged.
function MetricRowPreview({ m }: { m: Metric }) {
  const pc = priorityColor(m.priorityScore);
  return (
    <div
      className="hub-card"
      style={{
        ...overlayCardStyle,
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        minWidth: 420,
        background: "var(--bg-card)",
      }}
    >
      <GripVertical size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: m.departmentColor ?? "var(--accent)" }} />
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{m.departmentName}</span>
        </div>
      </div>
      <div style={{ fontSize: 14, fontWeight: 800, color: "var(--accent)", flexShrink: 0 }}>
        {formatMetricValue(m.currentValue, m.unit)}
      </div>
      <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: `${pc}18`, color: pc, flexShrink: 0 }}>
        {priorityLabel(m.priorityScore)}
      </span>
    </div>
  );
}
