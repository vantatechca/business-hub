"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import CheckInGate from "@/components/CheckInGate";
import AppLayout from "@/components/Layout";
import { Card, Avatar, Sparkline, ProgressBar, Badge, formatMetricValue, useToast, ToastList } from "@/components/ui/shared";
import { priorityColor, priorityLabel } from "@/lib/types";
import type { Department, Metric } from "@/lib/types";
import type { RevenueEntry, ExpenseEntry, Goal, Task } from "@/lib/types";
import { Cake, AlertCircle } from "lucide-react";

interface BdayUser { userId: string; name: string; initials: string; daysUntil: number; turningAge?: number }
interface BdayResp { today: BdayUser[]; upcoming: BdayUser[]; recent: BdayUser[] }

const PR: Record<string,{l:string;bg:string;c:string}> = {
  urgent:{l:"Urgent",bg:"rgba(248,113,113,.15)",c:"#f87171"},
  high:  {l:"High",  bg:"rgba(251,191,36,.15)", c:"#fbbf24"},
  medium:{l:"Medium",bg:"rgba(91,142,248,.15)", c:"#5b8ef8"},
  low:   {l:"Low",   bg:"rgba(52,211,153,.15)", c:"#34d399"},
};

export default function DashboardPage() {
  const [depts,   setDepts]   = useState<Department[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [tasks,   setTasks]   = useState<Task[]>([]);
  const [goals,   setGoals]   = useState<Goal[]>([]);
  const [rev,     setRev]     = useState<RevenueEntry[]>([]);
  const [exp,     setExp]     = useState<ExpenseEntry[]>([]);
  const [ciStatus,setCiStatus]= useState<{missing:string[];rate:number}>({missing:[],rate:0});
  const [bdays, setBdays]     = useState<BdayResp>({ today:[], upcoming:[], recent:[] });
  const [loading, setLoading] = useState(true);
  const { ts } = useToast();

  useEffect(()=>{
    Promise.all([
      fetch("/api/departments").then(r=>r.json()),
      fetch("/api/metrics").then(r=>r.json()),
      fetch("/api/tasks").then(r=>r.json()),
      fetch("/api/goals").then(r=>r.json()),
      fetch("/api/revenue").then(r=>r.json()),
      fetch("/api/expenses").then(r=>r.json()),
      fetch("/api/checkin-status").then(r=>r.json()),
      fetch("/api/birthdays").then(r=>r.json()),
    ]).then(([d,m,t,g,rv,ex,ci,bd])=>{
      setDepts(d.data??[]); setMetrics(m.data??[]); setTasks(t.data??[]);
      setGoals(g.data??[]); setRev(rv.data??[]); setExp(ex.data??[]);
      setCiStatus({ missing: ci.missing??[], rate: ci.rate??0 });
      setBdays({ today: bd.today??[], upcoming: bd.upcoming??[], recent: bd.recent??[] });
      setLoading(false);
    });
  },[]);

  // Filter today's birthdays through localStorage "greeted" state
  const year = new Date().getFullYear();
  const [greetedTick, setGreetedTick] = useState(0); // re-render trigger
  const isGreeted = (uid: string) =>
    typeof window !== "undefined" && localStorage.getItem(`bday_greeted_${uid}_${year}`) === "1";
  void greetedTick;
  const unreviewedBdays = bdays.today.filter(u => !isGreeted(u.userId));
  const markGreeted = (uid: string) => {
    localStorage.setItem(`bday_greeted_${uid}_${year}`, "1");
    setGreetedTick(t => t + 1);
  };

  const today    = new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"});
  const tRev     = rev.reduce((a,r)=>a+r.amount,0);
  const tExp     = exp.reduce((a,e)=>a+e.amount,0);
  const activeTasks = tasks.filter(t=>t.status!=="done").length;

  const KPIS = [
    {label:"Total Revenue",  value:tRev,  prev:2614000, format:"currency" as const, color:"#34d399", spark:[65,70,62,78,74,82,88,91,94,100]},
    {label:"Total Expenses", value:tExp,  prev:1310000, format:"currency" as const, color:"#f87171", spark:[80,75,72,68,74,70,65,62,58,55]},
    {label:"Active Tasks",   value:activeTasks, prev:7, format:"number" as const, color:"#a78bfa", spark:[50,60,55,70,65,80,75,90,100,activeTasks]},
    {label:"Check-In Rate",  value:ciStatus.rate, prev:72, format:"percent" as const, color:"#5b8ef8", spark:[70,72,68,75,78,74,80,83,85,ciStatus.rate]},
  ];

  const Sk=()=><div className="skeleton" style={{height:80,borderRadius:12}}/>;

  return (
    <CheckInGate>
      <AppLayout title="Dashboard">
        <ToastList ts={ts}/>

        {/* Top alerts — birthdays + missing check-ins */}
        {(unreviewedBdays.length > 0 || ciStatus.missing.length > 0) && (
          <div style={{ display: "grid", gridTemplateColumns: unreviewedBdays.length > 0 && ciStatus.missing.length > 0 ? "1fr 1fr" : "1fr", gap: 12, marginBottom: 14 }}>
            {unreviewedBdays.length > 0 && (
              <Link
                href="/birthdays"
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "14px 18px", borderRadius: 12,
                  background: "linear-gradient(135deg, rgba(91,142,248,.12), rgba(167,139,250,.12))",
                  border: "1px solid rgba(91,142,248,.35)",
                  textDecoration: "none",
                  cursor: "pointer",
                }}
              >
                <div style={{ width: 42, height: 42, borderRadius: 11, background: "rgba(91,142,248,.22)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Cake size={20} color="var(--accent)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "var(--accent)", letterSpacing: ".05em", textTransform: "uppercase", marginBottom: 2 }}>
                    🎂 {unreviewedBdays.length} birthday{unreviewedBdays.length === 1 ? "" : "s"} today
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {unreviewedBdays.map(u => u.name).slice(0, 3).join(", ")}
                    {unreviewedBdays.length > 3 && <> +{unreviewedBdays.length - 3} more</>}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                    Tap to greet · won&apos;t dismiss until you mark them as greeted
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {unreviewedBdays.slice(0, 4).map(u => <Avatar key={u.userId} s={u.initials} size={30} />)}
                </div>
              </Link>
            )}
            {ciStatus.missing.length > 0 && (
              <div
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "14px 18px", borderRadius: 12,
                  background: "linear-gradient(135deg, rgba(248,113,113,.12), rgba(251,191,36,.12))",
                  border: "1px solid rgba(248,113,113,.35)",
                }}
              >
                <div style={{ width: 42, height: 42, borderRadius: 11, background: "rgba(248,113,113,.22)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <AlertCircle size={20} color="var(--danger)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "var(--danger)", letterSpacing: ".05em", textTransform: "uppercase", marginBottom: 2 }}>
                    {ciStatus.missing.length} missing check-in{ciStatus.missing.length === 1 ? "" : "s"}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {ciStatus.missing.slice(0, 3).join(", ")}{ciStatus.missing.length > 3 ? ` +${ciStatus.missing.length - 3}` : ""}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                    Check who hasn&apos;t submitted today&apos;s check-in
                  </div>
                </div>
                <Link
                  href="/checkin"
                  style={{ padding: "8px 16px", borderRadius: 8, background: "var(--danger)", color: "#fff", textDecoration: "none", fontSize: 12, fontWeight: 700, flexShrink: 0 }}
                >
                  View →
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Quick-greet buttons for today's birthdays (so users can dismiss right from the banner) */}
        {unreviewedBdays.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            {unreviewedBdays.map(u => (
              <button
                key={u.userId}
                onClick={() => markGreeted(u.userId)}
                style={{
                  padding: "5px 11px", borderRadius: 7,
                  border: "1px solid var(--border-card)",
                  background: "var(--bg-input)",
                  color: "var(--text-secondary)",
                  fontSize: 11, fontWeight: 600, cursor: "pointer",
                  display: "inline-flex", alignItems: "center", gap: 5,
                }}
              >
                ✓ Greeted {u.name}
              </button>
            ))}
          </div>
        )}

        {/* Status bar */}
        <div style={{display:"flex",gap:12,alignItems:"center",fontSize:11,color:"var(--text-secondary)",marginBottom:14,flexWrap:"wrap"}}>
          <span>{today}</span>
          <span style={{color:"var(--text-muted)"}}>/</span>
          <span>Check-ins: <strong style={{color:ciStatus.rate>=80?"var(--success)":ciStatus.rate>=50?"var(--warning)":"var(--danger)"}}>{ciStatus.rate}%</strong></span>
          {ciStatus.missing.length>0&&<>
            <span style={{color:"var(--text-muted)"}}>/</span>
            <span style={{color:"var(--danger)"}}>Missing: <strong>{ciStatus.missing.slice(0,3).join(", ")}{ciStatus.missing.length>3?` +${ciStatus.missing.length-3}`:""}</strong></span>
          </>}
          <span style={{color:"var(--text-muted)"}}>/</span>
          <span>Active tasks: <strong style={{color:"var(--danger)"}}>{activeTasks}</strong></span>
        </div>

        {/* KPI cards */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:11,marginBottom:14}}>
          {loading?[0,1,2,3].map(i=><Sk key={i}/>):KPIS.map((k,i)=>(
            <Card key={i}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <span style={{fontSize:11,fontWeight:600,color:"var(--text-secondary)"}}>{k.label}</span>
                <div style={{width:28,height:28,borderRadius:8,background:`${k.color}1a`,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{width:9,height:9,borderRadius:2,background:k.color}}/></div>
              </div>
              <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between"}}>
                <div>
                  <div style={{fontSize:20,fontWeight:800,color:"var(--text-primary)",letterSpacing:"-0.03em",lineHeight:1}}>{formatMetricValue(k.value, k.format === "currency" ? "USD" : k.format === "percent" ? "percent" : "count")}</div>
                  <div style={{fontSize:11,color:"var(--text-secondary)",marginTop:4}}>vs prev period</div>
                </div>
                <Sparkline data={k.spark} color={k.color}/>
              </div>
            </Card>
          ))}
        </div>

        {/* Priority asset grid — sorted by priority_score from DB */}
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:800,color:"var(--text-muted)",letterSpacing:".1em",marginBottom:10}}>PRIORITY ASSETS</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:10}}>
            {loading?[0,1,2,3,4,5].map(i=><Sk key={i}/>):
              depts.slice(0,6).map(d=>{
                const dMetrics=metrics.filter(m=>m.departmentId===d.id).slice(0,3);
                const pc=priorityColor(d.priorityScore);
                return(
                  <div key={d.id} className="hub-card" style={{padding:"13px 15px",borderLeft:`3px solid ${d.color}`}}>
                    <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:10}}>
                      <span style={{fontSize:18}}>{d.icon}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:800,color:"var(--text-primary)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.name}</div>
                      </div>
                      <span style={{padding:"2px 8px",borderRadius:6,fontSize:10,fontWeight:800,background:`${pc}18`,color:pc,flexShrink:0}}>
                        {d.priorityScore} · {priorityLabel(d.priorityScore)}
                      </span>
                    </div>
                    {dMetrics.map(m=>(
                      <div key={m.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderTop:"1px solid var(--border-divider)"}}>
                        <div style={{fontSize:11,color:"var(--text-secondary)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,paddingRight:8}}>{m.name}</div>
                        <div style={{fontSize:12,fontWeight:800,color:m.direction==="lower_better"&&m.currentValue>0?"var(--danger)":"var(--text-primary)",flexShrink:0}}>
                          {formatMetricValue(m.currentValue,m.unit)}
                        </div>
                      </div>
                    ))}
                    {dMetrics.length===0&&<div style={{fontSize:11,color:"var(--text-muted)",padding:"4px 0"}}>No metrics tracked yet</div>}
                  </div>
                );
              })
            }
          </div>
        </div>

        {/* Bottom: tasks + goals */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Card>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:11}}>
              <div style={{fontSize:13,fontWeight:800,color:"var(--text-primary)"}}>Priority Tasks</div>
              <a href="/tasks" style={{fontSize:11,color:"var(--accent)",textDecoration:"none"}}>View all →</a>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:7}}>
              {tasks.filter(t=>t.status!=="done").slice(0,5).map(t=>{const pr=PR[t.priority as string]??PR.medium;return(
                <div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:8,background:"var(--bg-input)"}}>
                  <Badge bg={pr.bg} color={pr.c}>{pr.l}</Badge>
                  <div style={{flex:1,fontSize:12,color:"var(--text-primary)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.title}</div>
                  <span style={{fontSize:11,color:t.dueDate==="Today"?"var(--danger)":"var(--text-secondary)",flexShrink:0}}>{t.dueDate}</span>
                  <Avatar s={t.assigneeInitials??"?"} size={22}/>
                </div>
              );})}
              {tasks.filter(t=>t.status!=="done").length===0&&<div style={{textAlign:"center",padding:"12px 0",fontSize:12,color:"var(--text-secondary)"}}>🎉 All tasks done!</div>}
            </div>
          </Card>
          <Card>
            <div style={{fontSize:13,fontWeight:800,color:"var(--text-primary)",marginBottom:11}}>Goals Progress</div>
            <div style={{display:"flex",flexDirection:"column",gap:11}}>
              {goals.slice(0,5).map(g=>{
                const p=Math.min(100,(g.current/Math.max(g.target??1,1))*100);
                return(
                  <div key={g.id}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <span style={{fontSize:12,color:"var(--text-primary)"}}>{g.name}</span>
                      <span style={{fontSize:11,fontWeight:700,color:g.color??""}}>{Math.round(p)}%</span>
                    </div>
                    <ProgressBar value={p} color={g.color??""} height={5}/>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </AppLayout>
    </CheckInGate>
  );
}
