"use client";
import { useState, useEffect } from "react";
import AppLayout from "@/components/Layout";
import { Avatar, Badge, Modal, FormField, HubInput, HubSelect, useToast, ToastList } from "@/components/ui/shared";
import type { Task, Department } from "@/lib/types";

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
const blank = { title:"", priority:"medium", status:"todo", departmentId:0, departmentName:"", assigneeInitials:"", dueDate:"Today" };

export default function TasksPage() {
  const [tasks, setTasks]   = useState<Task[]>([]);
  const [depts, setDepts]   = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ]           = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [defStatus, setDefStatus] = useState("todo");
  const [form, setForm]     = useState<typeof blank>({ ...blank });
  const { ts, toast }       = useToast();

  const load = () => Promise.all([
    fetch("/api/tasks").then(r => r.json()),
    fetch("/api/departments").then(r => r.json()),
  ]).then(([t, d]) => { setTasks(t.data ?? []); setDepts(d.data ?? []); setLoading(false); });
  useEffect(() => { load(); }, []);

  const ft = tasks.filter(t => t.title.toLowerCase().includes(q.toLowerCase()));

  const openAdd = (status = "todo") => {
    setDefStatus(status);
    setForm({ ...blank, status, departmentId: depts[0]?.id ?? 0, departmentName: depts[0]?.name ?? "" });
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
    setTasks(p => p.map(x => x.id === t.id ? { ...x, status } : x));
  };

  const del = async (id: number) => {
    await fetch(`/api/tasks/${id}`, { method:"DELETE" });
    setTasks(p => p.filter(t => t.id !== id));
    toast("Task deleted", "er");
  };

  const selectDept = (id: number) => {
    const d = depts.find(d => d.id === id);
    setForm(p => ({ ...p, departmentId:id, departmentName: d?.name ?? "" }));
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
        <div style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
          {COLS.map(col => {
            const items = ft.filter(t => t.status === col.key);
            return (
              <div key={col.key} style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", gap:9 }}>
                <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:4 }}>
                  <div style={{ width:8, height:8, borderRadius:"50%", background:col.color }} />
                  <span style={{ fontSize:12, fontWeight:700, color:"var(--text-primary)" }}>{col.label}</span>
                  <span style={{ fontSize:10, fontWeight:700, background:"var(--bg-input)", color:"var(--text-secondary)", padding:"1px 7px", borderRadius:10 }}>{items.length}</span>
                </div>
                {items.map(t => {
                  const pr = PR[t.priority];
                  return (
                    <div key={t.id} className="hub-card" style={{ padding:13 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:9 }}>
                        <Badge bg={pr.bg} color={pr.c}>{pr.l}</Badge>
                        <Avatar s={t.assigneeInitials ?? "?"} size={24} />
                      </div>
                      <div style={{ fontSize:12, fontWeight:700, color:"var(--text-primary)", marginBottom:7, lineHeight:1.4 }}>{t.title}</div>
                      <div style={{ fontSize:11, color:"var(--text-secondary)", marginBottom:10 }}>
                        {t.departmentName} · <span style={{ color:t.dueDate==="Today"?"var(--danger)":"var(--text-secondary)" }}>⏱ {t.dueDate}</span>
                      </div>
                      <div style={{ display:"flex", gap:6 }}>
                        <button onClick={() => advance(t)} style={{ flex:1, padding:"5px 7px", borderRadius:7, border:"1px solid var(--border-card)", background:"var(--bg-input)", color:"var(--text-secondary)", fontSize:11, cursor:"pointer" }}>{NL[t.status]}</button>
                        <button onClick={() => del(t.id)} style={{ padding:"5px 8px", borderRadius:7, border:"1px solid rgba(220,38,38,.3)", background:"var(--danger-bg)", color:"var(--danger)", fontSize:11, cursor:"pointer" }}>✕</button>
                      </div>
                    </div>
                  );
                })}
                <button onClick={() => openAdd(col.key)} style={{ padding:"9px", borderRadius:9, border:"1px dashed var(--border-card)", background:"transparent", color:"var(--text-muted)", fontSize:12, display:"flex", alignItems:"center", justifyContent:"center", gap:5, cursor:"pointer" }}>+ Add task</button>
              </div>
            );
          })}
        </div>
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
