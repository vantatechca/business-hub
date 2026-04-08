"use client";
import { useState, useEffect, useCallback } from "react";
import AppLayout from "@/components/Layout";
import CheckInModal from "@/components/CheckInModal";
import CheckinViewer from "@/components/CheckinViewer";
import MemberCheckinDrawer from "@/components/MemberCheckinDrawer";
import { Avatar, Card, useToast, ToastList } from "@/components/ui/shared";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { DailyCheckin } from "@/lib/types";

interface TeamMatrixMember {
  userId: string;
  userName: string;
  role: string;
  days: Record<string, { status: string; checkinId: string }>;
}

const STATUS_COLOR: Record<string, string> = {
  ai_processed: "var(--success)",
  reviewed:     "var(--success)",
  submitted:    "var(--warning)",
  pending:      "var(--text-muted)",
};

function formatMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function CheckInPage() {
  const today = new Date();
  const initialMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  const [month, setMonth] = useState(initialMonth);
  const [matrix, setMatrix] = useState<{ daysInMonth: number; members: TeamMatrixMember[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [viewing, setViewing] = useState<DailyCheckin | null>(null);
  const [memberDrawer, setMemberDrawer] = useState<{ id: string; name: string; initials: string } | null>(null);
  const { ts, toast } = useToast();

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/checkin/team?month=${month}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { toast(d.error, "er"); setMatrix(null); }
        else setMatrix({ daysInMonth: d.daysInMonth, members: d.members });
        setLoading(false);
      })
      .catch(() => { setLoading(false); toast("Failed to load", "er"); });
  }, [month, toast]);

  useEffect(() => { load(); }, [load]);

  const isCurrentMonth = month === initialMonth;
  const isFutureMonth = month > initialMonth;

  // Member stats for the period
  const stats = matrix ? (() => {
    const totalSlots = matrix.members.length * matrix.daysInMonth;
    let filled = 0;
    for (const m of matrix.members) filled += Object.keys(m.days).length;
    const completionRate = totalSlots > 0 ? Math.round((filled / totalSlots) * 100) : 0;
    return { totalCheckins: filled, completionRate };
  })() : { totalCheckins: 0, completionRate: 0 };

  const initials = (name: string) => name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

  const openCheckinDay = (member: TeamMatrixMember, day: number) => {
    const info = member.days[String(day)];
    if (!info) return;
    const dateStr = `${month}-${String(day).padStart(2, "0")}`;
    setViewing({
      id: info.checkinId,
      userId: member.userId,
      userName: member.userName,
      checkinDate: dateStr,
      status: info.status as DailyCheckin["status"],
      createdAt: dateStr,
    } as DailyCheckin);
  };

  return (
    <AppLayout title="Check-Ins" onNew={() => setShowModal(true)} newLabel="My Check-In">
      <ToastList ts={ts} />

      {/* Stats */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:14 }}>
        {[
          { l:"Completion Rate", v:`${stats.completionRate}%`, s:`${stats.totalCheckins} check-ins this month`, c: stats.completionRate>=80?"var(--success)":stats.completionRate>=50?"var(--warning)":"var(--danger)" },
          { l:"Active Members",  v: matrix ? String(matrix.members.length) : "—", s:"Tracked this month", c:"var(--accent)" },
          { l:"Days in Month",   v: matrix ? String(matrix.daysInMonth) : "—", s:formatMonth(month), c:"var(--violet)" },
        ].map((s,i)=>(
          <Card key={i}>
            <div style={{fontSize:11,fontWeight:700,color:"var(--text-secondary)",marginBottom:5}}>{s.l}</div>
            <div style={{fontSize:26,fontWeight:800,letterSpacing:"-0.02em",color:s.c}}>{s.v}</div>
            <div style={{fontSize:11,color:"var(--text-secondary)",marginTop:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.s}</div>
          </Card>
        ))}
      </div>

      {/* Month nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-primary)" }}>Team Heatmap · {formatMonth(month)}</div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => setMonth(shiftMonth(month, -1))}
            style={{ padding: "5px 10px", borderRadius: 7, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
          >
            <ChevronLeft size={13} /> Prev
          </button>
          {!isCurrentMonth && (
            <button
              onClick={() => setMonth(initialMonth)}
              style={{ padding: "5px 10px", borderRadius: 7, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-secondary)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
            >
              Today
            </button>
          )}
          <button
            onClick={() => setMonth(shiftMonth(month, 1))}
            disabled={isFutureMonth}
            style={{ padding: "5px 10px", borderRadius: 7, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 11, fontWeight: 600, cursor: isFutureMonth ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 4, opacity: isFutureMonth ? 0.4 : 1 }}
          >
            Next <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {/* Heatmap */}
      {loading ? (
        <div className="skeleton" style={{ height: 360, borderRadius: 12 }} />
      ) : !matrix || matrix.members.length === 0 ? (
        <div className="hub-card" style={{ padding: "40px 24px", textAlign: "center", color: "var(--text-secondary)", fontSize: 12 }}>
          No active members found. {matrix == null && "(Database may not be configured.)"}
        </div>
      ) : (
        <div className="hub-card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: 11, width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ padding: "11px 14px", position: "sticky", left: 0, background: "var(--bg-card)", zIndex: 2, textAlign: "left", borderBottom: "1px solid var(--border-divider)", fontWeight: 700, color: "var(--text-secondary)" }}>
                    Member
                  </th>
                  {Array.from({ length: matrix.daysInMonth }, (_, i) => i + 1).map(day => {
                    const dateObj = new Date(`${month}-${String(day).padStart(2, "0")}T00:00:00`);
                    const dow = dateObj.getDay();
                    const isWeekend = dow === 0 || dow === 6;
                    return (
                      <th
                        key={day}
                        style={{
                          padding: "11px 0 8px",
                          textAlign: "center",
                          fontWeight: 700,
                          color: isWeekend ? "var(--text-muted)" : "var(--text-secondary)",
                          background: isWeekend ? "var(--bg-input)" : "transparent",
                          borderBottom: "1px solid var(--border-divider)",
                          minWidth: 22,
                        }}
                      >
                        {day}
                      </th>
                    );
                  })}
                  <th style={{ padding: "11px 14px", textAlign: "right", borderBottom: "1px solid var(--border-divider)", fontWeight: 700, color: "var(--text-secondary)" }}>
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {matrix.members.map(m => {
                  const total = Object.keys(m.days).length;
                  const ini = initials(m.userName);
                  return (
                    <tr key={m.userId}>
                      <td style={{ padding: "8px 14px", position: "sticky", left: 0, background: "var(--bg-card)", borderBottom: "1px solid var(--border-divider)", zIndex: 1 }}>
                        <button
                          onClick={() => setMemberDrawer({ id: m.userId, name: m.userName, initials: ini })}
                          style={{ display: "flex", alignItems: "center", gap: 8, background: "transparent", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}
                        >
                          <Avatar s={ini} size={26} />
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{m.userName}</div>
                            <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "capitalize" }}>{m.role}</div>
                          </div>
                        </button>
                      </td>
                      {Array.from({ length: matrix.daysInMonth }, (_, i) => i + 1).map(day => {
                        const cell = m.days[String(day)];
                        const dateObj = new Date(`${month}-${String(day).padStart(2, "0")}T00:00:00`);
                        const dow = dateObj.getDay();
                        const isWeekend = dow === 0 || dow === 6;
                        const bg = cell ? STATUS_COLOR[cell.status] ?? "var(--accent)" : "transparent";
                        return (
                          <td
                            key={day}
                            onClick={() => cell && openCheckinDay(m, day)}
                            title={cell ? `${m.userName} · ${month}-${String(day).padStart(2, "0")} · ${cell.status}` : ""}
                            style={{
                              padding: "4px 2px",
                              textAlign: "center",
                              borderBottom: "1px solid var(--border-divider)",
                              background: isWeekend ? "var(--bg-input)" : "transparent",
                              cursor: cell ? "pointer" : "default",
                            }}
                          >
                            <div style={{
                              width: 16,
                              height: 16,
                              borderRadius: 3,
                              background: bg,
                              border: cell ? "none" : "1px solid var(--border-card)",
                              margin: "0 auto",
                            }} />
                          </td>
                        );
                      })}
                      <td style={{ padding: "8px 14px", textAlign: "right", borderBottom: "1px solid var(--border-divider)", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)" }}>
                        {total}/{matrix.daysInMonth}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: "10px 14px", display: "flex", gap: 16, fontSize: 10, color: "var(--text-secondary)", borderTop: "1px solid var(--border-divider)" }}>
            <Legend color="var(--success)" label="AI processed / reviewed" />
            <Legend color="var(--warning)" label="Submitted (not yet AI)" />
            <Legend color="transparent" label="No check-in" border />
            <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-muted)" }}>Click a cell to view check-in · click a name for full history</span>
          </div>
        </div>
      )}

      <CheckInModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onComplete={() => { toast("Check-in recorded! 🎉"); setShowModal(false); load(); }}
        canDefer={true}
      />

      <CheckinViewer checkin={viewing} open={!!viewing} onClose={() => setViewing(null)} />
      <MemberCheckinDrawer member={memberDrawer} open={!!memberDrawer} onClose={() => setMemberDrawer(null)} />
    </AppLayout>
  );
}

function Legend({ color, label, border }: { color: string; label: string; border?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <div style={{ width: 12, height: 12, borderRadius: 3, background: color, border: border ? "1px solid var(--border-card)" : "none" }} />
      <span>{label}</span>
    </div>
  );
}
