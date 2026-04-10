"use client";
import { useState, useEffect, useCallback } from "react";
import AppLayout from "@/components/Layout";
import { Avatar, Card, useToast, ToastList, EmptyState } from "@/components/ui/shared";
import { Cake, CheckCircle2, X, Loader2, Users } from "lucide-react";

interface BirthdayUser {
  userId: string;
  name: string;
  initials: string;
  birthday: string;
  mmdd: string;
  daysUntil: number;
  turningAge?: number;
}

interface BirthdaysResponse {
  today: BirthdayUser[];
  upcoming: BirthdayUser[];
  recent: BirthdayUser[];
  all: BirthdayUser[];
}

// localStorage key helpers — per user per year
const greetedKey = (uid: string, year: number) => `bday_greeted_${uid}_${year}`;
const dismissedKey = (uid: string, year: number) => `bday_dismissed_${uid}_${year}`;

function isMarked(uid: string, year: number): { greeted: boolean; dismissed: boolean } {
  if (typeof window === "undefined") return { greeted: false, dismissed: false };
  return {
    greeted: localStorage.getItem(greetedKey(uid, year)) === "1",
    dismissed: localStorage.getItem(dismissedKey(uid, year)) === "1",
  };
}

export default function BirthdaysPage() {
  const [data, setData] = useState<BirthdaysResponse | null>(null);
  const [showAllDrawer, setShowAllDrawer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0); // forces re-render after localStorage writes
  const { ts, toast } = useToast();

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/birthdays")
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setLoading(false); toast("Failed to load birthdays", "er"); });
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const year = new Date().getFullYear();

  const markGreeted = (uid: string, name: string) => {
    localStorage.setItem(greetedKey(uid, year), "1");
    setTick(t => t + 1);
    toast(`Marked ${name}'s birthday as greeted 🎉`);
  };
  const unmarkGreeted = (uid: string, name: string) => {
    localStorage.removeItem(greetedKey(uid, year));
    setTick(t => t + 1);
    toast(`Unmarked ${name}'s birthday`, "wa");
  };
  const dismiss = (uid: string, name: string) => {
    localStorage.setItem(dismissedKey(uid, year), "1");
    setTick(t => t + 1);
    toast(`Moved ${name}'s birthday to Past`, "wa");
  };
  const undismiss = (uid: string, name: string) => {
    localStorage.removeItem(dismissedKey(uid, year));
    setTick(t => t + 1);
    toast(`Moved ${name}'s birthday back to Missed`, "wa");
  };
  void tick; // used to trigger re-renders

  // Today = ungreeted today-birthdays
  const visibleToday = (data?.today ?? []).filter(u => !isMarked(u.userId, year).greeted);
  const greetedToday = (data?.today ?? []).filter(u => isMarked(u.userId, year).greeted);
  // Missed = last-14-days birthdays that haven't been greeted or dismissed
  const visibleRecent = (data?.recent ?? []).filter(u => {
    const m = isMarked(u.userId, year);
    return !m.greeted && !m.dismissed;
  });
  // Past = last-14-days birthdays that the user dismissed (separate from greeted)
  const pastList = (data?.recent ?? []).filter(u => {
    const m = isMarked(u.userId, year);
    return m.dismissed && !m.greeted;
  }).sort((a, b) => b.daysUntil - a.daysUntil);
  // Greeted = anyone marked greeted (today or recent). Shown so the user can
  // see who they've already acknowledged and undo if needed.
  const greetedList = [
    ...greetedToday,
    ...(data?.recent ?? []).filter(u => isMarked(u.userId, year).greeted),
  ].sort((a, b) => b.daysUntil - a.daysUntil);

  return (
    <AppLayout title="Birthdays">
      <ToastList ts={ts} />

      {/* View All button */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button
          onClick={() => setShowAllDrawer(true)}
          style={{
            padding: "7px 14px", borderRadius: 8,
            border: "1px solid var(--border-card)", background: "var(--bg-input)",
            color: "var(--text-primary)", fontSize: 12, fontWeight: 700,
            cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
          }}
        >
          <Users size={14} /> View All Birthdays ({data?.all?.length ?? 0})
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
          <Loader2 size={20} style={{ animation: "spin 1s linear infinite", display: "inline-block", marginBottom: 10 }} />
          <div>Loading birthdays…</div>
        </div>
      ) : !data || (data.today.length === 0 && data.upcoming.length === 0 && data.recent.length === 0) ? (
        <EmptyState
          icon="🎂"
          title="No birthdays on record"
          desc="Add birthdays to team members on the Users page."
        />
      ) : (
        <>
          {/* Today's birthdays */}
          <Section title="Today" count={visibleToday.length} icon="🎉" accent="var(--accent)">
            {visibleToday.length === 0 ? (
              greetedToday.length > 0 ? (
                <div style={{ padding: "16px 0", color: "var(--text-secondary)", fontSize: 12 }}>
                  All of today&apos;s birthday folks have been greeted. 🎊
                </div>
              ) : (
                <div style={{ padding: "16px 0", color: "var(--text-muted)", fontSize: 12 }}>
                  No birthdays today.
                </div>
              )
            ) : (
              <CardGrid>
                {visibleToday.map(u => (
                  <BirthdayCard key={u.userId} u={u} variant="today">
                    <ActionButton color="var(--success)" icon={<CheckCircle2 size={13} />} onClick={() => markGreeted(u.userId, u.name)}>
                      Mark as greeted
                    </ActionButton>
                  </BirthdayCard>
                ))}
              </CardGrid>
            )}
          </Section>

          {/* Upcoming (next 14 days) — cannot be dismissed */}
          <Section title="Upcoming · Next 14 days" count={data.upcoming.length} icon="📅" accent="var(--warning)">
            {data.upcoming.length === 0 ? (
              <div style={{ padding: "16px 0", color: "var(--text-muted)", fontSize: 12 }}>
                No birthdays in the next two weeks.
              </div>
            ) : (
              <CardGrid>
                {data.upcoming.map(u => (
                  <BirthdayCard key={u.userId} u={u} variant="upcoming" />
                ))}
              </CardGrid>
            )}
          </Section>

          {/* Recent missed (past 14 days) — greet or dismiss */}
          <Section title="Missed · Last 14 days" count={visibleRecent.length} icon="💔" accent="var(--danger)">
            {visibleRecent.length === 0 ? (
              <div style={{ padding: "16px 0", color: "var(--text-muted)", fontSize: 12 }}>
                No missed birthdays.
              </div>
            ) : (
              <CardGrid>
                {visibleRecent.map(u => (
                  <BirthdayCard key={u.userId} u={u} variant="missed">
                    <div style={{ display: "flex", gap: 6 }}>
                      <ActionButton color="var(--success)" icon={<CheckCircle2 size={13} />} onClick={() => markGreeted(u.userId, u.name)}>
                        Already greeted
                      </ActionButton>
                      <ActionButton color="var(--text-secondary)" icon={<X size={13} />} onClick={() => dismiss(u.userId, u.name)}>
                        Dismiss
                      </ActionButton>
                    </div>
                  </BirthdayCard>
                ))}
              </CardGrid>
            )}
          </Section>

          {/* Past — birthdays the user explicitly dismissed from Missed.
              Kept visible so they can "Move back" (undismiss) if needed. */}
          <Section title="Past · Dismissed" count={pastList.length} icon="🗂" accent="var(--text-secondary)">
            {pastList.length === 0 ? (
              <div style={{ padding: "16px 0", color: "var(--text-muted)", fontSize: 12 }}>
                No dismissed birthdays.
              </div>
            ) : (
              <CardGrid>
                {pastList.map(u => (
                  <BirthdayCard key={u.userId} u={u} variant="past">
                    <div style={{ display: "flex", gap: 6 }}>
                      <ActionButton color="var(--success)" icon={<CheckCircle2 size={13} />} onClick={() => markGreeted(u.userId, u.name)}>
                        Mark as greeted
                      </ActionButton>
                      <ActionButton color="var(--text-secondary)" icon={<X size={13} />} onClick={() => undismiss(u.userId, u.name)}>
                        Move back to Missed
                      </ActionButton>
                    </div>
                  </BirthdayCard>
                ))}
              </CardGrid>
            )}
          </Section>

          {/* Greeted — everyone already acknowledged this year. Shown so
              users can still see who they've greeted and unmark if needed. */}
          <Section title="Greeted" count={greetedList.length} icon="✅" accent="var(--success)">
            {greetedList.length === 0 ? (
              <div style={{ padding: "16px 0", color: "var(--text-muted)", fontSize: 12 }}>
                No one has been marked as greeted yet.
              </div>
            ) : (
              <CardGrid>
                {greetedList.map(u => (
                  <BirthdayCard key={u.userId} u={u} variant="greeted">
                    <ActionButton color="var(--text-secondary)" icon={<X size={13} />} onClick={() => unmarkGreeted(u.userId, u.name)}>
                      Unmark
                    </ActionButton>
                  </BirthdayCard>
                ))}
              </CardGrid>
            )}
          </Section>
        </>
      )}
      {/* All Birthdays Drawer */}
      {showAllDrawer && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setShowAllDrawer(false); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 600, display: "flex", justifyContent: "flex-end" }}
        >
          <div style={{
            width: 420, maxWidth: "95vw", height: "100vh",
            background: "var(--bg-card)", borderLeft: "1px solid var(--border-card)",
            boxShadow: "var(--shadow-modal)", overflowY: "auto",
            animation: "slideInRight .2s ease",
          }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-divider)", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "var(--bg-card)", zIndex: 1 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)" }}>All Team Birthdays</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{data?.all?.length ?? 0} employees</div>
              </div>
              <button onClick={() => setShowAllDrawer(false)} style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", display: "flex" }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: "12px 16px" }}>
              {(data?.all ?? []).length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)", fontSize: 12 }}>
                  No birthdays on record. Add birthdays on the Team or Users page.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {(data?.all ?? []).map(u => {
                    const isToday = u.daysUntil === 0;
                    const isPast = u.daysUntil < 0;
                    const daysLabel = isToday ? "Today!" : isPast
                      ? `${Math.abs(u.daysUntil)} day${Math.abs(u.daysUntil) === 1 ? "" : "s"} ago`
                      : `In ${u.daysUntil} day${u.daysUntil === 1 ? "" : "s"}`;
                    const accent = isToday ? "var(--accent)" : isPast ? "var(--text-muted)" : u.daysUntil <= 7 ? "var(--warning)" : "var(--text-secondary)";
                    return (
                      <div key={u.userId} style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "10px 14px", borderRadius: 10,
                        background: isToday ? "var(--accent-bg)" : "var(--bg-input)",
                        border: isToday ? "1px solid var(--accent)44" : "1px solid var(--border-card)",
                      }}>
                        <Avatar s={u.initials} size={36} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</div>
                          <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                            {new Date(u.birthday + "T00:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric" })}
                            {u.turningAge != null && ` - turning ${u.turningAge}`}
                          </div>
                        </div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: accent, flexShrink: 0, textAlign: "right" }}>
                          {isToday && <span style={{ fontSize: 16, marginRight: 4 }}>🎉</span>}
                          {daysLabel}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
    </AppLayout>
  );
}

function Section({ title, count, icon, accent, children }: { title: string; count: number; icon: string; accent: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>{title}</div>
        <span style={{ padding: "1px 8px", borderRadius: 10, fontSize: 10, fontWeight: 800, background: `${accent}18`, color: accent }}>
          {count}
        </span>
      </div>
      {children}
    </div>
  );
}

function CardGrid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 12 }}>{children}</div>;
}

function BirthdayCard({ u, variant, children }: { u: BirthdayUser; variant: "today" | "upcoming" | "missed" | "greeted" | "past"; children?: React.ReactNode }) {
  const accent =
    variant === "today"    ? "var(--accent)"  :
    variant === "upcoming" ? "var(--warning)" :
    variant === "greeted"  ? "var(--success)" :
    variant === "past"     ? "var(--text-muted)" :
    "var(--danger)";
  const subtitle =
    variant === "today"    ? "Today!" :
    variant === "upcoming" ? `In ${u.daysUntil} day${u.daysUntil === 1 ? "" : "s"}` :
    variant === "greeted"
      ? (u.daysUntil === 0
          ? "✓ Greeted today"
          : `✓ Greeted · ${Math.abs(u.daysUntil)} day${Math.abs(u.daysUntil) === 1 ? "" : "s"} ago`)
      : variant === "past"
      ? `Dismissed · ${Math.abs(u.daysUntil)} day${Math.abs(u.daysUntil) === 1 ? "" : "s"} ago`
      : `${Math.abs(u.daysUntil)} day${Math.abs(u.daysUntil) === 1 ? "" : "s"} ago`;
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <div style={{ position: "relative" }}>
          <Avatar s={u.initials} size={46} />
          <div style={{
            position: "absolute",
            bottom: -3, right: -3,
            width: 20, height: 20,
            borderRadius: "50%",
            background: accent,
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "2px solid var(--bg-card)",
          }}>
            <Cake size={11} color="#fff" />
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
            {new Date(u.birthday + "T00:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric" })}
            {u.turningAge != null && <> · turning {u.turningAge}</>}
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, color: accent, marginTop: 2 }}>{subtitle}</div>
        </div>
      </div>
      {children}
    </Card>
  );
}

function ActionButton({ color, icon, onClick, children }: { color: string; icon: React.ReactNode; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: "7px 10px", borderRadius: 8,
        border: `1px solid ${color}44`,
        background: `${color}11`,
        color,
        fontSize: 11, fontWeight: 700, cursor: "pointer",
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5,
      }}
    >
      {icon} {children}
    </button>
  );
}
