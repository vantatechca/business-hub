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
  reviewed:     "var(--success)",
  submitted:    "var(--warning)",
  ai_processed: "var(--warning)",
  pending:      "var(--text-muted)",
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Get the Monday of the week containing the given date. */
function getWeekStart(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d);
  mon.setDate(diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function shiftWeek(d: Date, weeks: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + weeks * 7);
  return next;
}

function weekDays(start: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function dk(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatWeekRange(start: Date): string {
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, { ...opts, year: "numeric" })}`;
}

export default function CheckInPage() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const initialWeekStart = getWeekStart(today);

  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [matrix, setMatrix] = useState<{ daysInMonth: number; members: TeamMatrixMember[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [viewing, setViewing] = useState<DailyCheckin | null>(null);
  const [memberDrawer, setMemberDrawer] = useState<{ id: string; name: string; initials: string } | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const { ts, toast } = useToast();

  const days = weekDays(weekStart);
  // The API returns full months — fetch every month the week spans
  const monthsNeeded = [...new Set(days.map(d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`))];
  const monthsKey = monthsNeeded.join(",");

  const load = useCallback(() => {
    setLoading(true);
    Promise.all(
      monthsNeeded.map(m => fetch(`/api/checkin/team?month=${m}`).then(r => r.json()))
    )
      .then(results => {
        const memberMap = new Map<string, TeamMatrixMember>();
        let totalDays = 0;
        for (const d of results) {
          if (d.error) continue;
          totalDays = Math.max(totalDays, d.daysInMonth ?? 0);
          for (const m of (d.members ?? []) as TeamMatrixMember[]) {
            if (memberMap.has(m.userId)) {
              const existing = memberMap.get(m.userId)!;
              existing.days = { ...existing.days, ...m.days };
            } else {
              memberMap.set(m.userId, { ...m });
            }
          }
        }
        setMatrix({ daysInMonth: totalDays, members: Array.from(memberMap.values()) });
        setLoading(false);
      })
      .catch(() => { setLoading(false); toast("Failed to load", "er"); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthsKey]);

  useEffect(() => { load(); }, [load]);

  const isCurrentWeek = weekStart.getTime() === initialWeekStart.getTime();
  const isFutureWeek = weekStart > initialWeekStart;

  const filteredMembers = (matrix?.members ?? []).filter(m =>
    !searchQ.trim() || m.userName.toLowerCase().includes(searchQ.toLowerCase())
  );

  // Stats for the visible week
  const weekdayCount = days.filter(d => d.getDay() !== 0 && d.getDay() !== 6).length;
  const totalSlots = filteredMembers.length * weekdayCount;
  let filled = 0;
  for (const m of filteredMembers) {
    for (const d of days) {
      if (d.getDay() === 0 || d.getDay() === 6) continue;
      if (m.days[String(d.getDate())]) filled++;
    }
  }
  const rate = totalSlots > 0 ? Math.round((filled / totalSlots) * 100) : 0;

  const ini = (name: string) => name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

  const openCheckinDay = (member: TeamMatrixMember, day: Date) => {
    const info = member.days[String(day.getDate())];
    if (!info) return;
    setViewing({
      id: info.checkinId,
      userId: member.userId,
      userName: member.userName,
      checkinDate: dk(day),
      status: info.status as DailyCheckin["status"],
      createdAt: dk(day),
    } as DailyCheckin);
  };

  return (
    <AppLayout title="Check-Ins" onNew={() => setShowModal(true)} newLabel="My Check-In">
      <ToastList ts={ts} />

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 14 }}>
        {[
          { l: "Weekly Rate", v: `${rate}%`, s: `${filled} check-ins this week`, c: rate >= 80 ? "var(--success)" : rate >= 50 ? "var(--warning)" : "var(--danger)" },
          { l: "Active Members", v: String(filteredMembers.length), s: searchQ ? "Matching search" : "Tracked", c: "var(--accent)" },
          { l: "Weekdays", v: String(weekdayCount), s: formatWeekRange(weekStart), c: "var(--violet)" },
        ].map((s, i) => (
          <Card key={i}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 5 }}>{s.l}</div>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", color: s.c }}>{s.v}</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.s}</div>
          </Card>
        ))}
      </div>

      {/* Week nav + search */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-primary)" }}>
          Team Heatmap · {formatWeekRange(weekStart)}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--bg-card)", border: "1px solid var(--border-card)", borderRadius: 8, padding: "5px 10px", minWidth: 160 }}>
            <span style={{ color: "var(--text-muted)", fontSize: 12 }}>⌕</span>
            <input
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="Search employee..."
              style={{ border: "none", background: "transparent", outline: "none", fontSize: 11, color: "var(--text-primary)", width: "100%" }}
            />
          </div>
          <button onClick={() => setWeekStart(shiftWeek(weekStart, -1))} style={{ padding: "5px 10px", borderRadius: 7, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
            <ChevronLeft size={13} /> Prev
          </button>
          {!isCurrentWeek && (
            <button onClick={() => setWeekStart(initialWeekStart)} style={{ padding: "5px 10px", borderRadius: 7, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-secondary)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
              This Week
            </button>
          )}
          <button
            onClick={() => setWeekStart(shiftWeek(weekStart, 1))}
            disabled={isFutureWeek}
            style={{ padding: "5px 10px", borderRadius: 7, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 11, fontWeight: 600, cursor: isFutureWeek ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 4, opacity: isFutureWeek ? 0.4 : 1 }}
          >
            Next <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {/* Heatmap — 7-day week view */}
      {loading ? (
        <div className="skeleton" style={{ height: 360, borderRadius: 12 }} />
      ) : !matrix || filteredMembers.length === 0 ? (
        <div className="hub-card" style={{ padding: "40px 24px", textAlign: "center", color: "var(--text-secondary)", fontSize: 12 }}>
          {searchQ ? `No employees matching "${searchQ}"` : "No active members found."}
        </div>
      ) : (
        <div className="hub-card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: 11, width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ padding: "11px 14px", position: "sticky", left: 0, background: "var(--bg-card)", zIndex: 2, textAlign: "left", borderBottom: "1px solid var(--border-divider)", fontWeight: 700, color: "var(--text-secondary)", minWidth: 180 }}>
                    Member
                  </th>
                  {days.map(d => {
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                    const isToday = dk(d) === dk(today);
                    return (
                      <th key={dk(d)} style={{
                        padding: "8px 12px", textAlign: "center", fontWeight: 700,
                        color: isToday ? "var(--accent)" : isWeekend ? "var(--text-muted)" : "var(--text-secondary)",
                        background: isToday ? "var(--accent-bg)" : isWeekend ? "var(--bg-input)" : "transparent",
                        borderBottom: "1px solid var(--border-divider)", minWidth: 64,
                      }}>
                        <div style={{ fontSize: 10 }}>{DAY_NAMES[d.getDay()]}</div>
                        <div style={{ fontSize: 14, fontWeight: 800, marginTop: 2 }}>{d.getDate()}</div>
                      </th>
                    );
                  })}
                  <th style={{ padding: "11px 14px", textAlign: "right", borderBottom: "1px solid var(--border-divider)", fontWeight: 700, color: "var(--text-secondary)" }}>
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map(m => {
                  let weekTotal = 0;
                  return (
                    <tr key={m.userId}>
                      <td style={{ padding: "8px 14px", position: "sticky", left: 0, background: "var(--bg-card)", borderBottom: "1px solid var(--border-divider)", zIndex: 1 }}>
                        <button
                          onClick={() => setMemberDrawer({ id: m.userId, name: m.userName, initials: ini(m.userName) })}
                          style={{ display: "flex", alignItems: "center", gap: 8, background: "transparent", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}
                        >
                          <Avatar s={ini(m.userName)} size={28} />
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", whiteSpace: "nowrap" }}>{m.userName}</div>
                            <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "capitalize" }}>{m.role}</div>
                          </div>
                        </button>
                      </td>
                      {days.map(d => {
                        const cell = m.days[String(d.getDate())];
                        if (cell) weekTotal++;
                        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                        const isToday = dk(d) === dk(today);
                        const isPastOrToday = d.getTime() <= today.getTime();
                        const bg = cell ? STATUS_COLOR[cell.status] ?? "var(--accent)" : "transparent";
                        const isMissed = !cell && isPastOrToday && !isWeekend;
                        return (
                          <td key={dk(d)} onClick={() => cell && openCheckinDay(m, d)}
                            title={cell ? `${m.userName} · ${dk(d)} · ${cell.status}` : isMissed ? `${m.userName} · ${dk(d)} · missed` : ""}
                            style={{
                              padding: "6px 4px", textAlign: "center",
                              borderBottom: "1px solid var(--border-divider)",
                              background: isToday ? "var(--accent-bg)" : isWeekend ? "var(--bg-input)" : "transparent",
                              cursor: cell ? "pointer" : "default",
                            }}
                          >
                            <div style={{
                              width: 24, height: 24, borderRadius: 5, background: bg, margin: "0 auto",
                              border: cell ? "none" : isMissed ? "2px solid var(--danger)" : "1px solid var(--border-card)",
                            }} />
                          </td>
                        );
                      })}
                      <td style={{ padding: "8px 14px", textAlign: "right", borderBottom: "1px solid var(--border-divider)", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)" }}>
                        {weekTotal}/7
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: "10px 14px", display: "flex", gap: 16, fontSize: 10, color: "var(--text-secondary)", borderTop: "1px solid var(--border-divider)", flexWrap: "wrap" }}>
            <Legend color="var(--success)" label="Reviewed" />
            <Legend color="var(--warning)" label="Submitted" />
            <Legend color="transparent" label="Missed" missedOutline />
            <Legend color="transparent" label="Weekend / future" border />
            <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-muted)" }}>Click cell to view · click name for history</span>
          </div>
        </div>
      )}

      <CheckInModal open={showModal} onClose={() => setShowModal(false)} onComplete={() => { toast("Check-in recorded!"); setShowModal(false); load(); }} canDefer={true} />
      <CheckinViewer checkin={viewing} open={!!viewing} onClose={() => setViewing(null)} onReviewed={() => { load(); toast("Marked as reviewed"); }} />
      <MemberCheckinDrawer member={memberDrawer} open={!!memberDrawer} onClose={() => setMemberDrawer(null)} />
    </AppLayout>
  );
}

function Legend({ color, label, border, missedOutline }: { color: string; label: string; border?: boolean; missedOutline?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <div style={{
        width: 12, height: 12, borderRadius: 3, background: color,
        border: missedOutline ? "2px solid var(--danger)" : border ? "1px solid var(--border-card)" : "none",
      }} />
      <span>{label}</span>
    </div>
  );
}
