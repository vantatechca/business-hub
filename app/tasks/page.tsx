"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import AppLayout from "@/components/Layout";
import { Avatar, Badge, Modal, FormField, HubInput, HubSelect, HubTextarea, useToast, ToastList } from "@/components/ui/shared";
import DueAlertBanner from "@/components/DueAlertBanner";
import AiSearchBar from "@/components/AiSearchBar";
import { useAiSearch } from "@/lib/useAiSearch";
import type { Task, Department, TeamMember } from "@/lib/types";
import { formatTaskDueDate, isTaskDueTodayOrPast } from "@/lib/types";
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  useDroppable,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

const PR: Record<string,{l:string;bg:string;c:string}> = {
  urgent:{l:"Urgent",bg:"rgba(248,113,113,.15)",c:"#f87171"},
  high:  {l:"High",  bg:"rgba(251,191,36,.15)", c:"#fbbf24"},
  medium:{l:"Medium",bg:"rgba(91,142,248,.15)", c:"#5b8ef8"},
  low:   {l:"Low",   bg:"rgba(52,211,153,.15)", c:"#34d399"},
};
const NS: Record<string,string> = { todo:"in-progress", "in-progress":"done", done:"todo" };
const NL: Record<string,string> = { todo:"Start →", "in-progress":"Complete ✓", done:"Reopen" };
const COLS = [
  { key:"todo",        label:"To Do",       color:"var(--text-secondary)" },
  { key:"in-progress", label:"In Progress", color:"var(--accent)" },
  { key:"done",        label:"Done",        color:"var(--success)" },
];
const PRIORITIES = ["urgent","high","medium","low"];
const todayIso = () => new Date().toISOString().slice(0, 10);
const blank = { title:"", priority:"medium", status:"todo", departmentId: "" as string | number, departmentName:"", assigneeId: "" as string, assigneeInitials:"", assigneeName: "", dueDate: todayIso(), notes: "" };
const blankMember = { name: "", role: "", departmentId: "" as string | number, departmentName: "", status: "active", birthday: "" };

export default function TasksPage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role ?? "member";
  const canReorder = role === "admin" || role === "super_admin" || role === "manager" || role === "leader";
  // Task CRUD (add / edit / delete / advance status) is locked to manager+.
  // Members see tasks read-only. Same gate as canReorder for consistency.
  const canEdit = canReorder;

  const [tasks, setTasks]   = useState<Task[]>([]);
  const [depts, setDepts]   = useState<Department[]>([]);
  const [team, setTeam]     = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ]           = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const ai = useAiSearch("tasks");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [form, setForm]     = useState<typeof blank>({ ...blank });
  // Inline "add member" modal state — opens from the Assignee dropdown
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberForm, setMemberForm] = useState<typeof blankMember>({ ...blankMember });
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const { ts, toast }       = useToast();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const activeTask = activeDragId ? tasks.find(t => String(t.id) === activeDragId) ?? null : null;

  const load = () => Promise.all([
    fetch("/api/tasks").then(r => r.json()),
    fetch("/api/departments").then(r => r.json()),
    fetch("/api/team").then(r => r.json()),
  ]).then(([t, d, m]) => {
    setTasks(t.data ?? []);
    setDepts(d.data ?? []);
    setTeam(m.data ?? []);
    setLoading(false);
  });
  useEffect(() => { load(); }, []);

  // Filter by title AND department (match either name or id, since task.departmentId
  // can be a UUID, slug, or number depending on when/where it was created).
  const ft = tasks.filter(t => {
    // AI mode: show only tasks whose ID is in the AI match set
    if (ai.aiMode && ai.matchedIds) {
      if (!ai.matchedIds.has(String(t.id))) return false;
    } else if (!ai.aiMode) {
      if (!t.title.toLowerCase().includes(q.toLowerCase())) return false;
    }
    if (!deptFilter) return true;
    return (t.departmentName ?? "") === deptFilter
      || String(t.departmentId ?? "") === deptFilter;
  });

  const runTaskAiSearch = () => {
    const items = tasks.map(t => ({
      id: String(t.id),
      text: [t.title, t.priority, t.status, t.departmentName, t.assigneeName, (t as unknown as { notes?: string }).notes].filter(Boolean).join(" | "),
    }));
    ai.runAiSearch(items);
  };

  const openAdd = (status = "todo") => {
    setForm({
      ...blank,
      status,
      departmentId: String(depts[0]?.id ?? ""),
      departmentName: depts[0]?.name ?? "",
      dueDate: todayIso(),
    });
    setShowAdd(true);
  };

  // Triggered when the Assignee dropdown's "+ Add new member…" option is picked
  const openAddMember = () => {
    setMemberForm({
      ...blankMember,
      departmentId: depts[0]?.id ?? "",
      departmentName: depts[0]?.name ?? "",
    });
    setShowAddMember(true);
  };

  const saveMember = async () => {
    if (!memberForm.name || !memberForm.role) {
      return toast("Name and role are required", "er");
    }
    const initials = memberForm.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) || "??";
    const res = await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...memberForm, initials }),
    });
    if (!res.ok) return toast("Failed to add member", "er");
    // Re-fetch team list and auto-select the new member in whichever form is open
    const teamRes = await fetch("/api/team").then(r => r.json());
    const newTeam: TeamMember[] = teamRes.data ?? [];
    setTeam(newTeam);
    const created = newTeam.find(m => m.name === memberForm.name);
    if (created) {
      setForm(p => ({
        ...p,
        assigneeId: String(created.id),
        assigneeInitials: created.initials,
        assigneeName: created.name,
      }));
    }
    setShowAddMember(false);
    toast(`${memberForm.name} added`);
  };

  const selectMember = (userId: string) => {
    if (userId === "__add_new__") {
      openAddMember();
      return;
    }
    if (!userId) {
      setForm(p => ({ ...p, assigneeId: "", assigneeInitials: "", assigneeName: "" }));
      return;
    }
    const picked = team.find(m => String(m.id) === userId);
    setForm(p => ({
      ...p,
      assigneeId: userId,
      assigneeInitials: picked?.initials ?? "",
      assigneeName: picked?.name ?? "",
    }));
  };

  const save = async () => {
    if (!form.title) return toast("Title required", "er");
    await fetch("/api/tasks", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(form) });
    await load(); setShowAdd(false); toast("Task added");
  };

  const openEdit = (t: Task) => {
    setEditing(t);
    setForm({
      title: t.title,
      priority: t.priority,
      status: t.status,
      departmentId: (t.departmentId ?? "") as string | number,
      departmentName: t.departmentName ?? "",
      assigneeId: (t.assigneeId ?? "") as string,
      assigneeInitials: t.assigneeInitials ?? "",
      assigneeName: t.assigneeName ?? "",
      dueDate: t.dueDate ?? "",
      notes: (t as unknown as { notes?: string }).notes ?? "",
    });
  };

  const convertToMetric = async (t: Task, mode: "move" | "copy") => {
    const res = await fetch(`/api/tasks/${t.id}/convert`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); return toast(e.error || "Convert failed", "er"); }
    await load();
    toast(mode === "move" ? `"${t.title}" moved to metrics` : `"${t.title}" copied as metric`);
  };

  const update = async () => {
    if (!editing) return;
    if (!form.title) return toast("Title required", "er");
    const res = await fetch(`/api/tasks/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) return toast("Update failed", "er");
    await load(); setEditing(null); toast("Task updated");
  };

  const advance = async (t: Task) => {
    const status = NS[t.status] as Task["status"];
    await fetch(`/api/tasks/${t.id}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ status }) });
    setTasks(p => p.map(x => String(x.id) === String(t.id) ? { ...x, status } : x));
  };

  const del = async (id: string | number) => {
    await fetch(`/api/tasks/${id}`, { method:"DELETE" });
    setTasks(p => p.filter(t => t.id !== id));
    toast("Task deleted", "er");
  };

  const selectDept = (id: string | number) => {
    const d = depts.find(x => String(x.id) === String(id));
    // Store id as-is — it may be a UUID, slug, or number depending on the DB.
    setForm(p => ({ ...p, departmentId: id as number | string, departmentName: d?.name ?? "" }));
  };

  // Find which column contains a given task or column id
  const findColumn = (id: string | number): Task["status"] | null => {
    if (id === "todo" || id === "in-progress" || id === "done") return id as Task["status"];
    const t = tasks.find(t => String(t.id) === String(id));
    return t ? t.status : null;
  };

  const handleDragStart = (e: DragStartEvent) => {
    setActiveDragId(String(e.active.id));
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = e;
    if (!over) return;
    const fromCol = findColumn(active.id);
    const toCol = findColumn(over.id);
    if (!fromCol || !toCol) return;

    // Compute new task order
    const activeTask = tasks.find(t => String(t.id) === String(active.id));
    if (!activeTask) return;

    let next = tasks.slice();
    const fromIdx = next.findIndex(t => String(t.id) === String(active.id));
    if (fromIdx === -1) return;
    const [moved] = next.splice(fromIdx, 1);
    moved.status = toCol;

    if (over.id === toCol) {
      // Dropped on the column container itself — append to end of column
      const lastIdxOfCol = next.reduce((acc, t, i) => t.status === toCol ? i : acc, -1);
      next.splice(lastIdxOfCol + 1, 0, moved);
    } else {
      const overIdx = next.findIndex(t => String(t.id) === String(over.id));
      if (overIdx === -1) {
        next.push(moved);
      } else {
        next.splice(overIdx, 0, moved);
      }
    }

    setTasks(next);

    // Persist: send full ordered list with status + sortOrder
    const items = next.map((t, i) => ({ id: t.id, status: t.status, sortOrder: i }));
    const res = await fetch("/api/tasks/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    if (!res.ok) { toast("Reorder failed", "er"); await load(); }
  };

  const taskForm = (
    <>
      <FormField label="Task Title"><HubInput value={form.title} onChange={e => setForm(p => ({...p,title:e.target.value}))} placeholder="Describe the task…" /></FormField>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <FormField label="Priority">
          <HubSelect value={form.priority} onChange={e => setForm(p => ({...p,priority:e.target.value}))}>
            {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
          </HubSelect>
        </FormField>
        <FormField label="Status">
          <HubSelect value={form.status} onChange={e => setForm(p => ({...p,status:e.target.value}))}>
            <option value="todo">To Do</option>
            <option value="in-progress">In Progress</option>
            <option value="done">Done</option>
          </HubSelect>
        </FormField>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <FormField label="Department">
          <HubSelect value={String(form.departmentId ?? "")} onChange={e => selectDept(e.target.value)}>
            <option value="">— None —</option>
            {depts.map(d => <option key={d.id} value={String(d.id)}>{d.name}</option>)}
          </HubSelect>
        </FormField>
        <FormField label="Due Date">
          <HubInput
            type="date"
            value={/^\d{4}-\d{2}-\d{2}$/.test(form.dueDate) ? form.dueDate : ""}
            onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))}
          />
        </FormField>
      </div>
      <FormField label="Assignee (optional)">
        <HubSelect
          value={form.assigneeId}
          onChange={e => selectMember(e.target.value)}
        >
          <option value="">— Unassigned —</option>
          {team.map(m => (
            <option key={m.id} value={String(m.id)}>
              {m.name} ({m.initials}){m.departmentName ? ` · ${m.departmentName}` : ""}
            </option>
          ))}
          <option value="__add_new__">+ Add new team member…</option>
        </HubSelect>
      </FormField>
      <FormField label="Notes (optional)">
        <HubTextarea
          value={form.notes}
          onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
          placeholder="Add context, recurrence, goal, or any details…"
          rows={3}
        />
      </FormField>
    </>
  );

  const memberFormJsx = (
    <>
      <FormField label="Full Name">
        <HubInput value={memberForm.name} onChange={e => setMemberForm(p => ({ ...p, name: e.target.value }))} placeholder="First Last" />
      </FormField>
      <FormField label="Role">
        <HubInput value={memberForm.role} onChange={e => setMemberForm(p => ({ ...p, role: e.target.value }))} placeholder="e.g. Senior Engineer" />
      </FormField>
      <FormField label="Department">
        <HubSelect
          value={String(memberForm.departmentId ?? "")}
          onChange={e => {
            const id = e.target.value;
            const d = depts.find(x => String(x.id) === String(id));
            setMemberForm(p => ({ ...p, departmentId: id, departmentName: d?.name ?? "" }));
          }}
        >
          <option value="">— None —</option>
          {depts.map(d => <option key={d.id} value={String(d.id)}>{d.name}</option>)}
        </HubSelect>
      </FormField>
    </>
  );

  return (
    <AppLayout title="Tasks" onNew={canEdit ? () => openAdd() : undefined} newLabel="Add Task">
      <ToastList ts={ts} />

      <DueAlertBanner
        items={tasks.map(t => ({
          id: t.id,
          title: t.title,
          dueDate: t.dueDate,
          status: t.status,
          departmentName: t.departmentName,
        }))}
        label="tasks"
      />

      <div style={{ marginBottom: 14 }}>
        <AiSearchBar
          aiMode={ai.aiMode}
          setAiMode={ai.setAiMode}
          q={ai.aiMode ? ai.q : q}
          setQ={(v) => ai.aiMode ? ai.setQ(v) : setQ(v)}
          loading={ai.loading}
          onRun={runTaskAiSearch}
          clear={ai.clear}
          placeholder="Ask anything... e.g. 'find all tasks related to shopify'"
          plainPlaceholder="Search tasks…"
          matchCount={ft.length}
          hasMatches={!!ai.matchedIds}
          explanation={ai.explanation}
        />
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
          <select
            value={deptFilter}
            onChange={e => setDeptFilter(e.target.value)}
            style={{ background:"var(--bg-card)", border:"1px solid var(--border-card)", borderRadius:8, padding:"7px 11px", color:"var(--text-primary)", fontSize:12, outline:"none" }}
          >
            <option value="">All Departments</option>
            {depts.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
          </select>
          <span style={{ fontSize:12, color:"var(--text-secondary)" }}>{ft.length} of {tasks.length} · {tasks.filter(t=>t.status==="done").length} done</span>
        </div>
      </div>

      {loading ? (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
          {[0,1,2].map(i => <div key={i} className="skeleton" style={{ height:300, borderRadius:12 }} />)}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={canReorder ? handleDragStart : undefined}
          onDragEnd={canReorder ? handleDragEnd : undefined}
          onDragCancel={() => setActiveDragId(null)}
        >
          <div style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
            {COLS.map(col => {
              const items = ft.filter(t => t.status === col.key);
              return (
                <KanbanColumn
                  key={col.key}
                  col={col}
                  items={items}
                  dragEnabled={canReorder}
                  canEdit={canEdit}
                  onAdvance={advance}
                  onEdit={openEdit}
                  onDelete={del}
                  onConvert={convertToMetric}
                  onAdd={() => openAdd(col.key)}
                />
              );
            })}
          </div>
          <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0.9, 0.3, 1)" }}>
            {activeTask ? <TaskCardPreview t={activeTask} /> : null}
          </DragOverlay>
        </DndContext>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Task">
        {taskForm}
        <div style={{ display:"flex", gap:9, justifyContent:"flex-end", marginTop:4 }}>
          <button onClick={() => setShowAdd(false)} style={{ padding:"7px 14px", borderRadius:8, border:"1px solid var(--border-card)", background:"var(--bg-input)", color:"var(--text-primary)", fontSize:12, fontWeight:600, cursor:"pointer" }}>Cancel</button>
          <button onClick={save} style={{ padding:"7px 14px", borderRadius:8, background:"var(--accent)", color:"#fff", border:"none", fontSize:12, fontWeight:700, cursor:"pointer" }}>Add Task</button>
        </div>
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit Task">
        {taskForm}
        <div style={{ display:"flex", gap:9, justifyContent:"flex-end", marginTop:4 }}>
          <button onClick={() => setEditing(null)} style={{ padding:"7px 14px", borderRadius:8, border:"1px solid var(--border-card)", background:"var(--bg-input)", color:"var(--text-primary)", fontSize:12, fontWeight:600, cursor:"pointer" }}>Cancel</button>
          <button onClick={update} style={{ padding:"7px 14px", borderRadius:8, background:"var(--accent)", color:"#fff", border:"none", fontSize:12, fontWeight:700, cursor:"pointer" }}>Save Changes</button>
        </div>
      </Modal>

      <Modal open={showAddMember} onClose={() => setShowAddMember(false)} title="Add Team Member">
        {memberFormJsx}
        <div style={{ display:"flex", gap:9, justifyContent:"flex-end", marginTop:4 }}>
          <button onClick={() => setShowAddMember(false)} style={{ padding:"7px 14px", borderRadius:8, border:"1px solid var(--border-card)", background:"var(--bg-input)", color:"var(--text-primary)", fontSize:12, fontWeight:600, cursor:"pointer" }}>Cancel</button>
          <button onClick={saveMember} style={{ padding:"7px 14px", borderRadius:8, background:"var(--accent)", color:"#fff", border:"none", fontSize:12, fontWeight:700, cursor:"pointer" }}>Add Member</button>
        </div>
      </Modal>
    </AppLayout>
  );
}

function KanbanColumn({
  col,
  items,
  dragEnabled,
  canEdit,
  onAdvance,
  onEdit,
  onDelete,
  onConvert,
  onAdd,
}: {
  col: { key: string; label: string; color: string };
  items: Task[];
  dragEnabled: boolean;
  canEdit: boolean;
  onAdvance: (t: Task) => void;
  onEdit: (t: Task) => void;
  onDelete: (id: string | number) => void;
  onConvert: (t: Task, mode: "move" | "copy") => void;
  onAdd: () => void;
}) {
  const { setNodeRef } = useDroppable({ id: col.key });
  return (
    <div ref={dragEnabled ? setNodeRef : undefined} style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", gap:9 }}>
      <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:4 }}>
        <div style={{ width:8, height:8, borderRadius:"50%", background:col.color }} />
        <span style={{ fontSize:12, fontWeight:700, color:"var(--text-primary)" }}>{col.label}</span>
        <span style={{ fontSize:10, fontWeight:700, background:"var(--bg-input)", color:"var(--text-secondary)", padding:"1px 7px", borderRadius:10 }}>{items.length}</span>
      </div>
      <SortableContext items={items.map(t => String(t.id))} strategy={verticalListSortingStrategy}>
        {items.map(t => (
          <TaskCard
            key={t.id}
            t={t}
            dragEnabled={dragEnabled}
            canEdit={canEdit}
            onAdvance={() => onAdvance(t)}
            onEdit={() => onEdit(t)}
            onDelete={() => onDelete(t.id)}
            onConvert={(mode) => onConvert(t, mode)}
          />
        ))}
      </SortableContext>
      {canEdit && (
        <button onClick={onAdd} style={{ padding:"9px", borderRadius:9, border:"1px dashed var(--border-card)", background:"transparent", color:"var(--text-muted)", fontSize:12, display:"flex", alignItems:"center", justifyContent:"center", gap:5, cursor:"pointer" }}>+ Add task</button>
      )}
    </div>
  );
}

function TaskCardBody({
  t,
  dragHandle,
  onAdvance,
  onEdit,
  onDelete,
  onConvert,
}: {
  t: Task;
  dragHandle?: React.ReactNode;
  onAdvance?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onConvert?: (mode: "move" | "copy") => void;
}) {
  const pr = PR[t.priority];
  const notes = (t as unknown as { notes?: string }).notes;
  return (
    <div style={{ padding:13 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:9 }}>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          {dragHandle}
          <Badge bg={pr.bg} color={pr.c}>{pr.l}</Badge>
        </div>
        {t.assigneeId ? (
          <span title={t.assigneeName || t.assigneeInitials || "Unassigned"} style={{ display: "inline-flex" }}>
            <Avatar s={t.assigneeInitials ?? "?"} size={24} />
          </span>
        ) : (
          <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Unassigned</span>
        )}
      </div>
      <div style={{ fontSize:12, fontWeight:700, color:"var(--text-primary)", marginBottom:7, lineHeight:1.4 }}>{t.title}</div>
      <div style={{ fontSize:11, color:"var(--text-secondary)", marginBottom:notes ? 6 : 10 }}>
        {t.departmentName || <span style={{ color:"var(--text-muted)", fontStyle:"italic" }}>No department</span>} · <span style={{ color: isTaskDueTodayOrPast(t.dueDate) ? "var(--danger)" : "var(--text-secondary)" }}>⏱ {formatTaskDueDate(t.dueDate)}</span>
      </div>
      {notes && (
        <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 10, lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
          {notes}
        </div>
      )}
      {onAdvance && onDelete && (
        <div style={{ display:"flex", gap:6, flexWrap: "wrap" }} onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
          <button onClick={onAdvance} style={{ flex:1, minWidth: 60, padding:"5px 7px", borderRadius:7, border:"1px solid var(--border-card)", background:"var(--bg-input)", color:"var(--text-secondary)", fontSize:11, cursor:"pointer" }}>{NL[t.status]}</button>
          {onEdit && <button onClick={onEdit} style={{ padding:"5px 8px", borderRadius:7, border:"1px solid var(--border-card)", background:"var(--bg-input)", color:"var(--text-secondary)", fontSize:11, cursor:"pointer" }}>Edit</button>}
          {onConvert && <button onClick={() => { if (confirm("Convert this task to a metric? (Copy)")) onConvert("copy"); }} title="Convert to metric (keeps task)" style={{ padding:"5px 8px", borderRadius:7, border:"1px solid var(--accent)44", background:"var(--accent-bg)", color:"var(--accent)", fontSize:11, cursor:"pointer" }}>→ Asset</button>}
          <button onClick={onDelete} style={{ padding:"5px 8px", borderRadius:7, border:"1px solid rgba(220,38,38,.3)", background:"var(--danger-bg)", color:"var(--danger)", fontSize:11, cursor:"pointer" }}>✕</button>
        </div>
      )}
    </div>
  );
}

function TaskCard({
  t,
  dragEnabled,
  canEdit,
  onAdvance,
  onEdit,
  onDelete,
  onConvert,
}: {
  t: Task;
  dragEnabled: boolean;
  canEdit: boolean;
  onAdvance: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onConvert?: (mode: "move" | "copy") => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: String(t.id), disabled: !dragEnabled });
  // While dragging, visually empty the original slot and let the DragOverlay
  // clone be the only visible thing the user is moving.
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.25 : 1,
    visibility: isDragging ? "hidden" : "visible",
    cursor: dragEnabled ? "grab" : undefined,
    touchAction: dragEnabled ? "none" : undefined,
  };
  // Subtle grip in the corner as a visual cue. The whole card is draggable
  // because we spread listeners on the outer wrapper — dnd-kit's 5px
  // activation distance keeps the click-to-edit / advance buttons working.
  const handle = dragEnabled ? (
    <span
      aria-hidden
      style={{ color: "var(--text-muted)", display: "flex", opacity: 0.45 }}
    >
      <GripVertical size={14} />
    </span>
  ) : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="hub-card"
      {...(dragEnabled ? listeners : {})}
      {...(dragEnabled ? attributes : {})}
    >
      {/* Members only see a read-only card — the action row is suppressed
          entirely. Manager+ keeps the full Advance / Edit / Delete cluster. */}
      <TaskCardBody
        t={t}
        dragHandle={handle}
        onAdvance={canEdit ? onAdvance : undefined}
        onEdit={canEdit ? onEdit : undefined}
        onDelete={canEdit ? onDelete : undefined}
        onConvert={canEdit ? onConvert : undefined}
      />
    </div>
  );
}

// Used inside DragOverlay — a non-sortable lifted clone of the dragged card.
function TaskCardPreview({ t }: { t: Task }) {
  return (
    <div
      className="hub-card"
      style={{
        cursor: "grabbing",
        transform: "scale(1.04) rotate(1.5deg)",
        boxShadow: "0 22px 50px rgba(0,0,0,0.55), 0 8px 18px rgba(0,0,0,0.35)",
        borderColor: "var(--accent)",
      }}
    >
      <TaskCardBody t={t} dragHandle={<GripVertical size={14} style={{ color: "var(--text-muted)" }} />} />
    </div>
  );
}
