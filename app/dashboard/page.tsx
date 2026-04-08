"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import CheckInGate from "@/components/CheckInGate";
import AppLayout from "@/components/Layout";
import { Card, Avatar, Sparkline, ProgressBar, Badge, formatMetricValue, useToast, ToastList } from "@/components/ui/shared";
import { priorityColor, priorityLabel } from "@/lib/types";
import type { Department, Metric } from "@/lib/types";
import type { RevenueEntry, ExpenseEntry, Goal, Task } from "@/lib/types";
import { Cake, AlertCircle, Quote } from "lucide-react";
import { useCurrency } from "@/lib/CurrencyContext";
import { formatMoney, type Currency } from "@/lib/currency";
import type { Inspiration } from "@/lib/dailyInspiration";
import { curatedInspiration, attributionFor } from "@/lib/dailyInspiration";

interface BdayUser { userId: string; name: string; initials: string; daysUntil: number; turningAge?: number }
interface BdayResp { today: BdayUser[]; upcoming: BdayUser[]; recent: BdayUser[] }

const PR: Record<string,{l:string;bg:string;c:string}> = {
  urgent:{l:"Urgent",bg:"rgba(248,113,113,.15)",c:"#f87171"},
  high:  {l:"High",  bg:"rgba(251,191,36,.15)", c:"#fbbf24"},
  medium:{l:"Medium",bg:"rgba(91,142,248,.15)", c:"#5b8ef8"},
  low:   {l:"Low",   bg:"rgba(52,211,153,.15)", c:"#34d399"},
};

export default function DashboardPage() {
  const { data: session } = useSession();
  const { currency: globalCurrency, convert } = useCurrency();

  const [depts,   setDepts]   = useState<Department[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [tasks,   setTasks]   = useState<Task[]>([]);
  const [goals,   setGoals]   = useState<Goal[]>([]);
  const [rev,     setRev]     = useState<RevenueEntry[]>([]);
  const [exp,     setExp]     = useState<ExpenseEntry[]>([]);
  const [ciStatus,setCiStatus]= useState<{missing:string[];rate:number}>({missing:[],rate:0});
  const [bdays, setBdays]     = useState<BdayResp>({ today:[], upcoming:[], recent:[] });
  const [loading, setLoading] = useState(true);
  // Start from the curated pick so the first paint has something nice, then
  // upgrade to the live (possibly Claude-generated) version once it loads.
  const [inspiration, setInspiration] = useState<Inspiration>(() => curatedInspiration());
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

  // Fetch today's inspiration separately so a slow Claude call doesn't block
  // the rest of the dashboard from rendering.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/inspiration")
      .then(r => r.json())
      .then(d => { if (!cancelled && d?.data) setInspiration(d.data as Inspiration); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Filter today's birthdays through the localStorage "greeted" state so
  // anyone the admin has already acknowledged on /birthdays doesn't linger
  // in the dashboard banner. Actual greeting happens on /birthdays — the
  // banner is a link, not an inline action.
  const year = new Date().getFullYear();
  const isGreeted = (uid: string) =>
    typeof window !== "undefined" && localStorage.getItem(`bday_greeted_${uid}_${year}`) === "1";
  const unreviewedBdays = bdays.today.filter(u => !isGreeted(u.userId));

  const today    = new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"});

  // Totals follow the global currency. Each entry is converted from its own
  // stored currency to the display currency so flipping the header switcher
  // updates these numbers in real time.
  const tRev = rev.reduce((a, r) => a + convert(r.amount, ((r as { currency?: string }).currency as Currency) || "USD", globalCurrency), 0);
  const tExp = exp.reduce((a, e) => a + convert(e.amount, ((e as { currency?: string }).currency as Currency) || "USD", globalCurrency), 0);
  const activeTasks = tasks.filter(t=>t.status!=="done").length;

  // Friendly first-name for the welcome message.
  const firstName = (session?.user?.name ?? "").split(" ")[0] || "there";

  const KPIS = [
    { label:"Total Revenue",  value: tRev, prev: tRev * 0.92, format:"currency" as const, color:"#34d399", spark:[65,70,62,78,74,82,88,91,94,100] },
    { label:"Total Expenses", value: tExp, prev: tExp * 1.04, format:"currency" as const, color:"#f87171", spark:[80,75,72,68,74,70,65,62,58,55] },
    { label:"Active Tasks",   value: activeTasks, prev: activeTasks + 3, format:"number" as const, color:"#a78bfa", spark:[50,60,55,70,65,80,75,90,100,activeTasks] },
    { label:"Check-In Rate",  value: ciStatus.rate, prev: Math.max(0, ciStatus.rate - 10), format:"percent" as const, color:"#5b8ef8", spark:[70,72,68,75,78,74,80,83,85,ciStatus.rate] },
  ];

  const renderKpiValue = (k: typeof KPIS[number]) => {
    if (k.format === "currency") return formatMoney(k.value, globalCurrency);
    if (k.format === "percent") return `${Math.round(k.value)}%`;
    return formatMetricValue(k.value, "count");
  };

  const Sk=()=><div className="skeleton" style={{height:96,borderRadius:14}}/>;

  return (
    <CheckInGate>
      <AppLayout title="Dashboard">
        <ToastList ts={ts}/>

        {/* Styled-jsx global so the bouncing emoji keyframes don't leak.
            Kept inline here so the dashboard page is self-contained. */}
        <style jsx global>{`
          @keyframes hubBounce {
            0%, 100% { transform: translateY(0) rotate(-4deg); }
            50%      { transform: translateY(-8px) rotate(6deg); }
          }
          @keyframes hubFadeIn {
            from { opacity: 0; transform: translateY(6px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          .hub-hero-emoji {
            display: inline-block;
            animation: hubBounce 2.4s ease-in-out infinite;
            transform-origin: 50% 80%;
          }
          .hub-hero-inner { animation: hubFadeIn .5s ease-out both; }
        `}</style>

        {/* ── Welcome hero ───────────────────────────── */}
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            borderRadius: 16,
            padding: "22px 26px",
            marginBottom: 14,
            background: "linear-gradient(135deg, rgba(91,142,248,.18) 0%, rgba(167,139,250,.16) 45%, rgba(52,211,153,.14) 100%)",
            border: "1px solid rgba(91,142,248,.28)",
          }}
        >
          {/* decorative blurred blob */}
          <div aria-hidden style={{ position: "absolute", right: -60, top: -60, width: 220, height: 220, borderRadius: "50%", background: "radial-gradient(circle, rgba(167,139,250,.35), transparent 70%)", filter: "blur(2px)", pointerEvents: "none" }} />
          <div className="hub-hero-inner" style={{ position: "relative", display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
            <div
              aria-label={inspiration.emojiLabel}
              role="img"
              className="hub-hero-emoji"
              style={{ fontSize: 54, lineHeight: 1, flexShrink: 0 }}
            >
              {inspiration.emoji}
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", letterSpacing: ".12em", textTransform: "uppercase", marginBottom: 4 }}>
                {today}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em", marginBottom: 8 }}>
                {inspiration.greeting}, {firstName} 👋
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, maxWidth: 680 }}>
                <Quote size={14} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 3 }} />
                <div>
                  <div style={{ fontSize: 13, fontStyle: "italic", color: "var(--text-primary)", lineHeight: 1.55 }}>
                    “{inspiration.quote}”
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 3 }}>
                    a friendly reminder from <strong style={{ color: "var(--text-primary)" }}>{attributionFor(inspiration)}</strong>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ textAlign: "right", fontSize: 11, color: "var(--text-secondary)", flexShrink: 0 }}>
              <div>Check-ins</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: ciStatus.rate>=80?"var(--success)":ciStatus.rate>=50?"var(--warning)":"var(--danger)", letterSpacing: "-0.03em" }}>
                {ciStatus.rate}%
              </div>
            </div>
          </div>
        </div>

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
                  <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                    Tap to view and greet · won&apos;t dismiss until marked as greeted
                  </div>
                </div>
                <span style={{ padding: "8px 16px", borderRadius: 8, background: "var(--accent)", color: "#fff", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                  View →
                </span>
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

        {/* KPI cards */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12,marginBottom:16}}>
          {loading?[0,1,2,3].map(i=><Sk key={i}/>):KPIS.map((k,i)=>{
            const delta = k.prev > 0 ? Math.round(((k.value - k.prev) / k.prev) * 100) : 0;
            const positive = (k.label === "Total Expenses") ? delta <= 0 : delta >= 0;
            return (
              <div
                key={i}
                className="hub-card"
                style={{
                  position: "relative",
                  padding: 18,
                  overflow: "hidden",
                  borderTop: `3px solid ${k.color}`,
                }}
              >
                <div aria-hidden style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 100% 0%, ${k.color}14, transparent 60%)`, pointerEvents: "none" }} />
                <div style={{ position: "relative", display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12 }}>
                  <span style={{fontSize:11,fontWeight:700,color:"var(--text-secondary)",textTransform:"uppercase",letterSpacing:".06em"}}>{k.label}</span>
                  <div style={{width:32,height:32,borderRadius:9,background:`${k.color}22`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <div style={{width:10,height:10,borderRadius:3,background:k.color}}/>
                  </div>
                </div>
                <div style={{ position: "relative", display:"flex",alignItems:"flex-end",justifyContent:"space-between", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{fontSize:26,fontWeight:800,color:"var(--text-primary)",letterSpacing:"-0.03em",lineHeight:1}}>
                      {renderKpiValue(k)}
                    </div>
                    <div style={{fontSize:11,marginTop:6,display:"flex",alignItems:"center",gap:6}}>
                      <span style={{ padding: "1px 7px", borderRadius: 5, fontWeight: 800, fontSize: 10, background: positive ? "rgba(52,211,153,.18)" : "rgba(248,113,113,.18)", color: positive ? "var(--success)" : "var(--danger)" }}>
                        {positive ? "▲" : "▼"} {Math.abs(delta)}%
                      </span>
                      <span style={{ color:"var(--text-muted)" }}>vs prev</span>
                    </div>
                  </div>
                  <Sparkline data={k.spark} color={k.color}/>
                </div>
              </div>
            );
          })}
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
                  <div key={d.id} className="hub-card" style={{padding:"14px 16px",borderLeft:`3px solid ${d.color}`}}>
                    <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:10}}>
                      <span style={{fontSize:18}}>{d.icon}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:800,color:"var(--text-primary)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.name}</div>
                      </div>
                      <span style={{padding:"2px 8px",borderRadius:6,fontSize:10,fontWeight:800,background:`${pc}18`,color:pc,flexShrink:0}}>
                        {priorityLabel(d.priorityScore)}
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
                  <span title={t.assigneeName || t.assigneeInitials || "Unassigned"} style={{ display: "inline-flex" }}>
                    <Avatar s={t.assigneeInitials??"?"} size={22}/>
                  </span>
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
