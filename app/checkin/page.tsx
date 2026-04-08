"use client";
import { useState, useEffect } from "react";
import AppLayout from "@/components/Layout";
import CheckInModal from "@/components/CheckInModal";
import { Avatar, Card, useToast, ToastList } from "@/components/ui/shared";
import { useSession } from "next-auth/react";
import type { TeamMember } from "@/lib/types";

export default function CheckInPage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role ?? "member";
  const [team, setTeam]       = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [ciRate, setCiRate]   = useState(0);
  const [missing, setMissing] = useState<string[]>([]);
  const { ts, toast } = useToast();

  const loadData = () => Promise.all([
    fetch("/api/team").then(r => r.json()),
    fetch("/api/checkin-status").then(r => r.json()),
  ]).then(([t, ci]) => {
    setTeam(t.data ?? []);
    setCiRate(ci.rate ?? 0);
    setMissing(ci.missing ?? []);
    setLoading(false);
  });

  useEffect(() => { loadData(); }, []);

  const toggleCI = async (m: TeamMember) => {
    await fetch(`/api/team/${m.id}`, {
      method:"PATCH", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ checkedInToday: !m.checkedInToday }),
    });
    setTeam(p => p.map(x => String(x.id) === String(m.id) ? {...x, checkedInToday:!x.checkedInToday} : x));
    toast(m.checkedInToday ? "Check-in removed" : "Checked in ✓");
  };

  const SCOL: Record<string,string> = { active:"var(--success)", away:"var(--warning)", busy:"var(--danger)", offline:"var(--text-muted)" };

  return (
    <AppLayout title="Check-Ins" onNew={() => setShowModal(true)} newLabel="My Check-In">
      <ToastList ts={ts}/>

      {/* Stats */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:14}}>
        {[
          {l:"Check-In Rate", v:`${ciRate}%`, s:`${team.filter(m=>m.checkedInToday).length} of ${team.length} members`, c:ciRate>=80?"var(--success)":ciRate>=50?"var(--warning)":"var(--danger)"},
          {l:"Missing Today",  v:missing.length,  s: missing.length > 0 ? missing.slice(0,2).join(", ")+(missing.length>2?`+${missing.length-2}`:"") : "All checked in!", c:"var(--warning)"},
          {l:"Streak",         v:"18 days",        s:"Consecutive days 70%+", c:"var(--accent)"},
        ].map((s,i)=>(
          <Card key={i}>
            <div style={{fontSize:11,fontWeight:700,color:"var(--text-secondary)",marginBottom:5}}>{s.l}</div>
            <div style={{fontSize:26,fontWeight:800,letterSpacing:"-0.02em",color:s.c}}>{s.v}</div>
            <div style={{fontSize:11,color:"var(--text-secondary)",marginTop:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.s}</div>
          </Card>
        ))}
      </div>

      {/* Team table */}
      {loading ? (
        <div className="skeleton" style={{height:300,borderRadius:12}}/>
      ) : (
        <div className="hub-card" style={{padding:0,overflow:"hidden"}}>
          <table className="hub-table">
            <thead><tr>{["Member","Department","Role","Status","Check-In"].map(h=><th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {team.map(m=>(
                <tr key={m.id}>
                  <td><div style={{display:"flex",alignItems:"center",gap:9}}>
                    <Avatar s={m.initials} size={30}/>
                    <div style={{fontSize:12,fontWeight:700,color:"var(--text-primary)"}}>{m.name}</div>
                  </div></td>
                  <td style={{fontSize:12,color:"var(--text-secondary)"}}>{m.departmentName}</td>
                  <td><span style={{fontSize:10,padding:"2px 8px",borderRadius:5,fontWeight:700,textTransform:"capitalize",background:m.role==="leader"?"var(--warning-bg)":m.role==="admin"?"var(--violet-bg)":"var(--accent-bg)",color:m.role==="leader"?"var(--warning)":m.role==="admin"?"var(--violet)":"var(--accent)"}}>{m.role}</span></td>
                  <td><div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:6,height:6,borderRadius:"50%",background:SCOL[m.status]}}/><span style={{fontSize:11,color:SCOL[m.status],fontWeight:600,textTransform:"capitalize"}}>{m.status}</span></div></td>
                  <td>
                    <button onClick={()=>toggleCI(m)} style={{padding:"4px 14px",borderRadius:7,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,background:m.checkedInToday?"var(--success-bg)":"var(--warning-bg)",color:m.checkedInToday?"var(--success)":"var(--warning)"}}>
                      {m.checkedInToday?"✓ Checked In":"Pending"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CheckInModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onComplete={() => { toast("Check-in recorded! 🎉"); setShowModal(false); loadData(); }}
        canDefer={true}
      />
    </AppLayout>
  );
}
