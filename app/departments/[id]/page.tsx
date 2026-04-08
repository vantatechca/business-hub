"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import AppLayout from "@/components/Layout";
import {
  Avatar, Card, ProgressBar, Modal, FormField, HubInput, HubSelect,
  ConfirmModal, useToast, ToastList, healthColor, Badge, EmptyState,
} from "@/components/ui/shared";
import type { Department, Task, TeamMember, Metric, RevenueEntry, ExpenseEntry, MetricAssignment } from "@/lib/types";
import { formatTaskDueDate, isTaskDueTodayOrPast, PRIORITY_OPTIONS, priorityToOption, priorityLabel, priorityColor, formatMetricValue } from "@/lib/types";
import { formatValue } from "@/components/ui/shared";
import DueAlertBanner from "@/components/DueAlertBanner";
import { formatMoney, CURRENCIES, type Currency } from "@/lib/currency";
import { useCurrency } from "@/lib/CurrencyContext";
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

const todayIso = () => new Date().toISOString().slice(0, 10);
const blankTask = {
  id: undefined as string | undefined,
  title: "", priority: "medium", status: "todo",
  departmentId: "" as number | string, departmentName: "",
  assigneeId: "" as string,
  assigneeInitials: "",
  assigneeName: "",
  dueDate: todayIso(),
};
const blankMember = { userId: "", role: "member" as "admin" | "leader" | "member" };

export default function DepartmentDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const deptId = params?.id;

  const [dept, setDept] = useState<Department | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [assignments, setAssignments] = useState<MetricAssignment[]>([]);
  const [revenue, setRevenue] = useState<RevenueEntry[]>([]);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  // Active tab — changes which section renders below the department header.
  const [tab, setTab] = useState<"tasks" | "metrics" | "team" | "expenses" | "revenue">("tasks");
  const { ts, toast } = useToast();

  // Task CRUD state
  const [taskForm, setTaskForm] = useState<typeof blankTask>({ ...blankTask });
  const [showAddTask, setShowAddTask] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);

  // Inline "add member" modal state (reachable from the Assignee dropdown)
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberForm, setMemberForm] = useState<typeof blankMember>({ ...blankMember });

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
      fetch("/api/team").then(r => r.json()),
      fetch("/api/metrics").then(r => r.json()),
      fetch("/api/revenue").then(r => r.json()),
      fetch("/api/expenses").then(r => r.json()),
      fetch("/api/assignments").then(r => r.json()).catch(() => ({ data: [] })),
    ])
      .then(([d, t, m, met, rev, exp, asn]) => {
        if (d.error || !d.data) { setNotFound(true); setLoading(false); return; }
        setDept(d.data);
        setTasks(t.data ?? []);
        setTeam(m.data ?? []);
        setMetrics(met.data ?? []);
        setRevenue(rev.data ?? []);
        setExpenses(exp.data ?? []);
        setAssignments(asn.data ?? []);
        setLoading(false);
      })
      .catch(() => { setLoading(false); toast("Failed to load", "er"); });
  }, [deptId, toast]);

  useEffect(() => { load(); }, [load]);

  // Filter tasks / metrics / revenue / expenses / team for THIS department.
  // We match on either id or name so entries tagged with slug-shaped ids or
  // legacy numeric ids still show up.
  const matchesDept = (entity: { departmentId?: string | number | null; departmentName?: string | null }) =>
    !!dept && (
      String(entity.departmentId ?? "") === String(dept.id)
      || (entity.departmentName ?? "") === dept.name
    );

  const myTasks    = dept ? tasks.filter(matchesDept) : [];
  const myMetrics  = dept ? metrics.filter(matchesDept) : [];
  const myRevenue  = dept ? revenue.filter(matchesDept) : [];
  const myExpenses = dept ? expenses.filter(matchesDept) : [];

  // Team scoped to this department. Leaders sort first so the "team lead"
  // appears on top; members are sorted alphabetically after.
  const roleOrder: Record<string, number> = { admin: 0, leader: 1, member: 2 };
  const myTeam = dept
    ? team
        .filter(m => String((m as unknown as { departmentId?: string }).departmentId ?? "") === String(dept.id)
          || (m.departmentName ?? "") === dept.name)
        .sort((a, b) => (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9) || a.name.localeCompare(b.name))
    : [];

  // ── Task CRUD ──────────────────────────────────────
  const openAddTask = (status: string = "todo") => {
    if (!dept) return;
    setTaskForm({
      ...blankTask, status,
      departmentId: dept.id as number | string,
      departmentName: dept.name,
      dueDate: todayIso(),
    });
    setShowAddTask(true);
  };

  // Add Member flow — picks an EXISTING user from the global team list and
  // assigns them to this department. New users are created on the /team page,
  // not here. This used to POST /api/team (create), but that made it easy to
  // accidentally duplicate people. Now we PATCH /api/team/[id] to set their
  // department_id (+ optional role change).
  const openAddMember = () => {
    if (!dept) return;
    setMemberForm({ ...blankMember });
    setShowAddMember(true);
  };

  const saveMember = async () => {
    if (!dept) return;
    if (!memberForm.userId) return toast("Select a member to assign", "er");
    const res = await fetch(`/api/team/${memberForm.userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        departmentId: dept.id,
        role: memberForm.role,
      }),
    });
    if (!res.ok) return toast("Failed to assign member", "er");
    // Refresh the team list so the new assignment appears on this page and
    // everywhere else that reads users.
    const teamRes = await fetch("/api/team").then(r => r.json());
    setTeam(teamRes.data ?? []);
    setShowAddMember(false);
    const picked = team.find(m => String(m.id) === memberForm.userId);
    toast(`${picked?.name ?? "Member"} assigned to ${dept.name}`);
  };

  // Unassign a member from THIS department. We don't deactivate or delete the
  // user — just null out their department_id so they go back to the global
  // pool and can be reassigned later from /team.
  const removeMember = async (m: TeamMember) => {
    if (!dept) return;
    const res = await fetch(`/api/team/${m.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ departmentId: null }),
    });
    if (!res.ok) return toast("Failed to remove member", "er");
    const teamRes = await fetch("/api/team").then(r => r.json());
    setTeam(teamRes.data ?? []);
    toast(`${m.name} removed from ${dept.name}`);
  };

  // When a user is picked in the dropdown, default the role dropdown to
  // their CURRENT role so the admin doesn't accidentally downgrade them.
  const pickMemberForAssign = (userId: string) => {
    const picked = team.find(m => String(m.id) === userId);
    setMemberForm(p => ({
      ...p,
      userId,
      role: (picked?.role as "admin" | "leader" | "member") ?? "member",
    }));
  };

  const selectMemberInTaskForm = (userId: string) => {
    if (userId === "__add_new__") {
      openAddMember();
      return;
    }
    if (!userId) {
      setTaskForm(p => ({ ...p, assigneeId: "", assigneeInitials: "", assigneeName: "" }));
      return;
    }
    const picked = team.find(m => String(m.id) === userId);
    setTaskForm(p => ({
      ...p,
      assigneeId: userId,
      assigneeInitials: picked?.initials ?? "",
      assigneeName: picked?.name ?? "",
    }));
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
      assigneeId: (t.assigneeId ?? "") as string,
      assigneeInitials: t.assigneeInitials ?? "",
      assigneeName: t.assigneeName ?? "",
      dueDate: t.dueDate ?? "",
    });
  };

  const saveTask = async () => {
    if (!taskForm.title || !taskForm.assigneeId) {
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
    if (!taskForm.title || !taskForm.assigneeId) {
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
        <HubInput
          type="date"
          value={/^\d{4}-\d{2}-\d{2}$/.test(taskForm.dueDate) ? taskForm.dueDate : ""}
          onChange={e => setTaskForm(p => ({ ...p, dueDate: e.target.value }))}
        />
      </FormField>
      <FormField label="Assignee">
        <HubSelect
          value={taskForm.assigneeId}
          onChange={e => selectMemberInTaskForm(e.target.value)}
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
    </>
  );

  // Candidates for assignment: everyone on the team who isn't already in THIS
  // department. Showing the already-assigned set would just be a no-op from
  // the admin's perspective so it's cleaner to hide them.
  const assignableMembers = team.filter(m => {
    const alreadyHere = String((m as unknown as { departmentId?: string }).departmentId ?? "") === String(dept?.id ?? "");
    return !alreadyHere;
  });

  const memberFormJsx = (
    <>
      <FormField label="Member">
        <HubSelect
          value={memberForm.userId}
          onChange={e => pickMemberForAssign(e.target.value)}
        >
          <option value="">— Select a team member —</option>
          {assignableMembers.map(m => (
            <option key={m.id} value={String(m.id)}>
              {m.name} ({m.role}){m.departmentName ? ` · currently in ${m.departmentName}` : ""}
            </option>
          ))}
        </HubSelect>
      </FormField>
      <FormField label="Role">
        <HubSelect
          value={memberForm.role}
          onChange={e => setMemberForm(p => ({ ...p, role: e.target.value as "admin" | "leader" | "member" }))}
        >
          <option value="admin">Admin</option>
          <option value="leader">Leader</option>
          <option value="member">Member</option>
        </HubSelect>
      </FormField>
      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
        Will be assigned to <strong style={{ color: "var(--text-primary)" }}>{dept?.name}</strong>.
        To add a brand-new person, go to the <strong style={{ color: "var(--text-primary)" }}>Team</strong> page first.
      </div>
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
      <FormField label="Priority">
        <HubSelect
          value={String(priorityToOption(deptForm.priorityScore))}
          onChange={e => setDeptForm(p => ({ ...p, priorityScore: Number(e.target.value) }))}
        >
          {PRIORITY_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </HubSelect>
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
              <span>👥 <strong style={{ color: "var(--text-primary)" }}>{myTeam.length}</strong> member{myTeam.length === 1 ? "" : "s"}</span>
              <span>📋 <strong style={{ color: "var(--text-primary)" }}>{myTasks.length}</strong> task{myTasks.length === 1 ? "" : "s"}</span>
              <span>📊 <strong style={{ color: "var(--text-primary)" }}>{myMetrics.length}</strong> metric{myMetrics.length === 1 ? "" : "s"}</span>
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
      </Card>

      {/* Due alert banner — combines this department's tasks and metrics
          into a single overdue / due-soon view. */}
      <div style={{ marginTop: 14 }}>
        <DueAlertBanner
          items={[
            ...myTasks.map(t => ({
              id: `task-${t.id}`,
              title: t.title,
              dueDate: t.dueDate,
              status: t.status,
              departmentName: "Task",
            })),
            ...myMetrics.map(m => ({
              id: `metric-${m.id}`,
              title: m.name,
              dueDate: m.dueDate ?? null,
              departmentName: "Metric",
            })),
          ]}
          label="items"
        />
      </div>

      {/* Tab bar — switches which section renders below the header. */}
      <div style={{ display: "flex", gap: 4, marginTop: 14, marginBottom: 11, borderBottom: "1px solid var(--border-divider)" }}>
        {([
          ["tasks",    `Tasks (${myTasks.length})`],
          ["metrics",  `Metrics (${myMetrics.length})`],
          ["team",     `Team (${myTeam.length})`],
          ["expenses", `Expenses (${myExpenses.length})`],
          ["revenue",  `Revenue (${myRevenue.length})`],
        ] as const).map(([key, label]) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                padding: "9px 16px",
                border: "none",
                background: "transparent",
                color: active ? "var(--accent)" : "var(--text-secondary)",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                borderBottom: `2px solid ${active ? "var(--accent)" : "transparent"}`,
                marginBottom: -1,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {tab === "tasks" && (<>
      {/* Tasks header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }}>
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
                        <span title={t.assigneeName || t.assigneeInitials || "Unassigned"} style={{ display: "inline-flex" }}>
                          <Avatar s={t.assigneeInitials ?? "?"} size={24} />
                        </span>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 7, lineHeight: 1.4 }}>{t.title}</div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 10 }}>
                        <span style={{ color: isTaskDueTodayOrPast(t.dueDate) ? "var(--danger)" : "var(--text-secondary)" }}>⏱ {formatTaskDueDate(t.dueDate)}</span>
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
      </>)}

      {tab === "metrics" && (
        <DeptMetricsTab metrics={myMetrics} assignments={assignments} departmentName={dept.name} />
      )}

      {tab === "team" && (
        <DeptTeamTab team={myTeam} departmentId={String(dept.id)} departmentName={dept.name} onAddMember={openAddMember} onRemoveMember={removeMember} />
      )}

      {tab === "expenses" && (
        <DeptExpensesTab entries={myExpenses} departmentId={String(dept.id)} departmentName={dept.name} onReload={load} toast={toast} />
      )}

      {tab === "revenue" && (
        <DeptRevenueTab entries={myRevenue} departmentId={String(dept.id)} departmentName={dept.name} onReload={load} toast={toast} />
      )}

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

      <Modal open={showAddMember} onClose={() => setShowAddMember(false)} title="Add Team Member">
        {memberFormJsx}
        <div style={{ display: "flex", gap: 9, justifyContent: "flex-end", marginTop: 14 }}>
          <button onClick={() => setShowAddMember(false)} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
          <button onClick={saveMember} style={{ padding: "7px 14px", borderRadius: 8, background: "var(--accent)", color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Add Member</button>
        </div>
      </Modal>

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

// ────────────────────────────────────────────────────────────
// Tab sub-components. These render compact lists scoped to the current
// department and link to the full-page editor for non-trivial CRUD, so
// a department's tab is primarily a "what's here" view plus quick adds.
// All writes go through the same /api/* endpoints as the global pages,
// so changes reflect everywhere automatically.
// ────────────────────────────────────────────────────────────

function DeptMetricsTab({ metrics, assignments, departmentName }: { metrics: Metric[]; assignments: MetricAssignment[]; departmentName: string }) {
  // Group assignments by metric id so each row can show its people.
  const byMetric = new Map<string, MetricAssignment[]>();
  for (const a of assignments) {
    const key = String(a.metricId);
    if (!byMetric.has(key)) byMetric.set(key, []);
    byMetric.get(key)!.push(a);
  }
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-primary)" }}>
          Metrics in {departmentName}
        </div>
        <Link
          href="/metrics"
          style={{ padding: "6px 12px", borderRadius: 8, background: "var(--accent)", color: "#fff", textDecoration: "none", fontSize: 11, fontWeight: 700 }}
        >
          + Manage on Metrics page →
        </Link>
      </div>
      {metrics.length === 0 ? (
        <EmptyState icon="📊" title="No metrics for this department" desc="Add one from the Metrics page — it'll appear here." />
      ) : (
        <div className="hub-card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="hub-table">
            <thead>
              <tr>{["Metric", "Type", "Current", "Target", "Priority", "Assignees"].map(h => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {metrics.map(m => {
                const pc = priorityColor(m.priorityScore);
                const mine = byMetric.get(String(m.id)) ?? [];
                return (
                  <tr key={m.id}>
                    <td>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{m.name}</div>
                      {m.notes && <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{m.notes.slice(0, 60)}</div>}
                    </td>
                    <td style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                      {m.metricType === "value" ? "Total" : m.metricType}
                    </td>
                    <td style={{ fontSize: 13, fontWeight: 800, color: "var(--accent)" }}>
                      {formatMetricValue(m.currentValue, m.unit)}
                    </td>
                    <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      {m.targetValue != null ? formatMetricValue(m.targetValue, m.unit) : "—"}
                    </td>
                    <td>
                      <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: `${pc}18`, color: pc }}>
                        {priorityLabel(m.priorityScore)}
                      </span>
                    </td>
                    <td>
                      {mine.length === 0 ? (
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>—</span>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center" }}>
                          {mine.map((a, i) => (
                            <span
                              key={a.id}
                              title={a.userName ?? a.userInitials ?? "Assignee"}
                              style={{ display: "inline-flex", marginLeft: i === 0 ? 0 : -6, border: "2px solid var(--bg-card)", borderRadius: "50%" }}
                            >
                              <Avatar s={a.userInitials ?? (a.userName ? a.userName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() : "?")} size={24} />
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DeptTeamTab({
  team,
  departmentName,
  onAddMember,
  onRemoveMember,
}: {
  team: TeamMember[];
  departmentId: string;
  departmentName: string;
  onAddMember: () => void;
  onRemoveMember: (m: TeamMember) => void;
}) {
  const roleColor: Record<string, string> = { admin: "var(--violet)", leader: "var(--warning)", member: "var(--accent)" };
  const statusColor: Record<string, string> = { active: "var(--success)", away: "var(--warning)", busy: "var(--danger)", offline: "var(--text-muted)" };
  const [confirming, setConfirming] = useState<TeamMember | null>(null);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-primary)" }}>
          {departmentName} · {team.length} member{team.length === 1 ? "" : "s"}
        </div>
        <button
          onClick={onAddMember}
          style={{ padding: "6px 12px", borderRadius: 8, background: "var(--accent)", color: "#fff", border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
        >
          <Plus size={12} /> Add Member
        </button>
      </div>
      {team.length === 0 ? (
        <EmptyState icon="👥" title="No members yet" desc="Add members so they appear here and across the app." />
      ) : (
        <div className="hub-card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="hub-table">
            <thead>
              <tr>{["Member", "Role", "Status", ""].map(h => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {team.map(m => (
                <tr key={m.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <Avatar s={m.initials} size={30} />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                          {m.name}
                          {m.role === "leader" && (
                            <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 4, background: "var(--warning-bg)", color: "var(--warning)", letterSpacing: ".06em", textTransform: "uppercase" }}>
                              Team Lead
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{m.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 5, fontWeight: 700, textTransform: "capitalize", background: `${roleColor[m.role]}18`, color: roleColor[m.role] }}>
                      {m.role}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor[m.status] }} />
                      <span style={{ fontSize: 11, color: statusColor[m.status], fontWeight: 600, textTransform: "capitalize" }}>{m.status}</span>
                    </div>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      onClick={() => setConfirming(m)}
                      title="Remove from department"
                      style={{ padding: "4px 9px", borderRadius: 6, border: "1px solid rgba(220,38,38,.3)", background: "var(--danger-bg)", color: "var(--danger)", fontSize: 10, fontWeight: 700, cursor: "pointer" }}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmModal
        open={!!confirming}
        onClose={() => setConfirming(null)}
        onConfirm={() => {
          if (confirming) onRemoveMember(confirming);
          setConfirming(null);
        }}
        name={confirming?.name ?? ""}
        entity="member from this department"
      />
    </div>
  );
}

function DeptExpensesTab({
  entries,
  departmentId,
  departmentName,
  onReload,
  toast,
}: {
  entries: ExpenseEntry[];
  departmentId: string;
  departmentName: string;
  onReload: () => void;
  toast: (msg: string, type?: "ok" | "er" | "wa") => void;
}) {
  return (
    <FinanceTab
      kind="expenses"
      entries={entries}
      departmentId={departmentId}
      departmentName={departmentName}
      onReload={onReload}
      toast={toast}
      accent="var(--danger)"
      title={`Expenses in ${departmentName}`}
    />
  );
}

function DeptRevenueTab({
  entries,
  departmentId,
  departmentName,
  onReload,
  toast,
}: {
  entries: RevenueEntry[];
  departmentId: string;
  departmentName: string;
  onReload: () => void;
  toast: (msg: string, type?: "ok" | "er" | "wa") => void;
}) {
  return (
    <FinanceTab
      kind="revenue"
      entries={entries}
      departmentId={departmentId}
      departmentName={departmentName}
      onReload={onReload}
      toast={toast}
      accent="var(--success)"
      title={`Revenue in ${departmentName}`}
    />
  );
}

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function FinanceTab({
  kind,
  entries,
  departmentId,
  departmentName,
  onReload,
  toast,
  accent,
  title,
}: {
  kind: "revenue" | "expenses";
  entries: (RevenueEntry | ExpenseEntry)[];
  departmentId: string;
  departmentName: string;
  onReload: () => void;
  toast: (msg: string, type?: "ok" | "er" | "wa") => void;
  accent: string;
  title: string;
}) {
  // Tab display follows the global currency — no per-tab override here, so
  // flipping the header currency switcher updates the dept expense/revenue
  // tabs in real time alongside the rest of the site.
  const { currency: displayCurrency, convert } = useCurrency();

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    amount: 0,
    currency: "USD" as Currency,
    description: "",
    month: MONTHS_SHORT[new Date().getMonth()],
    year: new Date().getFullYear(),
  });

  const endpoint = kind === "revenue" ? "/api/revenue" : "/api/expenses";

  // Convert each entry's stored amount to the global display currency.
  const amountIn = (e: RevenueEntry | ExpenseEntry) =>
    convert(e.amount, ((e as { currency?: string }).currency as Currency) || "USD", displayCurrency);

  const save = async () => {
    if (!form.amount || !form.description) return toast("Amount and description required", "er");
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        departmentId,
        departmentName,
      }),
    });
    if (!res.ok) return toast("Failed to add", "er");
    setShowAdd(false);
    setForm({ amount: 0, currency: displayCurrency, description: "", month: MONTHS_SHORT[new Date().getMonth()], year: new Date().getFullYear() });
    onReload();
    toast("Entry added");
  };

  const del = async (id: string | number) => {
    await fetch(`${endpoint}/${id}`, { method: "DELETE" });
    onReload();
    toast("Entry deleted", "er");
  };

  const total = entries.reduce((a, e) => a + amountIn(e), 0);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-primary)" }}>
          {title} · <span style={{ color: accent }}>{formatMoney(total, displayCurrency)}</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginLeft: 6 }}>({displayCurrency})</span>
        </div>
        <button
          onClick={() => { setForm(p => ({ ...p, currency: displayCurrency })); setShowAdd(true); }}
          style={{ padding: "6px 12px", borderRadius: 8, background: "var(--accent)", color: "#fff", border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
        >
          <Plus size={12} /> Add Entry
        </button>
      </div>
      {entries.length === 0 ? (
        <EmptyState icon={kind === "revenue" ? "💰" : "💸"} title={`No ${kind} entries yet`} desc="Add your first entry to start tracking." />
      ) : (
        <div className="hub-card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="hub-table">
            <thead>
              <tr>{["Month", "Description", "Amount", ""].map(h => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {entries.map(e => {
                const entryCurrency = (((e as { currency?: string }).currency) as Currency) || "USD";
                const converted = amountIn(e);
                const showConversion = entryCurrency !== displayCurrency;
                return (
                  <tr key={e.id}>
                    <td style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{e.month} {e.year}</td>
                    <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>{e.description}</td>
                    <td>
                      <div style={{ fontSize: 13, fontWeight: 700, color: accent }}>
                        {formatMoney(converted, displayCurrency)}
                      </div>
                      {showConversion && (
                        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                          {formatMoney(e.amount, entryCurrency)} {entryCurrency}
                        </div>
                      )}
                    </td>
                    <td>
                      <button
                        onClick={() => del(e.id)}
                        style={{ padding: "3px 8px", borderRadius: 6, border: "1px solid rgba(220,38,38,.3)", background: "var(--danger-bg)", color: "var(--danger)", fontSize: 11, cursor: "pointer" }}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title={`Add ${kind === "revenue" ? "Revenue" : "Expense"} · ${departmentName}`}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
          <FormField label="Amount">
            <HubInput type="number" value={form.amount || ""} onChange={e => setForm(p => ({ ...p, amount: +e.target.value }))} placeholder="50000" />
          </FormField>
          <FormField label="Currency">
            <HubSelect value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value as Currency }))}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </HubSelect>
          </FormField>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <FormField label="Month">
            <HubSelect value={form.month} onChange={e => setForm(p => ({ ...p, month: e.target.value }))}>
              {MONTHS_SHORT.map(m => <option key={m} value={m}>{m}</option>)}
            </HubSelect>
          </FormField>
          <FormField label="Year">
            <HubInput type="number" value={form.year} onChange={e => setForm(p => ({ ...p, year: +e.target.value }))} />
          </FormField>
        </div>
        <FormField label="Description">
          <HubInput value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Brief description…" />
        </FormField>
        <div style={{ display: "flex", gap: 9, justifyContent: "flex-end", marginTop: 4 }}>
          <button onClick={() => setShowAdd(false)} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
          <button onClick={save} style={{ padding: "7px 14px", borderRadius: 8, background: "var(--accent)", color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Add</button>
        </div>
      </Modal>
    </div>
  );
}
