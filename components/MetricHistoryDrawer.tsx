"use client";
import { useEffect, useState } from "react";
import { X, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import type { Metric } from "@/lib/types";
import { formatMetricValue, healthColor, priorityLabel, priorityColor, formatTaskDueDate, isTaskDueTodayOrPast } from "@/lib/types";
import { Avatar } from "@/components/ui/shared";

interface DayPoint { date: string; value: number; count: number; }
interface UpdateEntry {
  id: string;
  date: string;
  oldValue: number | null;
  newValue: number;
  delta: number | null;
  source: string;
  notes: string | null;
  userName: string | null;
}
interface DrawerAssignee {
  userId: string;
  name: string;
  initials: string;
  roleInMetric: string;
}
interface HistoryResponse {
  metric: Omit<Metric, "assignees"> & {
    departmentName?: string;
    dueDate?: string | null;
    assignees?: DrawerAssignee[];
  };
  updates: UpdateEntry[];
  daily: DayPoint[];
}

export default function MetricHistoryDrawer({
  metric,
  open,
  onClose,
}: {
  metric: Metric | null;
  open: boolean;
  onClose: () => void;
}) {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  // Daily metrics default to a wider window so the month calendar can browse
  // prev/next months without re-fetching. Value metrics use the narrower
  // 30/60/90 toggle for the trend chart.
  const [days, setDays] = useState<30 | 60 | 90>(30);

  useEffect(() => {
    if (!open || !metric) return;
    setLoading(true);
    setData(null);
    const range = metric.metricType === "daily" ? 120 : days;
    fetch(`/api/metrics/${metric.id}/history?days=${range}`)
      .then(r => r.json())
      .then(d => { if (!d.error) setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [open, metric, days]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !metric) return null;

  const isDaily = metric.metricType === "daily";

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 500,
        display: "flex", justifyContent: "flex-end",
      }}
    >
      <div
        style={{
          width: 540, maxWidth: "100vw", height: "100%", overflowY: "auto",
          background: "var(--bg-card)", borderLeft: "1px solid var(--border-card)",
          boxShadow: "var(--shadow-modal)", animation: "slideRight .2s ease",
        }}
      >
        <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--border-divider)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text-muted)", letterSpacing: ".1em" }}>{metric.departmentName ?? "Metric"}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{metric.name}</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", padding: 4, display: "flex" }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: "16px 22px", display: "flex", gap: 18, flexWrap: "wrap" }}>
          <Stat label="Current" value={formatMetricValue(metric.currentValue, metric.unit)} color="var(--accent)" />
          {metric.targetValue != null && (
            <Stat label="Target" value={formatMetricValue(metric.targetValue, metric.unit)} color="var(--text-primary)" />
          )}
          <Stat
            label="Type"
            value={metric.metricType === "value" ? "Total" : metric.metricType.replace(/_/g, " ")}
            color="var(--text-secondary)"
          />
          <Stat
            label="Priority"
            value={priorityLabel(metric.priorityScore)}
            color={priorityColor(metric.priorityScore)}
          />
          {(data?.metric.dueDate || metric.dueDate) && (
            <Stat
              label="Due"
              value={formatTaskDueDate((data?.metric.dueDate || metric.dueDate) as string)}
              color={isTaskDueTodayOrPast((data?.metric.dueDate || metric.dueDate) as string) ? "var(--danger)" : "var(--text-primary)"}
            />
          )}
        </div>

        {/* Notes */}
        {(data?.metric.notes || metric.notes) && (
          <div style={{ padding: "0 22px 12px" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text-muted)", letterSpacing: ".07em", marginBottom: 5 }}>NOTES</div>
            <div style={{ padding: "10px 12px", borderRadius: 8, background: "var(--bg-input)", fontSize: 12, color: "var(--text-primary)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
              {(data?.metric.notes || metric.notes) as string}
            </div>
          </div>
        )}

        {/* Assignees */}
        {data?.metric.assignees && data.metric.assignees.length > 0 && (
          <div style={{ padding: "0 22px 14px" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text-muted)", letterSpacing: ".07em", marginBottom: 6 }}>
              ASSIGNEES ({data.metric.assignees.length})
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {data.metric.assignees.map(a => (
                <div
                  key={a.userId}
                  title={`${a.name} · ${a.roleInMetric}`}
                  style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 10px 6px 6px", borderRadius: 999, background: "var(--bg-input)", border: "1px solid var(--border-card)", cursor: "help" }}
                >
                  <Avatar s={a.initials} size={22} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)" }}>{a.name}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".06em" }}>{a.roleInMetric}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {loading && (
          <div style={{ padding: 36, textAlign: "center", color: "var(--text-secondary)", fontSize: 12 }}>
            <Loader2 size={18} style={{ animation: "spin 1s linear infinite", display: "inline-block", marginBottom: 8 }} />
            <div>Loading history…</div>
          </div>
        )}

        {!loading && data && (
          <>
            {!isDaily && (
              <div style={{ padding: "0 22px 14px", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, letterSpacing: ".07em" }}>RANGE</span>
                {[30, 60, 90].map(n => (
                  <button
                    key={n}
                    onClick={() => setDays(n as 30 | 60 | 90)}
                    style={{
                      padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer",
                      border: `1px solid ${days === n ? "var(--accent)" : "var(--border-card)"}`,
                      background: days === n ? "var(--accent-bg)" : "var(--bg-input)",
                      color: days === n ? "var(--accent)" : "var(--text-secondary)",
                    }}
                  >
                    {n}d
                  </button>
                ))}
              </div>
            )}

            {isDaily ? (
              <MonthCalendar
                points={data.daily}
                target={data.metric.targetValue ?? null}
                unit={metric.unit}
                direction={metric.direction}
              />
            ) : (
              <CumulativeChart
                points={data.daily.length ? data.daily : [{ date: new Date().toISOString().slice(0, 10), value: metric.currentValue, count: 1 }]}
                target={data.metric.targetValue ?? null}
                unit={metric.unit}
              />
            )}

            <div style={{ padding: "18px 22px 4px", fontSize: 11, fontWeight: 800, color: "var(--text-muted)", letterSpacing: ".1em" }}>
              UPDATE HISTORY ({data.updates.length})
            </div>
            <div style={{ padding: "0 22px 22px" }}>
              {data.updates.length === 0 ? (
                <div style={{ padding: "20px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
                  No updates in the last {days} days.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[...data.updates].reverse().map(u => (
                    <div key={u.id} style={{ padding: "10px 12px", background: "var(--bg-input)", borderRadius: 8, border: "1px solid var(--border-card)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                          {new Date(u.date).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          {u.userName && <span style={{ marginLeft: 6 }}>· {u.userName}</span>}
                        </div>
                        <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: "var(--bg-card)", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>{u.source}</span>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                        {u.oldValue != null && <span style={{ color: "var(--text-muted)" }}>{formatMetricValue(u.oldValue, metric.unit)} → </span>}
                        {formatMetricValue(u.newValue, metric.unit)}
                        {u.delta != null && (
                          <span style={{ marginLeft: 8, fontSize: 11, color: u.delta >= 0 ? "var(--success)" : "var(--danger)" }}>
                            {u.delta >= 0 ? "+" : ""}{u.delta}
                          </span>
                        )}
                      </div>
                      {u.notes && <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>{u.notes}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes slideRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 800, color: "var(--text-muted)", letterSpacing: ".08em" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color, marginTop: 2 }}>{value}</div>
    </div>
  );
}

// ── Month calendar for daily metrics ───────────────────────────────────
// Traditional 7-column month grid. Each day cell shows its number and, if a
// value was recorded on that day, the value is displayed in the bottom half
// with a color-coded background reflecting how it compared to the target.
// Prev / Today / Next arrows let users browse months within the fetched
// window (the drawer requests 120 days of history for daily metrics so the
// user can scroll ~4 months of history without a re-fetch).
function MonthCalendar({
  points,
  target,
  unit,
  direction,
}: {
  points: DayPoint[];
  target: number | null;
  unit: string;
  direction: "higher_better" | "lower_better";
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [viewMonth, setViewMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState<{ date: string; value: number | null } | null>(null);

  const valueByDate = new Map(points.map(p => [p.date, p.value]));

  // Color decision: hit target = green, close = yellow, missed = red, none = neutral
  const cellColor = (v: number | null): { bg: string; fg: string } => {
    if (v == null) return { bg: "transparent", fg: "var(--text-muted)" };
    if (target == null || target === 0) {
      return v > 0
        ? { bg: "var(--accent-bg)", fg: "var(--accent)" }
        : { bg: "var(--bg-input)", fg: "var(--text-muted)" };
    }
    const ratio = v / target;
    const hit = direction === "higher_better" ? ratio >= 1 : ratio <= 1;
    if (hit) return { bg: "rgba(52,211,153,.18)", fg: "var(--success)" };
    if (direction === "higher_better") {
      if (ratio >= 0.7) return { bg: "rgba(251,191,36,.18)", fg: "var(--warning)" };
      return { bg: "rgba(248,113,113,.18)", fg: "var(--danger)" };
    } else {
      if (ratio <= 1.3) return { bg: "rgba(251,191,36,.18)", fg: "var(--warning)" };
      return { bg: "rgba(248,113,113,.18)", fg: "var(--danger)" };
    }
  };

  // Build the grid. Leading / trailing days from adjacent months are shown
  // faded so the calendar fills a clean 6×7 block.
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Week starts Monday. JS getDay: 0 = Sun, 1 = Mon...
  const leadingDays = (firstOfMonth.getDay() + 6) % 7;
  const cells: { date: Date; inMonth: boolean }[] = [];
  for (let i = leadingDays; i > 0; i--) {
    cells.push({ date: new Date(year, month, 1 - i), inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].date;
    const next = new Date(last);
    next.setDate(last.getDate() + 1);
    cells.push({ date: next, inMonth: false });
  }
  // Tally stats for the current month
  let daysReported = 0;
  let daysHit = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const key = new Date(year, month, d).toISOString().slice(0, 10);
    const v = valueByDate.get(key);
    if (v != null) {
      daysReported++;
      if (target != null && target !== 0) {
        const hit = direction === "higher_better" ? v / target >= 1 : v / target <= 1;
        if (hit) daysHit++;
      }
    }
  }

  const monthLabel = firstOfMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const isCurrentMonth =
    viewMonth.getFullYear() === today.getFullYear() && viewMonth.getMonth() === today.getMonth();

  return (
    <div style={{ padding: "0 22px" }}>
      {/* Month header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-primary)" }}>{monthLabel}</div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => setViewMonth(new Date(year, month - 1, 1))}
            style={{ padding: "4px 8px", borderRadius: 7, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center" }}
            aria-label="Previous month"
          >
            <ChevronLeft size={13} />
          </button>
          {!isCurrentMonth && (
            <button
              onClick={() => setViewMonth(new Date(today.getFullYear(), today.getMonth(), 1))}
              style={{ padding: "4px 10px", borderRadius: 7, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-secondary)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
            >
              Today
            </button>
          )}
          <button
            onClick={() => setViewMonth(new Date(year, month + 1, 1))}
            style={{ padding: "4px 8px", borderRadius: 7, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center" }}
            aria-label="Next month"
          >
            <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {/* Day of week header */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => (
          <div key={d} style={{ fontSize: 9, fontWeight: 800, color: "var(--text-muted)", letterSpacing: ".07em", textTransform: "uppercase", textAlign: "center", padding: "4px 0" }}>
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {cells.map((c, i) => {
          const key = c.date.toISOString().slice(0, 10);
          const value = valueByDate.get(key) ?? null;
          const isToday = c.date.getTime() === today.getTime();
          const isFuture = c.date.getTime() > today.getTime();
          const { bg, fg } = cellColor(value);
          const dim = !c.inMonth || isFuture;
          return (
            <button
              key={i}
              onClick={() => value != null && setSelected({ date: key, value })}
              disabled={value == null}
              title={value != null ? `${key} · ${formatMetricValue(value, unit)}` : key}
              style={{
                aspectRatio: "1 / 1",
                minHeight: 52,
                padding: "5px 6px",
                borderRadius: 8,
                background: dim ? "transparent" : bg,
                border: isToday ? "2px solid var(--accent)" : "1px solid var(--border-card)",
                cursor: value != null ? "pointer" : "default",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                alignItems: "stretch",
                textAlign: "left",
                opacity: dim ? 0.35 : 1,
                transition: "transform .12s",
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, color: c.inMonth ? "var(--text-secondary)" : "var(--text-muted)" }}>
                {c.date.getDate()}
              </div>
              {value != null ? (
                <div style={{ fontSize: 12, fontWeight: 800, color: fg, textAlign: "right", lineHeight: 1 }}>
                  {formatMetricValue(value, unit)}
                </div>
              ) : (
                <div style={{ fontSize: 9, color: "var(--text-muted)", textAlign: "right" }}>&nbsp;</div>
              )}
            </button>
          );
        })}
      </div>

      {/* Month stats */}
      <div style={{ display: "flex", gap: 18, marginTop: 12, padding: "10px 12px", background: "var(--bg-input)", borderRadius: 8 }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 800, color: "var(--text-muted)", letterSpacing: ".07em" }}>REPORTED</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)", marginTop: 2 }}>
            {daysReported}/{daysInMonth} days
          </div>
        </div>
        {target != null && target !== 0 && (
          <div>
            <div style={{ fontSize: 9, fontWeight: 800, color: "var(--text-muted)", letterSpacing: ".07em" }}>HIT TARGET</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "var(--success)", marginTop: 2 }}>
              {daysHit}/{daysReported || 0}
            </div>
          </div>
        )}
        <div style={{ flex: 1 }} />
        {daysReported === 0 && (
          <div style={{ fontSize: 11, color: "var(--text-muted)", alignSelf: "center", fontStyle: "italic" }}>
            No updates in this month yet — press <strong style={{ color: "var(--text-secondary)" }}>Update</strong> on the metric row to record today&apos;s value.
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 10, color: "var(--text-secondary)" }}>
        <Legend color="rgba(52,211,153,.35)" label="Met target" />
        <Legend color="rgba(251,191,36,.35)" label="Close" />
        <Legend color="rgba(248,113,113,.35)" label="Missed" />
        <Legend color="transparent" label="No data" border />
      </div>

      {/* Selected day popover */}
      {selected && (
        <div style={{ marginTop: 12, padding: "10px 14px", background: "var(--accent-bg)", border: "1px solid var(--accent)30", borderRadius: 8, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "var(--accent)", letterSpacing: ".07em" }}>SELECTED</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-primary)", marginTop: 2 }}>
              {new Date(selected.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
              Recorded value: <strong style={{ color: "var(--text-primary)" }}>{formatMetricValue(selected.value!, unit)}</strong>
            </div>
          </div>
          <button
            onClick={() => setSelected(null)}
            style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 18, padding: 0 }}
            aria-label="Close"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

function Legend({ color, label, border }: { color: string; label: string; border?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <div style={{ width: 11, height: 11, borderRadius: 2, background: color, border: border ? "1px solid var(--border-card)" : "none" }} />
      <span>{label}</span>
    </div>
  );
}

// ── Trend chart for value (cumulative) metrics ─────────────────────────
function CumulativeChart({
  points,
  target,
  unit,
}: {
  points: DayPoint[];
  target: number | null;
  unit: string;
}) {
  if (!points.length) return null;
  const w = 480, h = 120, pad = 8;
  const max = Math.max(...points.map(p => p.value), target ?? 0, 1);
  const min = Math.min(...points.map(p => p.value), 0);
  const range = max - min || 1;
  const xs = (i: number) => pad + (i / Math.max(points.length - 1, 1)) * (w - pad * 2);
  const ys = (v: number) => h - pad - ((v - min) / range) * (h - pad * 2);
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${xs(i)},${ys(p.value)}`).join(" ");
  const area = `${line} L${xs(points.length - 1)},${h - pad} L${xs(0)},${h - pad} Z`;

  return (
    <div style={{ padding: "0 22px" }}>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block" }}>
        {target != null && target >= min && target <= max && (
          <line
            x1={pad} x2={w - pad}
            y1={ys(target)} y2={ys(target)}
            stroke={healthColor(80)}
            strokeDasharray="4 4"
            strokeWidth={1}
          />
        )}
        <path d={area} fill="var(--accent)" opacity={0.18} />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={xs(i)} cy={ys(p.value)} r={2.5} fill="var(--accent)">
            <title>{`${p.date}: ${formatMetricValue(p.value, unit)}`}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}
