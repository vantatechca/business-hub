"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import AppLayout from "@/components/Layout";
import { Avatar, Modal, FormField, HubSelect, useToast, ToastList, priorityColor } from "@/components/ui/shared";
import { Sortable, useSortableItem, DragHandle, overlayCardStyle } from "@/components/ui/Sortable";
import { GripVertical } from "lucide-react";
import type { Metric, User, MetricAssignment } from "@/lib/types";
import { getInitials, priorityLabel } from "@/lib/types";
import MetricHistoryDrawer from "@/components/MetricHistoryDrawer";

const ROLE_COLORS: Record<string,string> = { owner:"var(--warning)", contributor:"var(--accent)", reviewer:"var(--violet)" };

export default function AssignmentsPage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role ?? "member";
  const canReorder = role === "admin" || role === "super_admin" || role === "manager" || role === "leader";

  const [metrics, setMetrics]       = useState<Metric[]>([]);
  const [users, setUsers]           = useState<User[]>([]);
  const [assignments, setAssignments] = useState<MetricAssignment[]>([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState<Metric | null>(null);
  const [showAssign, setShowAssign] = useState(false);
  const [aForm, setAForm]           = useState({ userId:"", roleInMetric:"contributor" as MetricAssignment["roleInMetric"] });
  const [q, setQ]                   = useState("");
  // Clicking a metric row opens the history drawer (reused from /metrics).
  const [viewing, setViewing]       = useState<Metric | null>(null);
  const { ts, toast } = useToast();

  const load = () => Promise.all([
    fetch("/api/metrics").then(r => r.json()),
    fetch("/api/users").then(r => r.json()),
    fetch("/api/assignments").then(r => r.json()),
  ]).then(([m, u, a]) => {
    setMetrics(m.data ?? []);
    setUsers((u.data ?? []).map((x: Record<string,unknown>) => ({ ...x, initials: getInitials(x.name as string) })));
    setAssignments(a.data ?? []);
    setLoading(false);
  });
  useEffect(() => { load(); }, []);

  const metricAssignees = (metricId: string) =>
    assignments.filter(a => a.metricId === metricId);

  const assign = async () => {
    if (!selected || !aForm.userId) return toast("Select a user", "er");
    const res = await fetch("/api/assignments", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ metricId:selected.id, userId:aForm.userId, roleInMetric:aForm.roleInMetric })
    });
    if (!res.ok) return toast("Failed to assign", "er");
    await load(); setShowAssign(false); toast("Member assigned");
  };

  const unassign = async (a: MetricAssignment) => {
    await fetch("/api/assignments", {
      method:"DELETE", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ metricId:a.metricId, userId:a.userId })
    });
    await load(); toast("Assignment removed", "wa");
  };

  const filtered = metrics.filter(m => m.name.toLowerCase().includes(q.toLowerCase()) || (m.departmentName ?? "").toLowerCase().includes(q.toLowerCase()));
  const filterActive = !!q;
  const dragEnabled = canReorder && !filterActive;

  // Group by department
  const byDept = filtered.reduce((acc, m) => {
    const k = m.departmentName ?? "Other";
    if (!acc[k]) acc[k] = [];
    acc[k].push(m);
    return acc;
  }, {} as Record<string, Metric[]>);

  // Reorder metrics within a single department group, then persist global order
  const handleGroupReorder = async (deptKey: string, newIds: (string | number)[]) => {
    // Build the new local-state order: for each existing metric, replace its position
    // within its department group with the dragged order.
    const reorderedSet = new Set(newIds.map(String));
    const replacements = newIds.map(id => metrics.find(m => String(m.id) === String(id))).filter(Boolean) as Metric[];
    let cursor = 0;
    const next = metrics.map(m => {
      if ((m.departmentName ?? "Other") === deptKey && reorderedSet.has(String(m.id))) {
        const r = replacements[cursor++];
        return r;
      }
      return m;
    });
    setMetrics(next);
    const allIds = next.map(m => m.id);
    const res = await fetch("/api/metrics/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: allIds }),
    });
    if (!res.ok) { toast("Reorder failed", "er"); await load(); }
  };

  const assignedUsers = selected ? users.filter(u => !assignments.some(a => a.metricId === selected.id && a.userId === u.id)) : users;

  return (
    <AppLayout title="Metric Assignments">
      <ToastList ts={ts} />

      <div style={{ display:"flex", gap:10, marginBottom:14 }}>
        <div style={{ flex:1, display:"flex", alignItems:"center", gap:8, background:"var(--bg-card)", border:"1px solid var(--border-card)", borderRadius:8, padding:"7px 11px" }}>
          <span style={{ color:"var(--text-muted)" }}>⌕</span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search metrics…" style={{ border:"none", background:"transparent", outline:"none", fontSize:12, color:"var(--text-primary)", width:"100%" }}/>
        </div>
        <span style={{ fontSize:12, color:"var(--text-secondary)", alignSelf:"center" }}>{filtered.length} metrics · {assignments.length} assignments</span>
      </div>

      {loading ? (
        <div className="skeleton" style={{ height:400, borderRadius:12 }}/>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          {Object.entries(byDept).map(([dept, dMetrics]) => (
            <div key={dept}>
              <div style={{ fontSize:11, fontWeight:800, color:"var(--text-muted)", letterSpacing:".1em", marginBottom:9, textTransform:"uppercase" }}>{dept}</div>
              <Sortable
                items={dMetrics}
                onReorder={ids => handleGroupReorder(dept, ids)}
                strategy="vertical"
                disabled={!dragEnabled}
                renderOverlay={m => <AssignmentRowPreview m={m} assignees={metricAssignees(m.id)} />}
              >
                <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
                  {dMetrics.map(m => (
                    <AssignmentRow
                      key={m.id}
                      m={m}
                      dragEnabled={dragEnabled}
                      assignees={metricAssignees(m.id)}
                      onAssign={() => { setSelected(m); setAForm({ userId: assignedUsers[0]?.id ?? "", roleInMetric:"contributor" }); setShowAssign(true); }}
                      onView={() => setViewing(m)}
                    />
                  ))}
                </div>
              </Sortable>
            </div>
          ))}
        </div>
      )}

      {/* Assign modal */}
      <Modal open={showAssign} onClose={() => setShowAssign(false)} title={`Assign: ${selected?.name}`} width={480}>
        <FormField label="Team Member">
          <HubSelect value={aForm.userId} onChange={e => setAForm(p => ({...p, userId:e.target.value}))}>
            <option value="">Select member…</option>
            {assignedUsers.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
          </HubSelect>
        </FormField>
        <FormField label="Role in Metric">
          <HubSelect value={aForm.roleInMetric} onChange={e => setAForm(p => ({...p, roleInMetric:e.target.value as MetricAssignment["roleInMetric"]}))}>
            <option value="owner">Owner — primary responsible</option>
            <option value="contributor">Contributor — reports updates</option>
            <option value="reviewer">Reviewer — reviews reports only</option>
          </HubSelect>
        </FormField>

        {/* Current assignees */}
        {selected && metricAssignees(selected.id).length > 0 && (
          <div style={{ marginTop:14 }}>
            <div style={{ fontSize:10, fontWeight:800, color:"var(--text-muted)", letterSpacing:".07em", marginBottom:8 }}>CURRENT ASSIGNEES</div>
            <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
              {metricAssignees(selected.id).map(a => (
                <div key={a.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 11px", borderRadius:8, background:"var(--bg-input)" }}>
                  <Avatar s={a.userInitials ?? getInitials(a.userName ?? "?")} size={26}/>
                  <div style={{ flex:1, fontSize:12, color:"var(--text-primary)", fontWeight:600 }}>{a.userName}</div>
                  <span style={{ fontSize:10, padding:"2px 7px", borderRadius:5, fontWeight:700, background:`${ROLE_COLORS[a.roleInMetric]}18`, color:ROLE_COLORS[a.roleInMetric] }}>{a.roleInMetric}</span>
                  <button onClick={() => unassign(a)} style={{ padding:"2px 7px", borderRadius:5, border:"1px solid rgba(220,38,38,.3)", background:"var(--danger-bg)", color:"var(--danger)", fontSize:11, cursor:"pointer" }}>Remove</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display:"flex", gap:9, justifyContent:"flex-end", marginTop:16 }}>
          <button onClick={() => setShowAssign(false)} style={{ padding:"7px 14px", borderRadius:8, border:"1px solid var(--border-card)", background:"var(--bg-input)", color:"var(--text-primary)", fontSize:12, fontWeight:600, cursor:"pointer" }}>Cancel</button>
          <button onClick={assign} style={{ padding:"7px 14px", borderRadius:8, background:"var(--accent)", color:"#fff", border:"none", fontSize:12, fontWeight:700, cursor:"pointer" }}>Assign Member</button>
        </div>
      </Modal>

      <MetricHistoryDrawer metric={viewing} open={!!viewing} onClose={() => setViewing(null)} />
    </AppLayout>
  );
}

function AssignmentRowBody({
  m,
  assignees,
  dragHandle,
  actions,
}: {
  m: Metric;
  assignees: MetricAssignment[];
  dragHandle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const pc = priorityColor(m.priorityScore);
  const typeLabel = m.metricType === "value" ? "total" : m.metricType.replace(/_/g, " ");
  return (
    <div className="hub-card">
      <div style={{ padding:"12px 16px", display:"flex", alignItems:"center", gap:14 }}>
        {dragHandle}
        <span style={{ padding:"2px 8px", borderRadius:6, fontSize:10, fontWeight:800, background:`${pc}18`, color:pc, flexShrink:0 }}>
          {priorityLabel(m.priorityScore)}
        </span>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:12, fontWeight:700, color:"var(--text-primary)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{m.name}</div>
          <div style={{ fontSize:10, color:"var(--text-muted)", marginTop:2 }}>{typeLabel} · {m.direction.replace(/_/g," ")}</div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
          {assignees.length === 0 ? (
            <span style={{ fontSize:11, color:"var(--text-muted)" }}>Unassigned</span>
          ) : (
            <div style={{ display:"flex", gap:4 }}>
              {assignees.slice(0,5).map(a => (
                <div
                  key={a.id}
                  title={`${a.userName ?? ""} · ${a.roleInMetric}`}
                  style={{ position:"relative", cursor: "help" }}
                >
                  <Avatar s={a.userInitials ?? getInitials(a.userName ?? "?")} size={26}/>
                  <div style={{ position:"absolute", bottom:-2, right:-2, width:8, height:8, borderRadius:"50%", background:ROLE_COLORS[a.roleInMetric] ?? "var(--accent)", border:"1.5px solid var(--bg-card)" }}/>
                </div>
              ))}
              {assignees.length > 5 && <span style={{ fontSize:10, color:"var(--text-secondary)", alignSelf:"center" }}>+{assignees.length-5}</span>}
            </div>
          )}
          {actions}
        </div>
      </div>
    </div>
  );
}

function AssignmentRow({
  m,
  dragEnabled,
  assignees,
  onAssign,
  onView,
}: {
  m: Metric;
  dragEnabled: boolean;
  assignees: MetricAssignment[];
  onAssign: () => void;
  onView: () => void;
}) {
  const { setNodeRef, style, listeners, attributes, isDragging } = useSortableItem(m.id);
  // Whole row is draggable. Grip is a passive visual cue. dnd-kit's 5px
  // activation distance lets the click-to-view handler still fire.
  const handle = dragEnabled ? (
    <span aria-hidden style={{ color: "var(--text-muted)", display: "inline-flex", opacity: 0.5 }}>
      <GripVertical size={14} />
    </span>
  ) : undefined;
  const actions = (
    <span onPointerDown={e => e.stopPropagation()}>
      <button
        onClick={e => { e.stopPropagation(); onAssign(); }}
        style={{ padding:"4px 10px", borderRadius:7, border:"1px solid var(--border-card)", background:"var(--bg-input)", color:"var(--text-secondary)", fontSize:11, cursor:"pointer" }}
      >
        + Assign
      </button>
    </span>
  );
  return (
    <div
      ref={dragEnabled ? setNodeRef : undefined}
      style={{
        ...(dragEnabled ? style : {}),
        cursor: dragEnabled ? "grab" : "pointer",
        touchAction: dragEnabled ? "none" : undefined,
      }}
      onClick={() => { if (!isDragging) onView(); }}
      {...(dragEnabled ? listeners : {})}
      {...(dragEnabled ? attributes : {})}
    >
      <AssignmentRowBody m={m} assignees={assignees} dragHandle={handle} actions={actions} />
    </div>
  );
}

function AssignmentRowPreview({ m, assignees }: { m: Metric; assignees: MetricAssignment[] }) {
  return (
    <div style={overlayCardStyle}>
      <AssignmentRowBody
        m={m}
        assignees={assignees}
        dragHandle={<GripVertical size={14} style={{ color: "var(--text-muted)" }} />}
      />
    </div>
  );
}
