"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import AppLayout from "@/components/Layout";
import { Avatar, Badge, Modal, FormField, HubInput, HubSelect, useToast, ToastList } from "@/components/ui/shared";
import type { Task, Department } from "@/lib/types";
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
const blank = { title:"", priority:"medium", status:"todo", departmentId: "" as string | number, departmentName:"", assigneeInitials:"", dueDate:"Today" };

export default function TasksPage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role ?? "member";
  const canReorder = role === "admin" || role === "leader";

  const [tasks, setTasks]   = useState<Task[]>([]);
  const [depts, setDepts]   = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ]           = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm]     = useState<typeof blank>({ ...blank });
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const { ts, toast }       = useToast();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const activeTask = activeDragId ? tasks.find(t => String(t.id) === activeDragId) ?? null : null;

  const load = () => Promise.all([
    fetch("/api/tasks").then(r => r.json()),
    fetch("/api/departments").then(r => r.json()),
  ]).then(([t, d]) => { setTasks(t.data ?? []); setDepts(d.data ?? []); setLoading(false); });
  useEffect(() => { load(); }, []);

  const ft = tasks.filter(t => t.title.toLowerCase().includes(q.toLowerCase()));

  const openAdd = (status = "todo") => {
    setForm({ ...blank, status, departmentId: String(depts[0]?.id ?? ""), departmentName: depts[0]?.name ?? "" });
    setShowAdd(true);
  };

  const save = async () => {
    if (!form.title || !form.assigneeInitials) return toast("Title and assignee required", "er");
    await fetch("/api/tasks", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(form) });
    await load(); setShowAdd(false); toast("Task added");
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
    const d = depts.find(d => String(d.id) === String(id));
    setForm(p => ({ ...p, departmentId: id as number, departmentName: d?.name ?? "" }));
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

  return (
    <AppLayout title="Tasks" onNew={() => openAdd()} newLabel="Add Task">
      <ToastList ts={ts} />
      <div style={{ display:"flex", gap:10, marginBottom:14, alignItems:"center" }}>
        <div style={{ flex:1, display:"flex", alignItems:"center", gap:8, background:"var(--bg-card)", border:"1px solid var(--border-card)", borderRadius:8, padding:"7px 11px" }}>
          <span style={{ color:"var(--text-muted)" }}>⌕</span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search tasks…" style={{ border:"none", background:"transparent", outline:"none", fontSize:12, color:"var(--text-primary)", width:"100%" }} />
        </div>
        <span style={{ fontSize:12, color:"var(--text-secondary)" }}>{tasks.length} tasks · {tasks.filter(t=>t.status==="done").length} done</span>
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
                  onAdvance={advance}
                  onDelete={del}
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
            <HubSelect value={form.departmentId} onChange={e => selectDept(+e.target.value)}>
              {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </HubSelect>
          </FormField>
          <FormField label="Due Date"><HubInput value={form.dueDate} onChange={e => setForm(p => ({...p,dueDate:e.target.value}))} placeholder="Today, Dec 15…" /></FormField>
        </div>
        <FormField label="Assignee Initials"><HubInput value={form.assigneeInitials} onChange={e => setForm(p => ({...p,assigneeInitials:e.target.value.toUpperCase().slice(0,2)}))} placeholder="AC" maxLength={2} style={{ textTransform:"uppercase" }} /></FormField>
        <div style={{ display:"flex", gap:9, justifyContent:"flex-end", marginTop:4 }}>
          <button onClick={() => setShowAdd(false)} style={{ padding:"7px 14px", borderRadius:8, border:"1px solid var(--border-card)", background:"var(--bg-input)", color:"var(--text-primary)", fontSize:12, fontWeight:600, cursor:"pointer" }}>Cancel</button>
          <button onClick={save} style={{ padding:"7px 14px", borderRadius:8, background:"var(--accent)", color:"#fff", border:"none", fontSize:12, fontWeight:700, cursor:"pointer" }}>Add Task</button>
        </div>
      </Modal>
    </AppLayout>
  );
}

function KanbanColumn({
  col,
  items,
  dragEnabled,
  onAdvance,
  onDelete,
  onAdd,
}: {
  col: { key: string; label: string; color: string };
  items: Task[];
  dragEnabled: boolean;
  onAdvance: (t: Task) => void;
  onDelete: (id: string | number) => void;
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
          <TaskCard key={t.id} t={t} dragEnabled={dragEnabled} onAdvance={() => onAdvance(t)} onDelete={() => onDelete(t.id)} />
        ))}
      </SortableContext>
      <button onClick={onAdd} style={{ padding:"9px", borderRadius:9, border:"1px dashed var(--border-card)", background:"transparent", color:"var(--text-muted)", fontSize:12, display:"flex", alignItems:"center", justifyContent:"center", gap:5, cursor:"pointer" }}>+ Add task</button>
    </div>
  );
}

function TaskCardBody({
  t,
  dragHandle,
  onAdvance,
  onDelete,
}: {
  t: Task;
  dragHandle?: React.ReactNode;
  onAdvance?: () => void;
  onDelete?: () => void;
}) {
  const pr = PR[t.priority];
  return (
    <div style={{ padding:13 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:9 }}>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          {dragHandle}
          <Badge bg={pr.bg} color={pr.c}>{pr.l}</Badge>
        </div>
        <Avatar s={t.assigneeInitials ?? "?"} size={24} />
      </div>
      <div style={{ fontSize:12, fontWeight:700, color:"var(--text-primary)", marginBottom:7, lineHeight:1.4 }}>{t.title}</div>
      <div style={{ fontSize:11, color:"var(--text-secondary)", marginBottom:10 }}>
        {t.departmentName} · <span style={{ color:t.dueDate==="Today"?"var(--danger)":"var(--text-secondary)" }}>⏱ {t.dueDate}</span>
      </div>
      {onAdvance && onDelete && (
        <div style={{ display:"flex", gap:6 }}>
          <button onClick={onAdvance} style={{ flex:1, padding:"5px 7px", borderRadius:7, border:"1px solid var(--border-card)", background:"var(--bg-input)", color:"var(--text-secondary)", fontSize:11, cursor:"pointer" }}>{NL[t.status]}</button>
          <button onClick={onDelete} style={{ padding:"5px 8px", borderRadius:7, border:"1px solid rgba(220,38,38,.3)", background:"var(--danger-bg)", color:"var(--danger)", fontSize:11, cursor:"pointer" }}>✕</button>
        </div>
      )}
    </div>
  );
}

function TaskCard({
  t,
  dragEnabled,
  onAdvance,
  onDelete,
}: {
  t: Task;
  dragEnabled: boolean;
  onAdvance: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: String(t.id), disabled: !dragEnabled });
  // While dragging, visually empty the original slot and let the DragOverlay
  // clone be the only visible thing the user is moving.
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.25 : 1,
    visibility: isDragging ? "hidden" : "visible",
  };
  const handle = dragEnabled ? (
    <button
      {...attributes}
      {...listeners}
      aria-label="Drag"
      style={{ background:"transparent", border:"none", color:"var(--text-muted)", cursor:"grab", padding:0, touchAction:"none", display:"flex" }}
      onClick={e => e.stopPropagation()}
    >
      <GripVertical size={14} />
    </button>
  ) : undefined;
  return (
    <div ref={setNodeRef} style={style} className="hub-card">
      <TaskCardBody t={t} dragHandle={handle} onAdvance={onAdvance} onDelete={onDelete} />
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
