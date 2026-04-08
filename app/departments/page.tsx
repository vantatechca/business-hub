"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/Layout";
import { Modal, FormField, HubInput, HubTextarea, ConfirmModal, useToast, ToastList, EmptyState } from "@/components/ui/shared";
import { Sortable, useSortableItem, overlayCardStyle } from "@/components/ui/Sortable";
import { GripVertical } from "lucide-react";
import type { Department } from "@/lib/types";

const ICONS = ["💼","⚙️","📣","📊","👥","🔧","🎯","⭐","⚖️","🏗️","🌐","💡","🔬","📦","🎨","🧬","🚀","💰","📱","🎓"];
const COLORS = ["#5b8ef8","#34d399","#a78bfa","#fbbf24","#f87171","#22d3ee","#84cc16","#fb923c","#e879f9","#6366f1"];

const blank = { name: "", head: "", icon: "💼", color: COLORS[0], notes: "" };

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
  const openEdit = (d: Department) => {
    setEditing(d);
    setForm({
      name: d.name,
      head: d.description ?? "",
      icon: d.icon,
      color: d.color,
      notes: d.notes ?? "",
    });
  };

  const save = async () => {
    if (!form.name) return toast("Name is required", "er");
    await fetch("/api/departments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    await load(); setShowAdd(false); toast(`${form.name} added`);
  };

  const update = async () => {
    if (!editing) return;
    await fetch(`/api/departments/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    await load(); setEditing(null); toast("Department updated");
  };

  const del = async () => {
    if (!deleting) return;
    await fetch(`/api/departments/${deleting.id}`, { method: "DELETE" });
    await load(); toast("Department deleted", "er");
  };

  const deptForm = (
    <div>
      <FormField label="Department Name">
        <HubInput value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Legal, Design…" />
      </FormField>
      <FormField label="Description (one line, shown on the card)">
        <HubInput value={form.head} onChange={e => setForm(p => ({ ...p, head: e.target.value }))} placeholder="Short tagline for the card" />
      </FormField>
      <FormField label="Notes (long-form, shown on the department page)">
        <HubTextarea
          rows={4}
          value={form.notes}
          onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
          placeholder="Add context, OKRs, escalation contacts, anything the team should see when they open this department…"
        />
      </FormField>
      <FormField label="Icon">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {ICONS.map(ic => (
            <button
              key={ic}
              type="button"
              onClick={() => setForm(p => ({ ...p, icon: ic }))}
              style={{
                width: 34, height: 34, borderRadius: 8,
                border: `2px solid ${form.icon === ic ? "var(--accent)" : "var(--border-card)"}`,
                background: "var(--bg-card)",
                fontSize: 16, cursor: "pointer",
              }}
            >
              {ic}
            </button>
          ))}
        </div>
      </FormField>
      <FormField label="Color">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {COLORS.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setForm(p => ({ ...p, color: c }))}
              style={{
                width: 26, height: 26, borderRadius: "50%",
                background: c, cursor: "pointer",
                border: `3px solid ${form.color === c ? "var(--text-primary)" : "transparent"}`,
              }}
            />
          ))}
        </div>
      </FormField>
    </div>
  );

  return (
    <AppLayout title="Departments" onNew={openAdd} newLabel="Add Department">
      <ToastList ts={ts} />

      {/* Search + counter row. Reordering is disabled while a search filter
          is active because the visible list isn't the canonical order. */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200, display: "flex", alignItems: "center", gap: 8, background: "var(--bg-card)", border: "1px solid var(--border-card)", borderRadius: 8, padding: "7px 11px" }}>
          <span style={{ color: "var(--text-muted)", fontSize: 14 }}>⌕</span>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search departments by name or description…"
            style={{ border: "none", background: "transparent", outline: "none", fontSize: 12, color: "var(--text-primary)", width: "100%" }}
          />
        </div>
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          {filteredDepts.length} department{filteredDepts.length !== 1 ? "s" : ""}
          {q && depts.length !== filteredDepts.length && ` of ${depts.length}`}
        </span>
        {canReorder && !q && (
          <span style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
            <GripVertical size={11} /> Drag any card to reorder
          </span>
        )}
      </div>

      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
          {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="skeleton" style={{ height: 180, borderRadius: 12 }} />)}
        </div>
      ) : depts.length === 0 ? (
        <EmptyState
          icon="⬡"
          title="No departments yet"
          desc="Add your first department to get started."
          action={<button onClick={openAdd} style={{ padding: "8px 18px", borderRadius: 8, background: "var(--accent)", color: "#fff", border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Add Department</button>}
        />
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))", gap: 16 }} className="stagger-children">
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
        <div style={{ display: "flex", gap: 9, justifyContent: "flex-end", marginTop: 4 }}>
          <button onClick={() => setShowAdd(false)} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border-card)", background: "transparent", color: "var(--text-secondary)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
          <button onClick={save} style={{ padding: "7px 14px", borderRadius: 8, background: "var(--accent)", color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Add Department</button>
        </div>
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Edit: ${editing?.name}`}>
        {deptForm}
        <div style={{ display: "flex", gap: 9, justifyContent: "flex-end", marginTop: 4 }}>
          <button onClick={() => setEditing(null)} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border-card)", background: "transparent", color: "var(--text-secondary)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
          <button onClick={update} style={{ padding: "7px 14px", borderRadius: 8, background: "var(--accent)", color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Save Changes</button>
        </div>
      </Modal>

      <ConfirmModal open={!!deleting} onClose={() => setDeleting(null)} onConfirm={del} name={deleting?.name ?? ""} entity="department" />
    </AppLayout>
  );
}

// ── DEPT CARD ────────────────────────────────────────────────
//
// The whole card is draggable (not just a tiny grip handle) — listeners get
// spread on the outer wrapper. dnd-kit's PointerSensor is configured with
// distance: 5, so a pure click without movement is treated as a click and
// navigates to the department detail page; a click + drag of 5+ pixels
// starts a reorder. The grip in the top-right corner is just a visual hint.
function DeptCardBody({
  d,
  showGrip,
  actions,
}: {
  d: Department;
  showGrip?: boolean;
  // Optional action slot rendered inside the card border, below the stat
  // row. Wrapped here (rather than rendered as a sibling outside the card)
  // so the buttons visually belong to the card as one unit.
  actions?: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: "relative",
        background: "var(--bg-card)",
        border: "1px solid var(--border-card)",
        borderRadius: 14,
        padding: "20px 22px",
        transition: "border-color .15s ease, box-shadow .15s ease, transform .12s ease",
      }}
      className="dept-card"
    >
      {showGrip && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            color: "var(--text-muted)",
            opacity: 0.35,
            pointerEvents: "none",
            transition: "opacity .15s ease",
          }}
          className="dept-card-grip"
        >
          <GripVertical size={14} />
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
        <div
          style={{
            width: 46, height: 46, borderRadius: 12,
            background: `${d.color}1c`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, flexShrink: 0,
          }}
        >
          {d.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 3 }}>
            {d.description ?? ""}
          </div>
        </div>
      </div>

      {/* Stat row + compact actions on the same line. Actions float to the
          right so the card stays one tidy unit instead of two stacked
          panels. Stops propagation on the action wrapper so a button click
          doesn't initiate a drag or navigate. */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 11, color: "var(--text-secondary)" }}>
        <span><strong style={{ color: "var(--text-primary)", fontWeight: 700 }}>{d.memberCount ?? 0}</strong> members</span>
        <span style={{ color: "var(--border-card)" }}>·</span>
        <span><strong style={{ color: "var(--text-primary)", fontWeight: 700 }}>{(d as unknown as { taskCount?: number }).taskCount ?? 0}</strong> tasks</span>
        <span style={{ color: "var(--border-card)" }}>·</span>
        <span><strong style={{ color: "var(--text-primary)", fontWeight: 700 }}>{d.metricCount ?? 0}</strong> metrics</span>
        {actions && <div style={{ flex: 1 }} />}
        {actions}
      </div>

      <style jsx>{`
        .dept-card:hover {
          border-color: ${d.color}55;
          box-shadow: 0 6px 20px -10px rgba(0, 0, 0, 0.18);
        }
        .dept-card:hover .dept-card-grip {
          opacity: 0.7;
        }
      `}</style>
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
  const { setNodeRef, style, listeners, attributes, isDragging } = useSortableItem(d.id);
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  // Click anywhere on the card → navigate. dnd-kit's 5px drag activation
  // distance means a real click (no drag) is allowed to fire normally; a
  // click + drag of 5+ pixels starts a reorder instead.
  const onCardClick = () => {
    if (isDragging) return;
    router.push(`/departments/${d.id}`);
  };

  // Compact in-card actions: small ghost buttons that hover-fill to the
  // accent / red. Pointer-down + click are stopped so a button press
  // doesn't trigger a drag (5px activation) or the card navigate.
  const actions = (
    <div
      style={{ display: "flex", gap: 6 }}
      onClick={stop}
      onPointerDown={e => e.stopPropagation()}
    >
      <button
        onClick={onEdit}
        style={{
          padding: "3px 10px",
          borderRadius: 6,
          border: "1px solid var(--border-card)",
          background: "transparent",
          color: "var(--text-secondary)",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: ".02em",
          cursor: "pointer",
          transition: "color .15s ease, border-color .15s ease, background .15s ease",
        }}
        onMouseEnter={e => {
          e.currentTarget.style.color = "var(--accent)";
          e.currentTarget.style.borderColor = "var(--accent)";
          e.currentTarget.style.background = "var(--accent-bg)";
        }}
        onMouseLeave={e => {
          e.currentTarget.style.color = "var(--text-secondary)";
          e.currentTarget.style.borderColor = "var(--border-card)";
          e.currentTarget.style.background = "transparent";
        }}
      >
        Edit
      </button>
      <button
        onClick={onDelete}
        style={{
          padding: "3px 10px",
          borderRadius: 6,
          border: "1px solid var(--border-card)",
          background: "transparent",
          color: "var(--text-muted)",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: ".02em",
          cursor: "pointer",
          transition: "color .15s ease, border-color .15s ease, background .15s ease",
        }}
        onMouseEnter={e => {
          e.currentTarget.style.color = "var(--danger)";
          e.currentTarget.style.borderColor = "rgba(220,38,38,.4)";
          e.currentTarget.style.background = "var(--danger-bg)";
        }}
        onMouseLeave={e => {
          e.currentTarget.style.color = "var(--text-muted)";
          e.currentTarget.style.borderColor = "var(--border-card)";
          e.currentTarget.style.background = "transparent";
        }}
      >
        Delete
      </button>
    </div>
  );

  return (
    <div
      ref={dragEnabled ? setNodeRef : undefined}
      style={{
        ...(dragEnabled ? style : {}),
        cursor: dragEnabled ? "grab" : "pointer",
      }}
      {...(dragEnabled ? listeners : {})}
      {...(dragEnabled ? attributes : {})}
      onClick={onCardClick}
    >
      <DeptCardBody d={d} showGrip={dragEnabled} actions={actions} />
    </div>
  );
}

// Floating clone rendered inside DragOverlay — follows the cursor across the
// page. Borrows the same body component but skips the action row, with the
// shared overlayCardStyle (scale + rotate + heavy shadow) so the floating
// preview is unmistakably "lifted".
function DeptCardPreview({ d }: { d: Department }) {
  return (
    <div style={overlayCardStyle}>
      <DeptCardBody d={d} showGrip />
    </div>
  );
}
