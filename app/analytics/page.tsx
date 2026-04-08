"use client";
import { useState, useEffect } from "react";
import AppLayout from "@/components/Layout";
import { Card, ProgressBar, Sparkline, formatValue, healthColor } from "@/components/ui/shared";
import type { Department, TeamMember, Task, RevenueEntry, ExpenseEntry } from "@/lib/types";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function AnalyticsPage() {
  const [depts, setDepts]   = useState<Department[]>([]);
  const [team, setTeam]     = useState<TeamMember[]>([]);
  const [tasks, setTasks]   = useState<Task[]>([]);
  const [rev, setRev]       = useState<RevenueEntry[]>([]);
  const [exp, setExp]       = useState<ExpenseEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/departments").then(r => r.json()),
      fetch("/api/team").then(r => r.json()),
      fetch("/api/tasks").then(r => r.json()),
      fetch("/api/revenue").then(r => r.json()),
      fetch("/api/expenses").then(r => r.json()),
    ]).then(([d,t,tk,rv,ex]) => {
      setDepts(d.data??[]); setTeam(t.data??[]); setTasks(tk.data??[]);
      setRev(rv.data??[]); setExp(ex.data??[]); setLoading(false);
    });
  }, []);

  const tRev  = rev.reduce((a,r)=>a+r.amount,0);
  const tExp  = exp.reduce((a,e)=>a+e.amount,0);
  const net   = tRev - tExp;
  const margin = Math.round(net / Math.max(tRev,1) * 100);
  const avgH  = depts.length ? Math.round(depts.reduce((a,d)=>a+(d.health??0),0)/depts.length) : 0;
  const done  = tasks.filter(t=>t.status==="done").length;
  const ciRate = team.length ? Math.round(team.filter(m=>m.checkedInToday).length/team.length*100) : 0;

  // Monthly
  const byMonth = MONTHS.map(m => ({
    m,
    r: rev.filter(e=>e.month===m).reduce((a,e)=>a+e.amount,0),
    e: exp.filter(e=>e.month===m).reduce((a,e)=>a+e.amount,0),
  })).filter(d => d.r>0 || d.e>0);

  const maxM = Math.max(...byMonth.map(d=>Math.max(d.r,d.e)),1);
  const cw = byMonth.length ? 540/byMonth.length : 0;

  // Dept by most members
  const sortedDepts = [...depts].sort((a,b) => (b.health??0) - (a.health??0));

  // Task distribution
  const tStatus = [
    { l:"To Do",       v:tasks.filter(t=>t.status==="todo").length,        c:"var(--text-secondary)" },
    { l:"In Progress", v:tasks.filter(t=>t.status==="in-progress").length, c:"var(--accent)" },
    { l:"Done",        v:done,                                             c:"var(--success)" },
  ];

  const Sk = ({ h=80 }:{h?:number}) => <div className="skeleton" style={{ height:h, borderRadius:12 }} />;

  return (
    <AppLayout title="Analytics">
      {/* Top KPIs */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:14 }}>
        {loading ? [0,1,2,3].map(i=><Sk key={i}/>) : [
          { l:"Net Revenue",    v:formatValue(net,"currency"),  c:"var(--success)", spark:[60,55,65,70,68,80,75,85,90,100] },
          { l:"Profit Margin",  v:`${margin}%`,                 c:"var(--accent)",  spark:[40,45,42,50,55,58,60,65,68,70] },
          { l:"Dept Avg Health",v:`${avgH}%`,                   c:"var(--warning)", spark:[75,72,78,80,76,82,84,80,83,85] },
          { l:"Check-In Rate",  v:`${ciRate}%`,                 c:"var(--violet)",  spark:[60,65,62,70,72,68,75,78,80,ciRate] },
        ].map((s,i) => (
          <Card key={i}>
            <div style={{ fontSize:11, fontWeight:600, color:"var(--text-secondary)", marginBottom:8 }}>{s.l}</div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end" }}>
              <div style={{ fontSize:22, fontWeight:800, letterSpacing:"-0.03em", color:s.c }}>{s.v}</div>
              <Sparkline data={s.spark} color={s.c} />
            </div>
          </Card>
        ))}
      </div>

      {/* Charts row */}
      <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:12, marginBottom:14 }}>
        <Card>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <div><div style={{ fontSize:13, fontWeight:800, color:"var(--text-primary)" }}>Revenue vs Expenses</div><div style={{ fontSize:11, color:"var(--text-secondary)" }}>Monthly comparison · USD</div></div>
            <div style={{ display:"flex", gap:12 }}>
              {[["Revenue","var(--success)"],["Expenses","var(--danger)"]].map(([l,c])=>(
                <div key={l} style={{ display:"flex", alignItems:"center", gap:5 }}><div style={{ width:9, height:9, borderRadius:2, background:c }}/><span style={{ fontSize:11, color:"var(--text-secondary)" }}>{l}</span></div>
              ))}
            </div>
          </div>
          {loading ? <Sk h={130}/> : byMonth.length===0 ? (
            <div style={{ height:120, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, color:"var(--text-muted)" }}>No data yet — add revenue and expense entries.</div>
          ) : (
            <svg width="100%" viewBox="0 0 540 120" preserveAspectRatio="xMidYMid meet" style={{ display:"block" }}>
              {byMonth.map((d,i)=>{
                const cx=i*cw+cw/2, bw=Math.min(26,cw*0.34);
                const rh=Math.max(2,Math.round(d.r/maxM*100)), eh=Math.max(2,Math.round(d.e/maxM*100));
                return <g key={d.m}><rect x={cx-bw-1} y={110-rh} width={bw} height={rh} fill="var(--success)" rx={3} opacity=".85"/><rect x={cx+1} y={110-eh} width={bw} height={eh} fill="var(--danger)" rx={3} opacity=".85"/><text x={cx} y={118} textAnchor="middle" fontSize={9} fill="var(--text-secondary)" fontFamily="inherit">{d.m}</text></g>;
              })}
            </svg>
          )}
        </Card>

        <Card>
          <div style={{ fontSize:13, fontWeight:800, color:"var(--text-primary)", marginBottom:14 }}>Task Distribution</div>
          {loading ? <Sk h={100}/> : (
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {tStatus.map(s => (
                <div key={s.l}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                    <span style={{ fontSize:12, color:"var(--text-primary)" }}>{s.l}</span>
                    <span style={{ fontSize:12, fontWeight:700, color:s.c }}>{s.v}</span>
                  </div>
                  <ProgressBar value={Math.round(s.v/Math.max(tasks.length,1)*100)} color={s.c} height={6} />
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop:16, paddingTop:14, borderTop:"1px solid var(--border-divider)" }}>
            <div style={{ fontSize:11, color:"var(--text-secondary)", marginBottom:4 }}>Total tasks</div>
            <div style={{ fontSize:22, fontWeight:800, color:"var(--text-primary)" }}>{tasks.length}</div>
          </div>
        </Card>
      </div>

      {/* Bottom row */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Card>
          <div style={{ fontSize:13, fontWeight:800, color:"var(--text-primary)", marginBottom:14 }}>Department Health Rankings</div>
          {loading ? <Sk h={200}/> : (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {sortedDepts.map((d,i) => (
                <div key={d.id} style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ fontSize:11, color:"var(--text-muted)", width:16, textAlign:"right", flexShrink:0 }}>#{i+1}</div>
                  <div style={{ fontSize:12, color:"var(--text-primary)", width:100, flexShrink:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{d.name}</div>
                  <ProgressBar value={d.health ?? 0} color={healthColor(d.health ?? 0)} height={6} />
                  <div style={{ fontSize:11, fontWeight:700, color:healthColor(d.health ?? 0), width:32, textAlign:"right", flexShrink:0 }}>{d.health ?? 0}%</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div style={{ fontSize:13, fontWeight:800, color:"var(--text-primary)", marginBottom:14 }}>Revenue by Department</div>
          {loading ? <Sk h={200}/> : (() => {
            const byDept = depts.map(d => ({
              name: d.name,
              total: rev.filter(r => r.departmentName===d.name).reduce((a,r)=>a+r.amount,0),
              color: d.color,
            })).filter(d => d.total > 0).sort((a,b) => b.total - a.total);
            const maxD = Math.max(...byDept.map(d=>d.total),1);
            return byDept.length === 0 ? (
              <div style={{ textAlign:"center", padding:"32px 0", fontSize:12, color:"var(--text-muted)" }}>No revenue data yet</div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {byDept.map(d => (
                  <div key={d.name} style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ fontSize:12, color:"var(--text-primary)", width:100, flexShrink:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{d.name}</div>
                    <ProgressBar value={Math.round(d.total/maxD*100)} color={d.color} height={6} />
                    <div style={{ fontSize:11, fontWeight:700, color:d.color, width:52, textAlign:"right", flexShrink:0 }}>{formatValue(d.total,"currency")}</div>
                  </div>
                ))}
              </div>
            );
          })()}
        </Card>
      </div>
    </AppLayout>
  );
}
