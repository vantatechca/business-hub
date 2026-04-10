"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import AppLayout from "@/components/Layout";
import {
  Card, Modal, FormField, HubInput, HubSelect, HubTextarea,
  ConfirmModal, useToast, ToastList, EmptyState, formatMetricValue,
} from "@/components/ui/shared";
import MetricHistoryDrawer from "@/components/MetricHistoryDrawer";
import DueAlertBanner from "@/components/DueAlertBanner";
import type { Metric, Department } from "@/lib/types";
import { metricDelta, PRIORITY_OPTIONS, priorityToOption } from "@/lib/types";
import { ChevronDown, Pencil, Trash2, Calendar } from "lucide-react";

// ── CONSTANTS ─────────────────────────────────────────────────
const TYPES: { value: Metric["metricType"]; label: string }[] = [
  { value: "value", label: "Total" },
  { value: "daily", label: "Daily" },
];
const DIRS  = ["higher_better", "lower_better"];
const UNITS = ["count", "USD", "CAD", "minutes", "percent", "pages", "accounts"];
const blank = {
  departmentId: "", name: "", metricType: "value" as Metric["metricType"],
  direction: "higher_better" as Metric["direction"], currentValue: 0,
  targetValue: undefined as number | undefined, unit: "count",
  priorityScore: 25, notes: "", dueDate: "" as string,
};

// ── HELPERS ───────────────────────────────────────────────────

/** Auto-linkify URLs in text. */
function Linkify({ text }: { text: string }) {
  if (!text) return null;
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={i} href={part} target="_blank" rel="noopener noreferrer"
            style={{ color: "var(--accent)", textDecoration: "none", wordBreak: "break-all" }}
            onClick={e => e.stopPropagation()}
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

const iconBtn: React.CSSProperties = {
  background: "transparent", border: "none", color: "var(--text-muted)",
  cursor: "pointer", padding: 4, display: "flex", borderRadius: 4,
};

// ── MAIN PAGE ─────────────────────────────────────────────────
export default function MetricsPage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role ?? "member";
  const userId = (session?.user as { id?: string })?.id;
  // canEditDetails: full CRUD on metrics (add, edit name/type/etc., delete)
  const canEditDetails = role === "admin" || role === "super_admin" || role === "manager" || role === "leader";
  // canUpdateValues: can update metric values (numbers). Leads and members
  // can update values for metrics they are assigned to. The API enforces
  // the assignment check server-side.
  const canUpdateValues = true; // everyone logged in can attempt; API enforces assignment

  const [metrics, setMetrics]     = useState<Metric[]>([]);
  const [depts, setDepts]         = useState<Department[]>([]);
  const [loading, setLoading]     = useState(true);
  const [q, setQ]                 = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showAdd, setShowAdd]     = useState(false);
  const [editing, setEditing]     = useState<Metric | null>(null);
  const [deleting, setDeleting]   = useState<Metric | null>(null);
  const [form, setForm]           = useState<typeof blank>({ ...blank });
  const [viewing, setViewing]     = useState<Metric | null>(null);
  const [collapsed, setCollapsedRaw] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem("metrics_collapsed") ?? "{}"); } catch { return {}; }
  });
  const setCollapsed = (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => {
    setCollapsedRaw(prev => {
      const next = fn(prev);
      try { localStorage.setItem("metrics_collapsed", JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const [myAssignedIds, setMyAssignedIds] = useState<Set<string>>(new Set());
  // Department notes editing
  const [deptNotesModal, setDeptNotesModal] = useState<Department | null>(null);
  const [deptNotesForm, setDeptNotesForm]   = useState({ notes: "" });
  const [showNewDept, setShowNewDept] = useState(false);
  const [newDeptName, setNewDeptName] = useState("");
  const { ts, toast } = useToast();

  // ── DATA LOADING ──────────────────────────────────────────
  const load = useCallback(() =>
    Promise.all([
      fetch("/api/metrics").then(r => r.json()),
      fetch("/api/departments").then(r => r.json()),
      userId ? fetch(`/api/metrics?userId=${userId}`).then(r => r.json()) : Promise.resolve({ data: [] }),
    ]).then(([m, d, myM]) => {
      setMetrics(m.data ?? []);
      setDepts(d.data ?? []);
      setMyAssignedIds(new Set((myM.data ?? []).map((x: { id: string }) => x.id)));
      setLoading(false);
    }), [userId]);

  useEffect(() => { load(); }, [load]);

  // ── FILTERING ─────────────────────────────────────────────
  const filtered = metrics.filter(m =>
    m.name.toLowerCase().includes(q.toLowerCase()) &&
    (!deptFilter || (deptFilter === "__general__" ? !m.departmentId : m.departmentId === deptFilter)) &&
    (!typeFilter || m.metricType === typeFilter),
  );

  // Group by department, preserving sort order. Metrics with no department
  // go into a special "__general__" bucket rendered as "General".
  const GENERAL_KEY = "__general__";
  const byDeptId = filtered.reduce<Record<string, Metric[]>>((acc, m) => {
    const k = m.departmentId || GENERAL_KEY;
    if (!acc[k]) acc[k] = [];
    acc[k].push(m);
    return acc;
  }, {});
  const orderedDeptIds = [
    ...depts.map(d => d.id).filter(id => byDeptId[id]?.length > 0),
    ...(byDeptId[GENERAL_KEY]?.length ? [GENERAL_KEY] : []),
  ];

  // ── METRIC CRUD ───────────────────────────────────────────
  const save = async () => {
    if (!form.name) return toast("Name is required", "er");
    const res = await fetch("/api/metrics", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) { const e = await res.json(); return toast(e.error || "Failed", "er"); }
    await load(); setShowAdd(false); toast(`${form.name} added`);
  };

  const update = async () => {
    if (!editing) return;
    const res = await fetch(`/api/metrics/${editing.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) return toast("Update failed", "er");
    await load(); setEditing(null); toast("Metric updated");
  };

  const del = async () => {
    if (!deleting) return;
    await fetch(`/api/metrics/${deleting.id}`, { method: "DELETE" });
    await load(); toast("Metric deleted", "er");
  };

  const convertToTask = async (m: Metric, mode: "move" | "copy") => {
    const res = await fetch(`/api/metrics/${m.id}/convert`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); return toast(e.error || "Convert failed", "er"); }
    await load();
    setEditing(null);
    toast(mode === "move" ? `"${m.name}" moved to tasks` : `"${m.name}" copied as task`);
  };

  const quickUpdate = async (metricId: string, newValue: number) => {
    const res = await fetch(`/api/metrics/${metricId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentValue: newValue, source: "manual" }),
    });
    if (!res.ok) return toast("Update failed", "er");
    await load(); toast("Value updated");
  };

  const openEdit = (m: Metric) => {
    setEditing(m);
    setForm({
      departmentId: m.departmentId || "__general__", name: m.name, metricType: m.metricType,
      direction: m.direction, currentValue: m.currentValue,
      targetValue: m.targetValue, unit: m.unit, priorityScore: m.priorityScore,
      notes: m.notes ?? "",
      dueDate: ((m as unknown as { dueDate?: string | null }).dueDate) ?? "",
    });
  };

  // ── DEPARTMENT NOTES ──────────────────────────────────────
  const openDeptNotes = (dept: Department) => {
    setDeptNotesModal(dept);
    setDeptNotesForm({ notes: dept.notes ?? "" });
  };

  const saveDeptNotes = async () => {
    if (!deptNotesModal) return;
    const res = await fetch(`/api/departments/${deptNotesModal.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notes: deptNotesForm.notes || null,
      }),
    });
    if (!res.ok) return toast("Failed to update notes", "er");
    await load(); setDeptNotesModal(null); toast("Notes updated");
  };

  const clearDeptNotes = async (dept: Department) => {
    await fetch(`/api/departments/${dept.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: null }),
    });
    await load(); toast("Notes cleared");
  };

  const toggleCollapse = (deptId: string) =>
    setCollapsed(p => ({ ...p, [deptId]: !p[deptId] }));

  // ── METRIC FORM (shared add/edit) ─────────────────────────
  const metricForm = (
    <div>
      <FormField label="Department">
        <HubSelect
          value={form.departmentId}
          onChange={e => {
            if (e.target.value === "__new__") { setShowNewDept(true); setNewDeptName(""); }
            else setForm(p => ({ ...p, departmentId: e.target.value }));
          }}
        >
          <option value="__general__">General (no department)</option>
          {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          <option value="__new__">+ Add New Department</option>
        </HubSelect>
        {showNewDept && (
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <HubInput
              value={newDeptName}
              onChange={e => setNewDeptName(e.target.value)}
              placeholder="New department name…"
              autoFocus
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); document.getElementById("create-dept-btn")?.click(); } }}
            />
            <button
              id="create-dept-btn"
              onClick={async () => {
                if (!newDeptName.trim()) return;
                const res = await fetch("/api/departments", {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name: newDeptName.trim() }),
                });
                if (res.ok) {
                  const d = await res.json();
                  const newId = d.data?.id;
                  await load();
                  if (newId) setForm(p => ({ ...p, departmentId: String(newId) }));
                  setShowNewDept(false);
                  toast(`Department "${newDeptName.trim()}" created`);
                } else { toast("Failed to create department", "er"); }
              }}
              style={{ padding: "7px 14px", borderRadius: 8, background: "var(--accent)", color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
            >
              Add
            </button>
            <button
              onClick={() => setShowNewDept(false)}
              style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-secondary)", fontSize: 12, cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>
        )}
      </FormField>
      <FormField label="Metric Name">
        <HubInput value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. GMC accounts created today" />
      </FormField>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 11 }}>
        <FormField label="Type">
          <HubSelect value={form.metricType} onChange={e => setForm(p => ({ ...p, metricType: e.target.value as Metric["metricType"] }))}>
            {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </HubSelect>
        </FormField>
        <FormField label="Direction">
          <HubSelect value={form.direction} onChange={e => setForm(p => ({ ...p, direction: e.target.value as Metric["direction"] }))}>
            {DIRS.map(d => <option key={d} value={d}>{d.replace(/_/g, " ")}</option>)}
          </HubSelect>
        </FormField>
        <FormField label="Unit">
          <HubSelect value={form.unit} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))}>
            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </HubSelect>
        </FormField>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 11 }}>
        <FormField label="Current Value">
          <HubInput type="number" value={form.currentValue} onChange={e => setForm(p => ({ ...p, currentValue: +e.target.value }))} />
        </FormField>
        <FormField label="Target Value">
          <HubInput type="number" value={form.targetValue ?? ""} onChange={e => setForm(p => ({ ...p, targetValue: e.target.value ? +e.target.value : undefined }))} placeholder="Optional" />
        </FormField>
        <FormField label="Priority">
          <HubSelect value={String(priorityToOption(form.priorityScore))} onChange={e => setForm(p => ({ ...p, priorityScore: Number(e.target.value) }))}>
            {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </HubSelect>
        </FormField>
      </div>
      <FormField label="Notes">
        <HubInput value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Operational notes…" />
      </FormField>
      <FormField label="Due Date (optional)">
        <HubInput type="date" value={form.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))} />
      </FormField>
    </div>
  );

  const actionBtns = (onSave: () => void, onCancel: () => void, label: string) => (
    <div style={{ display: "flex", gap: 9, justifyContent: "flex-end", marginTop: 4 }}>
      <button onClick={onCancel} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
      <button onClick={onSave} style={{ padding: "7px 14px", borderRadius: 8, background: "var(--accent)", color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{label}</button>
    </div>
  );

  // ── RENDER ────────────────────────────────────────────────
  return (
    <AppLayout
      title="Assets"
      onNew={canEditDetails ? () => { setForm({ ...blank, departmentId: depts[0]?.id ?? "__general__" }); setShowAdd(true); } : undefined}
      newLabel="Add Metric"
    >
      <ToastList ts={ts} />
      <DueAlertBanner
        items={metrics.map(m => ({
          id: m.id, title: m.name, dueDate: m.dueDate ?? null,
          metricType: m.metricType, departmentName: m.departmentName,
        }))}
        label="metrics"
      />

      {/* Summary bar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 11, marginBottom: 14 }}>
        {[
          { l: "Total Metrics",   v: metrics.length,                                                           c: "var(--accent)" },
          { l: "Above Target",    v: metrics.filter(m => m.targetValue && m.currentValue >= m.targetValue).length, c: "var(--success)" },
          { l: "Needs Attention", v: metrics.filter(m => { const d = metricDelta(m); return !d.isGood && Math.abs(d.value) > 0; }).length, c: "var(--danger)" },
          { l: "High Priority",   v: metrics.filter(m => m.priorityScore >= 80).length,                        c: "var(--warning)" },
        ].map((s, i) => (
          <Card key={i}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>{s.l}</div>
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", color: s.c }}>{s.v}</div>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 180, display: "flex", alignItems: "center", gap: 8, background: "var(--bg-card)", border: "1px solid var(--border-card)", borderRadius: 8, padding: "7px 11px" }}>
          <span style={{ color: "var(--text-muted)" }}>⌕</span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search metrics…" style={{ border: "none", background: "transparent", outline: "none", fontSize: 12, color: "var(--text-primary)", width: "100%" }} />
        </div>
        <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} style={{ background: "var(--bg-card)", border: "1px solid var(--border-card)", borderRadius: 8, padding: "7px 11px", color: "var(--text-primary)", fontSize: 12, outline: "none" }}>
          <option value="">All Departments</option>
          {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          <option value="__general__">General (unassigned)</option>
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ background: "var(--bg-card)", border: "1px solid var(--border-card)", borderRadius: 8, padding: "7px 11px", color: "var(--text-primary)", fontSize: 12, outline: "none" }}>
          <option value="">All Types</option>
          {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <span style={{ fontSize: 12, color: "var(--text-secondary)", alignSelf: "center" }}>{filtered.length} metrics</span>
      </div>

      {/* ── DEPARTMENT SECTIONS ─────────────────────────────── */}
      {loading ? (
        <div className="skeleton" style={{ height: 400, borderRadius: 12 }} />
      ) : orderedDeptIds.length === 0 ? (
        <EmptyState icon="📊" title="No metrics found" desc="Try adjusting filters or add your first metric." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {orderedDeptIds.map(deptId => {
            const isGeneral = deptId === GENERAL_KEY;
            const dept: Department = isGeneral
              ? { id: GENERAL_KEY, name: "General", slug: "general", color: "#6b7280", icon: "📋", priorityScore: 0, sortOrder: 9999 }
              : depts.find(d => d.id === deptId)!;
            const deptMetrics = byDeptId[deptId];
            const isCollapsed = !!collapsed[deptId];
            const totalMetrics = deptMetrics.filter(m => m.metricType === "value" || m.metricType === "value_and_daily");
            const dailyMetrics = deptMetrics.filter(m => m.metricType === "daily" || m.metricType === "value_and_daily");
            const hasNotes = !!dept.notes;

            return (
              <div
                key={deptId}
                className="hub-card"
                style={{ borderLeft: `3px solid ${dept.color}`, padding: 0, overflow: "hidden" }}
              >
                {/* ── Department header ───────────────────── */}
                <div
                  onClick={() => toggleCollapse(deptId)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "14px 18px", cursor: "pointer", userSelect: "none",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)" }}>
                      {dept.icon} {dept.name}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
                      {deptMetrics.length} metric{deptMetrics.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <div style={{
                    color: "var(--text-muted)", transition: "transform .2s",
                    transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                    display: "flex",
                  }}>
                    <ChevronDown size={18} />
                  </div>
                </div>

                {!isCollapsed && (
                  <>
                    {/* ── Notes / link row (skip for General) ── */}
                    {!isGeneral && (hasNotes || canEditDetails) && (
                      <div style={{
                        display: "flex", alignItems: "flex-start", gap: 10,
                        padding: "10px 18px",
                        borderTop: "1px solid var(--border-divider)",
                        background: "var(--bg-input)",
                        fontSize: 12, color: "var(--text-secondary)",
                        minHeight: 38,
                      }}>
                        <div style={{ flex: 1, lineHeight: 1.6, overflowWrap: "break-word", minWidth: 0, whiteSpace: "pre-wrap" }}>
                          {dept.notes ? <Linkify text={dept.notes} /> : (
                            <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
                              Add notes or links…
                            </span>
                          )}
                        </div>
                        {canEditDetails && (
                          <div style={{ display: "flex", gap: 6, flexShrink: 0, marginTop: 2 }}>
                            <button onClick={e => { e.stopPropagation(); openDeptNotes(dept); }} style={iconBtn} title="Edit notes">
                              <Pencil size={14} />
                            </button>
                            {hasNotes && (
                              <button onClick={e => { e.stopPropagation(); clearDeptNotes(dept); }} style={iconBtn} title="Clear notes">
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Total metrics table ──────────────── */}
                    {totalMetrics.length > 0 && (
                      <div>
                        <div style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 100px 90px 90px 1fr 60px",
                          padding: "8px 18px",
                          borderTop: "1px solid var(--border-divider)",
                          background: "var(--bg-input)",
                        }}>
                          {["METRIC", "VALUE", "PREVIOUS", "CHANGE", "NOTES", ""].map((h, i) => (
                            <div key={i} style={{
                              fontSize: 10, fontWeight: 800, color: "var(--text-muted)",
                              letterSpacing: ".07em", textTransform: "uppercase",
                            }}>
                              {h}
                            </div>
                          ))}
                        </div>
                        {totalMetrics.map(m => (
                          <TotalMetricRow
                            key={m.id} m={m} canEditDetails={canEditDetails} canUpdateValue={canUpdateValues && (canEditDetails || myAssignedIds.has(m.id))}
                            onUpdateValue={val => quickUpdate(m.id, val)}
                            onEdit={() => openEdit(m)}
                            onDelete={() => setDeleting(m)}
                            onView={() => setViewing(m)}
                          />
                        ))}
                      </div>
                    )}

                    {/* ── Daily tracking section ───────────── */}
                    {dailyMetrics.length > 0 && (
                      <div>
                        <div style={{
                          padding: "10px 18px 6px",
                          borderTop: totalMetrics.length > 0 ? "1px solid var(--border-divider)" : "none",
                          display: "flex", alignItems: "center", gap: 8,
                        }}>
                          <div style={{ width: 3, height: 14, borderRadius: 2, background: "var(--success)" }} />
                          <span style={{
                            fontSize: 10, fontWeight: 800, color: "var(--success)",
                            letterSpacing: ".1em", textTransform: "uppercase",
                          }}>
                            Daily Tracking
                          </span>
                        </div>
                        <div style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 100px 120px 1fr 80px",
                          padding: "8px 18px",
                          background: "var(--bg-input)",
                        }}>
                          {["METRIC", "TODAY", "30-DAY TOTAL", "NOTES", ""].map((h, i) => (
                            <div key={i} style={{
                              fontSize: 10, fontWeight: 800, color: "var(--text-muted)",
                              letterSpacing: ".07em", textTransform: "uppercase",
                            }}>
                              {h}
                            </div>
                          ))}
                        </div>
                        {dailyMetrics.map(m => (
                          <DailyMetricRow
                            key={m.id} m={m} canEditDetails={canEditDetails} canUpdateValue={canUpdateValues && (canEditDetails || myAssignedIds.has(m.id))}
                            onUpdateValue={val => quickUpdate(m.id, val)}
                            onEdit={() => openEdit(m)}
                            onDelete={() => setDeleting(m)}
                            onView={() => setViewing(m)}
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── MODALS ─────────────────────────────────────────── */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Metric" width={560}>
        {metricForm}{actionBtns(save, () => setShowAdd(false), "Add Metric")}
      </Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Edit: ${editing?.name}`} width={560}>
        {metricForm}
        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center", marginTop: 8, paddingTop: 12, borderTop: "1px solid var(--border-divider)" }}>
          <button
            onClick={() => { if (editing && confirm("Copy this asset as a task? (keeps the asset)")) convertToTask(editing, "copy"); }}
            style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid var(--accent)44", background: "var(--accent-bg)", color: "var(--accent)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
          >
            → Copy as Task
          </button>
          <div style={{ display: "flex", gap: 9 }}>
            <button onClick={() => setEditing(null)} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
            <button onClick={update} style={{ padding: "7px 14px", borderRadius: 8, background: "var(--accent)", color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Save Changes</button>
          </div>
        </div>
      </Modal>
      <ConfirmModal open={!!deleting} onClose={() => setDeleting(null)} onConfirm={del} name={deleting?.name ?? ""} entity="metric" />

      {/* Department notes modal */}
      <Modal open={!!deptNotesModal} onClose={() => setDeptNotesModal(null)} title={`Notes: ${deptNotesModal?.name ?? ""}`} width={480}>
        <FormField label="Notes">
          <HubTextarea
            value={deptNotesForm.notes}
            onChange={e => setDeptNotesForm(p => ({ ...p, notes: e.target.value }))}
            placeholder="Add notes, instructions, or paste any links (https://...)"
            rows={6}
          />
        </FormField>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>
          URLs in notes will automatically become clickable links.
        </div>
        {actionBtns(saveDeptNotes, () => setDeptNotesModal(null), "Save Notes")}
      </Modal>

      <MetricHistoryDrawer metric={viewing} open={!!viewing} onClose={() => setViewing(null)} />
    </AppLayout>
  );
}

// ── TOTAL METRIC ROW ──────────────────────────────────────────
function TotalMetricRow({
  m, canEditDetails, canUpdateValue, onUpdateValue, onEdit, onDelete, onView,
}: {
  m: Metric; canEditDetails: boolean; canUpdateValue: boolean;
  onUpdateValue: (v: number) => Promise<void>;
  onEdit: () => void; onDelete: () => void; onView: () => void;
}) {
  const { isGood, value: delta } = metricDelta(m);
  const [inputVal, setInputVal] = useState(String(m.currentValue));
  const [saving, setSaving] = useState(false);

  useEffect(() => { setInputVal(String(m.currentValue)); }, [m.currentValue]);

  const handleSave = async () => {
    const num = parseFloat(inputVal);
    if (isNaN(num) || num === m.currentValue) {
      setInputVal(String(m.currentValue));
      return;
    }
    setSaving(true);
    await onUpdateValue(num);
    setSaving(false);
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 100px 90px 90px 1fr 60px",
        padding: "10px 18px",
        borderTop: "1px solid var(--border-divider)",
        alignItems: "center",
        transition: "background .1s",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-card-hover)")}
      onMouseLeave={e => (e.currentTarget.style.background = "")}
    >
      {/* Metric name */}
      <div
        onClick={onView}
        style={{
          fontSize: 13, fontWeight: 600, color: "var(--text-primary)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          paddingRight: 12, cursor: "pointer",
        }}
        title={m.name}
      >
        {m.name}
      </div>

      {/* Value */}
      <div onClick={e => e.stopPropagation()}>
        {canUpdateValue ? (
          <input
            type="number"
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onBlur={handleSave}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleSave(); } }}
            disabled={saving}
            style={{
              width: 75, padding: "5px 8px", borderRadius: 6,
              border: "1px solid var(--border-card)", background: "var(--bg-card)",
              color: "var(--text-primary)", fontSize: 13, fontWeight: 700,
              textAlign: "center", outline: "none",
              opacity: saving ? 0.5 : 1,
            }}
          />
        ) : (
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
            {formatMetricValue(m.currentValue, m.unit)}
          </span>
        )}
      </div>

      {/* Previous */}
      <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
        {m.previousValue ?? 0}
      </div>

      {/* Change */}
      <div style={{
        fontSize: 12, fontWeight: 700,
        color: delta === 0 ? "var(--text-muted)" : isGood ? "var(--success)" : "var(--danger)",
        display: "flex", alignItems: "center", gap: 3,
      }}>
        {delta !== 0 ? (
          <>
            <span style={{ fontSize: 14 }}>{isGood ? "↗" : "↘"}</span>
            <span>{delta > 0 ? "+" : ""}{delta}</span>
          </>
        ) : "—"}
      </div>

      {/* Notes */}
      <div style={{
        fontSize: 12, color: "var(--text-secondary)",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 8,
      }} title={m.notes || undefined}>
        {m.notes || "—"}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }} onClick={e => e.stopPropagation()}>
        {canEditDetails && (
          <>
            <button onClick={onEdit} style={iconBtn} title="Edit"><Pencil size={14} /></button>
            <button onClick={onDelete} style={{ ...iconBtn, color: "var(--danger)" }} title="Delete"><Trash2 size={14} /></button>
          </>
        )}
      </div>
    </div>
  );
}

// ── DAILY METRIC ROW ──────────────────────────────────────────
function DailyMetricRow({
  m, canEditDetails, canUpdateValue, onUpdateValue, onEdit, onDelete, onView,
}: {
  m: Metric; canEditDetails: boolean; canUpdateValue: boolean;
  onUpdateValue: (v: number) => Promise<void>;
  onEdit: () => void; onDelete: () => void; onView: () => void;
}) {
  const [inputVal, setInputVal] = useState(String(m.currentValue));
  const [saving, setSaving] = useState(false);

  useEffect(() => { setInputVal(String(m.currentValue)); }, [m.currentValue]);

  const handleSave = async () => {
    const num = parseFloat(inputVal);
    if (isNaN(num) || num === m.currentValue) {
      setInputVal(String(m.currentValue));
      return;
    }
    setSaving(true);
    await onUpdateValue(num);
    setSaving(false);
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 100px 120px 1fr 80px",
        padding: "10px 18px",
        borderTop: "1px solid var(--border-divider)",
        alignItems: "center",
        transition: "background .1s",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-card-hover)")}
      onMouseLeave={e => (e.currentTarget.style.background = "")}
    >
      {/* Metric name */}
      <div
        onClick={onView}
        style={{
          fontSize: 13, fontWeight: 600, color: "var(--text-primary)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          paddingRight: 12, cursor: "pointer",
        }}
        title={m.name}
      >
        {m.name}
      </div>

      {/* Today */}
      <div onClick={e => e.stopPropagation()}>
        {canUpdateValue ? (
          <input
            type="number"
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onBlur={handleSave}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleSave(); } }}
            disabled={saving}
            style={{
              width: 75, padding: "5px 8px", borderRadius: 6,
              border: "1px solid var(--border-card)", background: "var(--bg-card)",
              color: "var(--text-primary)", fontSize: 13, fontWeight: 700,
              textAlign: "center", outline: "none",
              opacity: saving ? 0.5 : 1,
            }}
          />
        ) : (
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
            {m.currentValue}
          </span>
        )}
      </div>

      {/* 30-day total */}
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
        {m.thirtyDayTotal ?? 0}
      </div>

      {/* Notes */}
      <div style={{
        fontSize: 12, color: "var(--text-secondary)",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 8,
      }} title={m.notes || undefined}>
        {m.notes || "—"}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }} onClick={e => e.stopPropagation()}>
        {canEditDetails && (
          <>
            <button onClick={onView} style={iconBtn} title="History"><Calendar size={14} /></button>
            <button onClick={onEdit} style={iconBtn} title="Edit"><Pencil size={14} /></button>
            <button onClick={onDelete} style={{ ...iconBtn, color: "var(--danger)" }} title="Delete"><Trash2 size={14} /></button>
          </>
        )}
      </div>
    </div>
  );
}
