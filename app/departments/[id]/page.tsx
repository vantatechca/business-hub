"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import AppLayout from "@/components/Layout";
import {
  Avatar, Card, ProgressBar, Modal, FormField, HubInput, HubSelect,
  ConfirmModal, useToast, ToastList, healthColor, Badge, EmptyState,
} from "@/components/ui/shared";
import type { Department, Task } from "@/lib/types";
import { ArrowLeft, X, Pencil, Plus, Loader2 } from "lucide-react";

const PR: Record<string, { l: string; bg: string; c: string }> = {
  urgent: { l: "Urgent", bg: "rgba(248,113,113,.15)", c: "#f87171" },
  high:   { l: "High",   bg: "rgba(251,191,36,.15)", c: "#fbbf24" },
  medium: { l: "Medium", bg: "rgba(91,142,248,.15)", c: "#5b8ef8" },
  low:    { l: "Low",    bg: "rgba(52,211,153,.15)", c: "#34d399" },
};
const NS: Record<string, string> = { todo: "in-progress", "in-progress": "done", done: "todo" };
const NL: Record<string, string> = { todo: "Start →", "in-progress": "Complete ✓", done: "Reopen" };
const COLS = [
  { key: "todo",        label: "To Do",       color: "var(--text-secondary)" },
  { key: "in-progress", label: "In Progress", color: "var(--accent)" },
  { key: "done",        label: "Done",        color: "var(--success)" },
];
const PRIORITIES = ["urgent", "high", "medium", "low"];
const ICONS = ["💼","⚙️","📣","📊","👥","🔧","🎯","⭐","⚖️","🏗️","🌐","💡","🔬","📦","🎨","🧬","🚀","💰","📱","🎓"];
const COLORS = ["#5b8ef8","#34d399","#a78bfa","#fbbf24","#f87171","#22d3ee","#84cc16","#fb923c","#e879f9","#6366f1"];

const blankTask = {
  id: undefined as number | undefined,
  title: "", priority: "medium", status: "todo",
  departmentId: 0 as number | string, departmentName: "",
  assigneeInitials: "", dueDate: "Today",
};

export default function DepartmentDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const deptId = params?.id;

  const [dept, setDept] = useState<Department | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const { ts, toast } = useToast();

  // Task CRUD state
  const [taskForm, setTaskForm] = useState<typeof blankTask>({ ...blankTask });
  const [showAddTask, setShowAddTask] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);

  // Edit dept drawer state
  const [showEditDept, setShowEditDept] = useState(false);
  const [deptForm, setDeptForm] = useState({
    name: "", description: "", icon: "💼", color: COLORS[0],
    health: 0, memberCount: 0, priorityScore: 50,
  });
  const [deletingDept, setDeletingDept] = useState(false);

  const load = useCallback(() => {
    if (!deptId) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/departments/${deptId}`).then(r => r.json()),
      fetch("/api/tasks").then(r => r.json()),
    ])
      .then(([d, t]) => {
        if (d.error || !d.data) { setNotFound(true); setLoading(false); return; }
        setDept(d.data);
        setTasks(t.data ?? []);
        setLoading(false);
      })
      .catch(() => { setLoading(false); toast("Failed to load", "er"); });
  }, [deptId, toast]);

  useEffect(() => { load(); }, [load]);

  // Filter tasks for THIS department by name (string match works for both
  // seed numeric ids and DB UUIDs since seed tasks store departmentName too).
  const myTasks = dept
    ? tasks.filter(t => (t.departmentName ?? "") === dept.name || String(t.departmentId) === String(dept.id))
    : [];

  // ── Task CRUD ──────────────────────────────────────
  const openAddTask = (status: string = "todo") => {
    if (!dept) return;
    setTaskForm({
      ...blankTask, status,
      departmentId: dept.id as number | string,
      departmentName: dept.name,
    });
    setShowAddTask(true);
  };
  const openEditTask = (t: Task) => {
    setEditingTask(t);
    setTaskForm({
      id: t.id,
      title: t.title,
      priority: t.priority,
      status: t.status,
      departmentId: t.departmentId ?? 0,
      departmentName: t.departmentName ?? "",
      assigneeInitials: t.assigneeInitials ?? "",
      dueDate: t.dueDate ?? "",
    });
  };

  const saveTask = async () => {
    if (!taskForm.title || !taskForm.assigneeInitials) {
      return toast("Title and assignee required", "er");
    }
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(taskForm),
    });
    await load();
    setShowAddTask(false);
    toast("Task added");
  };

  const updateTask = async () => {
    if (!editingTask) return;
    if (!taskForm.title || !taskForm.assigneeInitials) {
      return toast("Title and assignee required", "er");
    }
    const res = await fetch(`/api/tasks/${editingTask.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(taskForm),
    });
    if (!res.ok) return toast("Update failed", "er");
    await load();
    setEditingTask(null);
    toast("Task updated");
  };

  const advanceTask = async (t: Task) => {
    const status = NS[t.status] as Task["status"];
    await fetch(`/api/tasks/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setTasks(p => p.map(x => x.id === t.id ? { ...x, status } : x));
  };

  const deleteTask = async () => {
    if (!deletingTask) return;
    await fetch(`/api/tasks/${deletingTask.id}`, { method: "DELETE" });
    setTasks(p => p.filter(t => t.id !== deletingTask.id));
    setDeletingTask(null);
    toast("Task deleted", "er");
  };

  // ── Department edit ────────────────────────────────
  const openEditDept = () => {
    if (!dept) return;
    setDeptForm({
      name: dept.name,
      description: dept.description ?? "",
      icon: dept.icon,
      color: dept.color,
      health: dept.health ?? 0,
      memberCount: dept.memberCount ?? 0,
      priorityScore: dept.priorityScore ?? 50,
    });
    setShowEditDept(true);
  };

  const saveDept = async () => {
    if (!dept) return;
    if (!deptForm.name) return toast("Name required", "er");
    const res = await fetch(`/api/departments/${dept.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(deptForm),
    });
    if (!res.ok) return toast("Update failed", "er");
    await load();
    setShowEditDept(false);
    toast("Department updated");
  };

  const deleteDept = async () => {
    if (!dept) return;
    await fetch(`/api/departments/${dept.id}`, { method: "DELETE" });
    toast("Department deleted", "er");
    router.push("/departments");
  };

  // ── Reusable form JSX values (focus-safe pattern) ──
  const taskFormJsx = (
    <>
      <FormField label="Task Title">
        <HubInput value={taskForm.title} onChange={e => setTaskForm(p => ({ ...p, title: e.target.value }))} placeholder="Describe the task…" />
      </FormField>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <FormField label="Priority">
          <HubSelect value={taskForm.priority} onChange={e => setTaskForm(p => ({ ...p, priority: e.target.value }))}>
            {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
          </HubSelect>
        </FormField>
        <FormField label="Status">
          <HubSelect value={taskForm.status} onChange={e => setTaskForm(p => ({ ...p, status: e.target.value }))}>
            <option value="todo">To Do</option>
            <option value="in-progress">In Progress</option>
            <option value="done">Done</option>
          </HubSelect>
        </FormField>
      </div>
      <FormField label="Due Date">
        <HubInput value={taskForm.dueDate} onChange={e => setTaskForm(p => ({ ...p, dueDate: e.target.value }))} placeholder="Today, Dec 15…" />
      </FormField>
      <FormField label="Assignee Initials">
        <HubInput value={taskForm.assigneeInitials} onChange={e => setTaskForm(p => ({ ...p, assigneeInitials: e.target.value.toUpperCase().slice(0, 2) }))} placeholder="AC" maxLength={2} style={{ textTransform: "uppercase" }} />
      </FormField>
    </>
  );

  const deptFormJsx = (
    <>
      <FormField label="Department Name">
        <HubInput value={deptForm.name} onChange={e => setDeptForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Legal, Design…" />
      </FormField>
      <FormField label="Description">
        <HubInput value={deptForm.description} onChange={e => setDeptForm(p => ({ ...p, description: e.target.value }))} placeholder="Brief description…" />
      </FormField>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <FormField label="Members">
          <HubInput type="number" min="0" value={deptForm.memberCount} onChange={e => setDeptForm(p => ({ ...p, memberCount: +e.target.value }))} />
        </FormField>
        <FormField label="Health (%)">
          <HubInput type="number" min="0" max="100" value={deptForm.health} onChange={e => setDeptForm(p => ({ ...p, health: +e.target.value }))} />
        </FormField>
      </div>
      <FormField label="Priority Score (1-100)">
        <HubInput type="number" min="1" max="100" value={deptForm.priorityScore} onChange={e => setDeptForm(p => ({ ...p, priorityScore: +e.target.value }))} />
      </FormField>
      <FormField label="Icon">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {ICONS.map(ic => (
            <button
              key={ic}
              onClick={() => setDeptForm(p => ({ ...p, icon: ic }))}
              style={{
                width: 34, height: 34, borderRadius: 8,
                border: `2px solid ${deptForm.icon === ic ? "var(--accent)" : "var(--border-card)"}`,
                background: "var(--bg-input)", fontSize: 16, cursor: "pointer",
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
              onClick={() => setDeptForm(p => ({ ...p, color: c }))}
              style={{
                width: 26, height: 26, borderRadius: "50%", background: c, cursor: "pointer",
                border: `3px solid ${deptForm.color === c ? "var(--text-primary)" : "transparent"}`,
              }}
            />
          ))}
        </div>
      </FormField>
    </>
  );

  if (loading) {
    return (
      <AppLayout title="Department">
        <div style={{ padding: 60, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
          <Loader2 size={20} style={{ animation: "spin 1s linear infinite", display: "inline-block", marginBottom: 10 }} />
          <div>Loading department…</div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </AppLayout>
    );
  }

  if (notFound || !dept) {
    return (
      <AppLayout title="Department">
        <EmptyState
          icon="🚫"
          title="Department not found"
          desc="It may have been deleted or your database isn't configured."
          action={<Link href="/departments" style={{ padding: "8px 16px", borderRadius: 8, background: "var(--accent)", color: "#fff", fontWeight: 700, fontSize: 13, textDecoration: "none" }}>Back to departments</Link>}
        />
      </AppLayout>
    );
  }

  return (
    <AppLayout title={dept.name}>
      <ToastList ts={ts} />

      {/* Back link */}
      <Link
        href="/departments"
        style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text-secondary)", textDecoration: "none", marginBottom: 12 }}
      >
        <ArrowLeft size={13} /> Departments
      </Link>

      {/* Department header */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: 4 }}>
          <div
            style={{
              width: 60, height: 60, borderRadius: 14,
              background: `${dept.color}18`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 32, flexShrink: 0,
            }}
          >
            {dept.icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>{dept.name}</div>
            {dept.description && (
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3 }}>{dept.description}</div>
            )}
            <div style={{ display: "flex", gap: 18, marginTop: 8, fontSize: 11, color: "var(--text-secondary)" }}>
              <span>👥 <strong style={{ color: "var(--text-primary)" }}>{dept.memberCount ?? 0}</strong> members</span>
              <span>📊 <strong style={{ color: healthColor(dept.health ?? 0) }}>{dept.health ?? 0}%</strong> health</span>
              <span>⚡ <strong style={{ color: "var(--text-primary)" }}>{dept.priorityScore}</strong> priority</span>
              <span>📋 <strong style={{ color: "var(--text-primary)" }}>{myTasks.length}</strong> task{myTasks.length === 1 ? "" : "s"}</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <button
              onClick={openEditDept}
              style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
            >
              <Pencil size={13} /> Edit Department
            </button>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <ProgressBar value={dept.health ?? 0} color={healthColor(dept.health ?? 0)} />
        </div>
      </Card>

      {/* Tasks header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18, marginBottom: 11 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-primary)" }}>Tasks</div>
        <button
          onClick={() => openAddTask("todo")}
          style={{ padding: "6px 12px", borderRadius: 8, background: "var(--accent)", color: "#fff", border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
        >
          <Plus size={12} /> Add Task
        </button>
      </div>

      {/* Tasks columns */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, alignItems: "flex-start" }}>
        {COLS.map(col => {
          const items = myTasks.filter(t => t.status === col.key);
          return (
            <div key={col.key} style={{ display: "flex", flexDirection: "column", gap: 9, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: col.color }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{col.label}</span>
                <span style={{ fontSize: 10, fontWeight: 700, background: "var(--bg-input)", color: "var(--text-secondary)", padding: "1px 7px", borderRadius: 10 }}>{items.length}</span>
              </div>
              {items.length === 0 ? (
                <div style={{ padding: "16px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 11 }}>
                  No tasks
                </div>
              ) : (
                items.map(t => {
                  const pr = PR[t.priority];
                  return (
                    <div key={t.id} className="hub-card" style={{ padding: 13 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 9 }}>
                        <Badge bg={pr.bg} color={pr.c}>{pr.l}</Badge>
                        <Avatar s={t.assigneeInitials ?? "?"} size={24} />
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 7, lineHeight: 1.4 }}>{t.title}</div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 10 }}>
                        <span style={{ color: t.dueDate === "Today" ? "var(--danger)" : "var(--text-secondary)" }}>⏱ {t.dueDate}</span>
                      </div>
                      <div style={{ display: "flex", gap: 5 }}>
                        <button
                          onClick={() => advanceTask(t)}
                          style={{ flex: 1, padding: "5px 7px", borderRadius: 7, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-secondary)", fontSize: 11, cursor: "pointer" }}
                        >
                          {NL[t.status]}
                        </button>
                        <button
                          onClick={() => openEditTask(t)}
                          style={{ padding: "5px 8px", borderRadius: 7, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-secondary)", fontSize: 11, cursor: "pointer" }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setDeletingTask(t)}
                          style={{ padding: "5px 8px", borderRadius: 7, border: "1px solid rgba(220,38,38,.3)", background: "var(--danger-bg)", color: "var(--danger)", fontSize: 11, cursor: "pointer" }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
              <button
                onClick={() => openAddTask(col.key)}
                style={{ padding: 9, borderRadius: 9, border: "1px dashed var(--border-card)", background: "transparent", color: "var(--text-muted)", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, cursor: "pointer" }}
              >
                + Add task
              </button>
            </div>
          );
        })}
      </div>

      {/* Add task modal */}
      <Modal open={showAddTask} onClose={() => setShowAddTask(false)} title={`Add Task · ${dept.name}`}>
        {taskFormJsx}
        <div style={{ display: "flex", gap: 9, justifyContent: "flex-end", marginTop: 4 }}>
          <button onClick={() => setShowAddTask(false)} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
          <button onClick={saveTask} style={{ padding: "7px 14px", borderRadius: 8, background: "var(--accent)", color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Add Task</button>
        </div>
      </Modal>

      {/* Edit task modal */}
      <Modal open={!!editingTask} onClose={() => setEditingTask(null)} title={`Edit Task`}>
        {taskFormJsx}
        <div style={{ display: "flex", gap: 9, justifyContent: "flex-end", marginTop: 4 }}>
          <button onClick={() => setEditingTask(null)} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
          <button onClick={updateTask} style={{ padding: "7px 14px", borderRadius: 8, background: "var(--accent)", color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Save Changes</button>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deletingTask}
        onClose={() => setDeletingTask(null)}
        onConfirm={deleteTask}
        name={deletingTask?.title ?? ""}
        entity="task"
      />

      {/* Edit Department side drawer */}
      {showEditDept && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setShowEditDept(false); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 500, display: "flex", justifyContent: "flex-end" }}
        >
          <div
            style={{
              width: 480, maxWidth: "100vw", height: "100%", overflowY: "auto",
              background: "var(--bg-card)", borderLeft: "1px solid var(--border-card)",
              boxShadow: "var(--shadow-modal)", animation: "slideRight .2s ease",
            }}
          >
            <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--border-divider)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)" }}>Edit Department</div>
              <button onClick={() => setShowEditDept(false)} aria-label="Close" style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", display: "flex" }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: "18px 22px" }}>
              {deptFormJsx}
              <div style={{ display: "flex", gap: 9, justifyContent: "space-between", marginTop: 18 }}>
                <button
                  onClick={() => setDeletingDept(true)}
                  style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid rgba(220,38,38,.3)", background: "var(--danger-bg)", color: "var(--danger)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                >
                  Delete Department
                </button>
                <div style={{ display: "flex", gap: 9 }}>
                  <button onClick={() => setShowEditDept(false)} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                  <button onClick={saveDept} style={{ padding: "8px 14px", borderRadius: 8, background: "var(--accent)", color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Save Changes</button>
                </div>
              </div>
            </div>
          </div>
          <style>{`@keyframes slideRight { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
        </div>
      )}

      <ConfirmModal
        open={deletingDept}
        onClose={() => setDeletingDept(false)}
        onConfirm={deleteDept}
        name={dept.name}
        entity="department"
      />
    </AppLayout>
  );
}
