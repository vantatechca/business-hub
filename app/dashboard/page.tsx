"use client";
import { useState, useEffect } from "react";
import AppLayout from "@/components/Layout";
import { Card, Avatar, Sparkline, ProgressBar, Badge, formatValue, pctChange, getHealthColor, useToast, ToastList } from "@/components/ui/shared";
import type { Department, TeamMember, Task, Goal, RevenueEntry, ExpenseEntry } from "@/lib/types";

const PR: Record<string, { l: string; bg: string; c: string }> = {
  urgent: { l:"Urgent", bg:"rgba(248,113,113,.15)", c:"#f87171" },
  high:   { l:"High",   bg:"rgba(251,191,36,.15)",  c:"#fbbf24" },
  medium: { l:"Medium", bg:"rgba(91,142,248,.15)",  c:"#5b8ef8" },
  low:    { l:"Low",    bg:"rgba(52,211,153,.15)",  c:"#34d399" },
};

const TMMD = new Date().toISOString().slice(5, 10);

export default function DashboardPage() {
  const [depts, setDepts]   = useState<Department[]>([]);
  const [team, setTeam]     = useState<TeamMember[]>([]);
  const [tasks, setTasks]   = useState<Task[]>([]);
  const [goals, setGoals]   = useState<Goal[]>([]);
  const [rev, setRev]       = useState<RevenueEntry[]>([]);
  const [exp, setExp]       = useState<ExpenseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const { ts, toast } = useToast();

  useEffect(() => {
    Promise.all([
      fetch("/api/departments").then(r => r.json()),
      fetch("/api/team").then(r => r.json()),
      fetch("/api/tasks").then(r => r.json()),
      fetch("/api/goals").then(r => r.json()),
      fetch("/api/revenue").then(r => r.json()),
      fetch("/api/expenses").then(r => r.json()),
    ]).then(([d, t, tk, g, rv, ex]) => {
      setDepts(d.data ?? []);
      setTeam(t.data ?? []);
      setTasks(tk.data ?? []);
      setGoals(g.data ?? []);
      setRev(rv.data ?? []);
      setExp(ex.data ?? []);
      setLoading(false);
    });
  }, []);

  const today = new Date().toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric" });
  const ci = team.filter(m => m.checkedInToday).length;
  const tRev = rev.reduce((a, r) => a + r.amount, 0);
  const tExp = exp.reduce((a, e) => a + e.amount, 0);
  const activeTasks = tasks.filter(t => t.status !== "done").length;
  const bdayToday = team.filter(m => m.birthday?.slice(5) === TMMD);

  const KPIS = [
    { label:"Total Revenue",  value:tRev, prev:2614000, format:"currency" as const, color:"#34d399", spark:[65,70,62,78,74,82,88,91,94,100] },
    { label:"Total Expenses", value:tExp, prev:1310000, format:"currency" as const, color:"#f87171", spark:[80,75,72,68,74,70,65,62,58,55], inv:true },
    { label:"Active Tasks",   value:activeTasks, prev:12, format:"number" as const, color:"#a78bfa", spark:[50,60,55,70,65,80,75,85,90,100] },
    { label:"Team Members",   value:team.length, prev:9, format:"number" as const, color:"#5b8ef8", spark:[70,72,68,75,78,74,80,83,85,87] },
  ];

  // Monthly chart data
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const monthlyRev = MONTHS.map(m => rev.filter(r => r.month === m).reduce((a, r) => a + r.amount, 0));
  const monthlyExp = MONTHS.map(m => exp.filter(e => e.month === m).reduce((a, e) => a + e.amount, 0));
  const activeMonths = MONTHS.filter((_, i) => monthlyRev[i] > 0 || monthlyExp[i] > 0);

  const Sk = () => <div className="skeleton" style={{ height: 80, borderRadius: 12 }} />;

  return (
    <AppLayout title="Dashboard">
      <ToastList ts={ts} />

      {/* Birthday banner */}
      {bdayToday.length > 0 && (
        <div style={{ background:"linear-gradient(135deg,rgba(251,191,36,.12),rgba(248,113,113,.08))", border:"1px solid rgba(251,191,36,.3)", borderRadius:12, padding:"12px 16px", display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
          <span style={{ fontSize:22 }}>🎂</span>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:"var(--text-primary)" }}>
              Happy Birthday, {bdayToday.map(m => m.name).join(" & ")}! 🎉
            </div>
            <div style={{ fontSize:11, color:"var(--text-secondary)" }}>Don't forget to wish them well today.</div>
          </div>
        </div>
      )}

      {/* Status bar */}
      <div style={{ display:"flex", gap:12, alignItems:"center", fontSize:12, color:"var(--text-secondary)", marginBottom:16, flexWrap:"wrap" }}>
        <span>{today}</span>
        <span style={{ color:"var(--text-muted)" }}>/</span>
        <span>Check-ins: <strong style={{ color:"var(--success)" }}>{ci}/{team.length}</strong></span>
        <span style={{ color:"var(--text-muted)" }}>/</span>
        <span>Active tasks: <strong style={{ color:"var(--danger)" }}>{activeTasks}</strong></span>
        <span style={{ color:"var(--text-muted)" }}>/</span>
        <span>Departments: <strong style={{ color:"var(--accent)" }}>{depts.length}</strong></span>
      </div>

      {/* KPI Cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:14 }}>
        {loading ? [0,1,2,3].map(i => <Sk key={i} />) : KPIS.map((k, i) => {
          const { value, up } = pctChange(k.value, k.prev);
          const good = k.inv ? !up : up;
          return (
            <Card key={i}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                <span style={{ fontSize:11, fontWeight:600, color:"var(--text-secondary)" }}>{k.label}</span>
                <div style={{ width:28, height:28, borderRadius:8, background:`${k.color}1a`, display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <div style={{ width:9, height:9, borderRadius:2, background:k.color }} />
                </div>
              </div>
              <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between" }}>
                <div>
                  <div style={{ fontSize:20, fontWeight:800, color:"var(--text-primary)", letterSpacing:"-0.03em", lineHeight:1 }}>{formatValue(k.value, k.format)}</div>
                  <div style={{ display:"flex", alignItems:"center", gap:4, marginTop:5 }}>
                    <span style={{ fontSize:11, fontWeight:700, color: good ? "var(--success)" : "var(--danger)" }}>{up?"↑":"↓"} {value}%</span>
                    <span style={{ fontSize:11, color:"var(--text-muted)" }}>vs prev</span>
                  </div>
                </div>
                <Sparkline data={k.spark} color={k.color} />
              </div>
            </Card>
          );
        })}
      </div>

      {/* Chart + Health */}
      <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:12, marginBottom:14 }}>
        <Card>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <div>
              <div style={{ fontSize:13, fontWeight:800, color:"var(--text-primary)" }}>Revenue vs Expenses</div>
              <div style={{ fontSize:11, color:"var(--text-secondary)" }}>By month · USD</div>
            </div>
            <div style={{ display:"flex", gap:12 }}>
              {[["Revenue","var(--success)"],["Expenses","var(--danger)"]].map(([l,c]) => (
                <div key={l} style={{ display:"flex", alignItems:"center", gap:5 }}>
                  <div style={{ width:9, height:9, borderRadius:2, background:c }} />
                  <span style={{ fontSize:11, color:"var(--text-secondary)" }}>{l}</span>
                </div>
              ))}
            </div>
          </div>
          {activeMonths.length === 0 ? (
            <div style={{ height:120, display:"flex", alignItems:"center", justifyContent:"center", color:"var(--text-muted)", fontSize:12 }}>No data yet</div>
          ) : (
            <svg width="100%" viewBox="0 0 520 120" preserveAspectRatio="xMidYMid meet" style={{ display:"block" }}>
              {activeMonths.map((m, i) => {
                const ri = MONTHS.indexOf(m);
                const rv = monthlyRev[ri], ev = monthlyExp[ri];
                const maxV = Math.max(...monthlyRev, ...monthlyExp, 1);
                const cw = 520 / activeMonths.length;
                const cx = i * cw + cw / 2;
                const bw = Math.min(28, cw * 0.35);
                return (
                  <g key={m}>
                    {rv > 0 && <rect x={cx-bw-1} y={110-Math.round(rv/maxV*100)} width={bw} height={Math.round(rv/maxV*100)} fill="var(--success)" rx={3} opacity=".85"/>}
                    {ev > 0 && <rect x={cx+1} y={110-Math.round(ev/maxV*100)} width={bw} height={Math.round(ev/maxV*100)} fill="var(--danger)" rx={3} opacity=".85"/>}
                    <text x={cx} y={118} textAnchor="middle" fontSize={9} fill="var(--text-secondary)" fontFamily="inherit">{m}</text>
                  </g>
                );
              })}
            </svg>
          )}
        </Card>
        <Card>
          <div style={{ fontSize:13, fontWeight:800, color:"var(--text-primary)", marginBottom:12 }}>Dept Health</div>
          <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
            {depts.slice(0, 7).map(d => (
              <div key={d.id} style={{ display:"flex", alignItems:"center", gap:8 }}>
                <div style={{ fontSize:12, color:"var(--text-primary)", width:86, flexShrink:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{d.name}</div>
                <ProgressBar value={d.health} color={getHealthColor(d.health)} height={5} />
                <div style={{ fontSize:10, fontWeight:700, color:getHealthColor(d.health), width:28, textAlign:"right" }}>{d.health}%</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Tasks + Goals */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Card>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <div style={{ fontSize:13, fontWeight:800, color:"var(--text-primary)" }}>Priority Tasks</div>
            <a href="/tasks" style={{ fontSize:11, color:"var(--accent)" }}>View all →</a>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
            {tasks.filter(t => t.status !== "done").slice(0, 5).map(t => {
              const pr = PR[t.priority];
              return (
                <div key={t.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 10px", borderRadius:8, background:"var(--bg-input)" }}>
                  <Badge bg={pr.bg} color={pr.c}>{pr.l}</Badge>
                  <div style={{ flex:1, fontSize:12, color:"var(--text-primary)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.title}</div>
                  <span style={{ fontSize:11, color:t.dueDate==="Today"?"var(--danger)":"var(--text-secondary)", flexShrink:0 }}>{t.dueDate}</span>
                  <Avatar s={t.assigneeInitials ?? "?"} size={22} />
                </div>
              );
            })}
            {tasks.filter(t => t.status !== "done").length === 0 && (
              <div style={{ textAlign:"center", padding:"16px 0", fontSize:12, color:"var(--text-secondary)" }}>🎉 All tasks done!</div>
            )}
          </div>
        </Card>
        <Card>
          <div style={{ fontSize:13, fontWeight:800, color:"var(--text-primary)", marginBottom:12 }}>Goals Progress</div>
          <div style={{ display:"flex", flexDirection:"column", gap:11 }}>
            {goals.slice(0, 5).map(g => {
              const p = Math.min(100, (g.current / Math.max(g.target, 1)) * 100);
              return (
                <div key={g.id}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                    <span style={{ fontSize:12, color:"var(--text-primary)" }}>{g.name}</span>
                    <span style={{ fontSize:11, fontWeight:700, color:g.color }}>{Math.round(p)}%</span>
                  </div>
                  <ProgressBar value={p} color={g.color} height={5} />
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
