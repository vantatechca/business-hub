"use client";
import { useState, useEffect } from "react";
import AppLayout from "@/components/Layout";
import { Avatar, Card, useToast, ToastList } from "@/components/ui/shared";
import type { TeamMember } from "@/lib/types";

const MOODS = [
  { emoji:"😊", label:"Great",    color:"#34d399" },
  { emoji:"😌", label:"Good",     color:"#5b8ef8" },
  { emoji:"😐", label:"Okay",     color:"#fbbf24" },
  { emoji:"😴", label:"Tired",    color:"#a78bfa" },
  { emoji:"😰", label:"Stressed", color:"#f87171" },
];
const STEPS = ["Start","Mood","Wins","Blockers","Done"];

export default function CheckInPage() {
  const [team, setTeam]     = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFlow, setShowFlow] = useState(false);
  const [step, setStep]     = useState(0);
  const [mood, setMood]     = useState<typeof MOODS[0] | null>(null);
  const [wins, setWins]     = useState("");
  const [blockers, setBlockers] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { ts, toast } = useToast();

  const load = () => fetch("/api/team").then(r => r.json()).then(d => { setTeam(d.data ?? []); setLoading(false); });
  useEffect(() => { load(); }, []);

  const ci = team.filter(m => m.checkedInToday).length;
  const rate = Math.round(ci / Math.max(team.length, 1) * 100);

  const toggleCI = async (m: TeamMember) => {
    await fetch(`/api/team/${m.id}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ checkedInToday:!m.checkedInToday }) });
    setTeam(p => p.map(x => x.id===m.id ? { ...x, checkedInToday:!x.checkedInToday } : x));
    toast(m.checkedInToday ? "Check-in removed" : "Checked in ✓");
  };

  const openFlow = () => { setStep(0); setMood(null); setWins(""); setBlockers(""); setSubmitting(false); setShowFlow(true); };
  const closeFlow = () => setShowFlow(false);

  const submit = async () => {
    setSubmitting(true);
    await fetch("/api/checkin", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ memberId:1, mood:mood?.label, moodEmoji:mood?.emoji, wins, blockers }) });
    setStep(4);
    toast("Check-in recorded! 🎉");
    setTimeout(() => { setShowFlow(false); setStep(0); setSubmitting(false); }, 2200);
  };

  // ── Stepper UI ─────────────────────────────────────────────
  const Stepper = () => (
    <div style={{ display:"flex", alignItems:"center", marginBottom:22 }}>
      {STEPS.map((s, i) => (
        <div key={s} style={{ display:"flex", alignItems:"center", flex: i < STEPS.length-1 ? 1 : undefined }}>
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
            <div className={`step-circle ${i<step?"done":i===step?"active":"pending"}`}>{i<step?"✓":i+1}</div>
            <span style={{ fontSize:9, fontWeight:700, whiteSpace:"nowrap", color:i===step?"var(--accent)":"var(--text-muted)" }}>{s}</span>
          </div>
          {i < STEPS.length-1 && <div className="step-connector" style={{ background:i<step?"var(--accent)":"var(--border-divider)" }} />}
        </div>
      ))}
    </div>
  );

  const NextBtn = ({ onClick, label="Next →", disabled=false }: { onClick:()=>void; label?:string; disabled?:boolean }) => (
    <button onClick={onClick} disabled={disabled} style={{ padding:"8px 22px", borderRadius:8, background:"var(--accent)", color:"#fff", border:"none", fontSize:13, fontWeight:700, cursor:"pointer", opacity:disabled?.5:1 }}>{label}</button>
  );
  const BackBtn = ({ onClick }: { onClick:()=>void }) => (
    <button onClick={onClick} style={{ padding:"8px 14px", borderRadius:8, border:"1px solid var(--border-card)", background:"var(--bg-input)", color:"var(--text-primary)", fontSize:13, fontWeight:600, cursor:"pointer" }}>← Back</button>
  );

  const overlay = showFlow ? (
    <div style={{ position:"fixed", inset:0, background:"var(--bg-overlay)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:500 }} onClick={e => { if(e.target===e.currentTarget && step!==4) closeFlow(); }}>
      <div style={{ background:"var(--bg-card)", border:"1px solid var(--border-card)", borderRadius:20, width:520, maxWidth:"95vw", maxHeight:"90vh", overflowY:"auto", padding:"24px 28px", animation:"scalePop .25s ease" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <div style={{ fontSize:14, fontWeight:800, color:"var(--text-primary)" }}>Daily Check-In</div>
          {step !== 4 && <button onClick={closeFlow} style={{ background:"transparent", border:"none", fontSize:20, color:"var(--text-secondary)", cursor:"pointer", lineHeight:1 }}>×</button>}
        </div>
        <Stepper />

        {step===0 && (
          <div style={{ textAlign:"center", padding:"16px 0" }} className="animate-fade-up">
            <div style={{ fontSize:48, marginBottom:12 }}>👋</div>
            <div style={{ fontSize:18, fontWeight:800, color:"var(--text-primary)", marginBottom:6 }}>Good to see you, Andrei!</div>
            <div style={{ fontSize:12, color:"var(--text-secondary)", marginBottom:8 }}>{new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}</div>
            <div style={{ fontSize:12, color:"var(--text-secondary)", marginBottom:24 }}>Your daily check-in takes 2 minutes and keeps the team aligned.</div>
            <NextBtn onClick={() => setStep(1)} label="Start Check-In →" />
          </div>
        )}

        {step===1 && (
          <div className="animate-fade-up">
            <div style={{ fontSize:15, fontWeight:800, color:"var(--text-primary)", marginBottom:4 }}>How are you feeling today?</div>
            <div style={{ fontSize:12, color:"var(--text-secondary)", marginBottom:16 }}>Be honest — this helps the team understand your capacity.</div>
            <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:16 }}>
              {MOODS.map(m => (
                <button key={m.label} onClick={() => setMood(m)} style={{ display:"flex", alignItems:"center", gap:14, padding:"11px 14px", borderRadius:10, textAlign:"left", fontSize:13, border:`2px solid ${mood?.label===m.label?m.color:"var(--border-card)"}`, background:mood?.label===m.label?`${m.color}10`:"var(--bg-input)", color:mood?.label===m.label?m.color:"var(--text-primary)", cursor:"pointer", transition:"all .15s" }}>
                  <span style={{ fontSize:22 }}>{m.emoji}</span><span style={{ fontWeight:600 }}>{m.label}</span>
                  {mood?.label===m.label && <span style={{ marginLeft:"auto" }}>✓</span>}
                </button>
              ))}
            </div>
            <div style={{ display:"flex", gap:9, justifyContent:"flex-end" }}><BackBtn onClick={() => setStep(0)}/><NextBtn onClick={() => setStep(2)} disabled={!mood}/></div>
          </div>
        )}

        {step===2 && (
          <div className="animate-fade-up">
            <div style={{ fontSize:15, fontWeight:800, color:"var(--text-primary)", marginBottom:4 }}>What did you accomplish?</div>
            <div style={{ fontSize:12, color:"var(--text-secondary)", marginBottom:14 }}>Share your wins — big or small.</div>
            <textarea value={wins} onChange={e => setWins(e.target.value)} rows={6} placeholder={"• Closed the Q4 enterprise deal\n• Reviewed team performance\n• Had productive 1:1s"} style={{ width:"100%", background:"var(--bg-input)", border:"1px solid var(--border-card)", borderRadius:10, padding:"12px 14px", fontSize:13, color:"var(--text-primary)", outline:"none", resize:"vertical", fontFamily:"inherit", lineHeight:1.6, marginBottom:14 }} />
            <div style={{ display:"flex", gap:9, justifyContent:"flex-end" }}><BackBtn onClick={() => setStep(1)}/><NextBtn onClick={() => setStep(3)}/></div>
          </div>
        )}

        {step===3 && (
          <div className="animate-fade-up">
            <div style={{ fontSize:15, fontWeight:800, color:"var(--text-primary)", marginBottom:4 }}>Any blockers or challenges?</div>
            <div style={{ fontSize:12, color:"var(--text-secondary)", marginBottom:14 }}>What's slowing you down?</div>
            <textarea value={blockers} onChange={e => setBlockers(e.target.value)} rows={4} placeholder={"e.g. Waiting on legal review\nNeed access to analytics…"} style={{ width:"100%", background:"var(--bg-input)", border:"1px solid var(--border-card)", borderRadius:10, padding:"12px 14px", fontSize:13, color:"var(--text-primary)", outline:"none", resize:"vertical", fontFamily:"inherit", lineHeight:1.6, marginBottom:14 }} />
            <div style={{ padding:"13px 16px", borderRadius:10, background:"var(--bg-input)", border:"1px solid var(--border-card)", marginBottom:16 }}>
              <div style={{ fontSize:10, fontWeight:800, color:"var(--text-secondary)", letterSpacing:".07em", marginBottom:8 }}>SUMMARY</div>
              <div style={{ fontSize:12, color:"var(--text-primary)", marginBottom:4 }}>Mood: <strong style={{ color:"var(--accent)" }}>{mood?.emoji} {mood?.label}</strong></div>
              <div style={{ fontSize:12, color:"var(--text-primary)" }}>Wins: <span style={{ color:"var(--text-secondary)" }}>{wins ? wins.slice(0,70)+(wins.length>70?"…":"") : "(none)"}</span></div>
            </div>
            <div style={{ display:"flex", gap:9, justifyContent:"flex-end" }}><BackBtn onClick={() => setStep(2)}/><NextBtn onClick={submit} label="Submit Check-In ✓" disabled={submitting}/></div>
          </div>
        )}

        {step===4 && (
          <div style={{ textAlign:"center", padding:"20px 0" }} className="animate-scale-pop">
            <div style={{ fontSize:56, marginBottom:12 }}>🎉</div>
            <div style={{ fontSize:18, fontWeight:800, color:"var(--success)", marginBottom:6 }}>Check-in complete!</div>
            <div style={{ fontSize:12, color:"var(--text-secondary)" }}>Your daily check-in has been recorded. Closing…</div>
          </div>
        )}
      </div>
    </div>
  ) : null;

  return (
    <AppLayout title="Check-Ins" onNew={openFlow} newLabel="My Check-In">
      <ToastList ts={ts} />
      {overlay}

      {/* Stats */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:14 }}>
        {[
          { l:"Check-In Rate",  v:`${rate}%`,             s:`${ci} of ${team.length} members`, c:"var(--success)" },
          { l:"Pending",        v:String(team.length-ci),  s:"Not yet checked in",              c:"var(--warning)" },
          { l:"Streak",         v:"18 days",              s:"Consecutive days 70%+",            c:"var(--accent)"  },
        ].map((s,i) => (
          <Card key={i}>
            <div style={{ fontSize:11, fontWeight:700, color:"var(--text-secondary)", marginBottom:6 }}>{s.l}</div>
            <div style={{ fontSize:26, fontWeight:800, letterSpacing:"-0.02em", color:s.c }}>{s.v}</div>
            <div style={{ fontSize:11, color:"var(--text-secondary)", marginTop:4 }}>{s.s}</div>
          </Card>
        ))}
      </div>

      {/* Team table */}
      {loading ? (
        <div className="skeleton" style={{ height:300, borderRadius:12 }} />
      ) : (
        <div className="hub-card" style={{ padding:0, overflow:"hidden" }}>
          <table className="hub-table">
            <thead><tr>{["Member","Department","Status","Check-In"].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {team.map(m => (
                <tr key={m.id}>
                  <td><div style={{ display:"flex", alignItems:"center", gap:9 }}><Avatar s={m.initials} size={30}/><div style={{ fontSize:12, fontWeight:600, color:"var(--text-primary)" }}>{m.name}</div></div></td>
                  <td style={{ fontSize:12, color:"var(--text-secondary)" }}>{m.departmentName}</td>
                  <td style={{ fontSize:12, color:"var(--text-secondary)", textTransform:"capitalize" }}>{m.status}</td>
                  <td>
                    <button onClick={() => toggleCI(m)} style={{ padding:"4px 14px", borderRadius:7, border:"none", cursor:"pointer", fontSize:11, fontWeight:700, background:m.checkedInToday?"var(--success-bg)":"var(--warning-bg)", color:m.checkedInToday?"var(--success)":"var(--warning)" }}>
                      {m.checkedInToday ? "✓ Checked In" : "Pending"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppLayout>
  );
}
