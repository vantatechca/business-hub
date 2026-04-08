"use client";
import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import type { Metric } from "@/lib/types";
import { formatMetricValue, healthColor } from "@/lib/types";

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
interface HistoryResponse {
  metric: Metric & { departmentName?: string };
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
  const [days, setDays] = useState<30 | 60 | 90>(30);

  useEffect(() => {
    if (!open || !metric) return;
    setLoading(true);
    setData(null);
    fetch(`/api/metrics/${metric.id}/history?days=${days}`)
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

        <div style={{ padding: "16px 22px", display: "flex", gap: 18 }}>
          <Stat label="Current" value={formatMetricValue(metric.currentValue, metric.unit)} color="var(--accent)" />
          {metric.targetValue != null && (
            <Stat label="Target" value={formatMetricValue(metric.targetValue, metric.unit)} color="var(--text-primary)" />
          )}
          <Stat label="Type" value={metric.metricType.replace(/_/g, " ")} color="var(--text-secondary)" />
        </div>

        {loading && (
          <div style={{ padding: 36, textAlign: "center", color: "var(--text-secondary)", fontSize: 12 }}>
            <Loader2 size={18} style={{ animation: "spin 1s linear infinite", display: "inline-block", marginBottom: 8 }} />
            <div>Loading history…</div>
          </div>
        )}

        {!loading && data && (
          <>
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

            {isDaily ? (
              <CalendarHeatmap
                days={days}
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

// ── Calendar heatmap for daily metrics ─────────────────────────────────
function CalendarHeatmap({
  days,
  points,
  target,
  unit,
  direction,
}: {
  days: number;
  points: DayPoint[];
  target: number | null;
  unit: string;
  direction: "higher_better" | "lower_better";
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(today.getDate() - (days - 1));

  const map = new Map(points.map(p => [p.date, p]));
  const cells: { date: string; value: number | null }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    const p = map.get(key);
    cells.push({ date: key, value: p ? p.value : null });
  }

  // Color mapping: hit target = green, partial = yellow, miss = red, no data = neutral
  const cellColor = (v: number | null): string => {
    if (v == null) return "var(--bg-input)";
    if (target == null || target === 0) return v > 0 ? "var(--accent)" : "var(--text-muted)";
    const ratio = v / target;
    const hit = direction === "higher_better" ? ratio >= 1 : ratio <= 1;
    if (hit) return "var(--success)";
    if (direction === "higher_better") {
      if (ratio >= 0.7) return "var(--warning)";
      return "var(--danger)";
    } else {
      if (ratio <= 1.3) return "var(--warning)";
      return "var(--danger)";
    }
  };

  // Pad to align to weeks: figure out the day-of-week of the start cell
  const startDow = (new Date(cells[0].date).getDay() + 6) % 7; // 0 = Monday
  const padded: ({ date: string; value: number | null } | null)[] = [
    ...Array(startDow).fill(null),
    ...cells,
  ];
  // Group into weeks (columns of 7)
  const weeks: ({ date: string; value: number | null } | null)[][] = [];
  for (let i = 0; i < padded.length; i += 7) {
    weeks.push(padded.slice(i, i + 7));
  }

  const cellSize = 14;
  const gap = 3;

  return (
    <div style={{ padding: "0 22px 8px" }}>
      <div style={{ overflowX: "auto", paddingBottom: 6 }}>
        <div style={{ display: "flex", gap }}>
          {/* Day-of-week labels */}
          <div style={{ display: "flex", flexDirection: "column", gap, paddingTop: 16, fontSize: 9, color: "var(--text-muted)", marginRight: 4 }}>
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <div key={i} style={{ height: cellSize, lineHeight: `${cellSize}px` }}>{d}</div>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} style={{ display: "flex", flexDirection: "column", gap }}>
              <div style={{ height: 14, fontSize: 9, color: "var(--text-muted)", textAlign: "center" }}>
                {wi === 0 || (week[0] && new Date(week[0].date).getDate() <= 7)
                  ? new Date((week.find(c => c) as { date: string }).date).toLocaleString(undefined, { month: "short" })
                  : ""}
              </div>
              {week.map((cell, ci) => {
                if (!cell) return <div key={ci} style={{ width: cellSize, height: cellSize }} />;
                const bg = cellColor(cell.value);
                return (
                  <div
                    key={ci}
                    title={`${cell.date}${cell.value != null ? ` · ${formatMetricValue(cell.value, unit)}` : " · no data"}`}
                    style={{
                      width: cellSize,
                      height: cellSize,
                      borderRadius: 3,
                      background: bg,
                      border: cell.value == null ? "1px solid var(--border-card)" : "none",
                      cursor: "default",
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 10, color: "var(--text-secondary)" }}>
        <Legend color="var(--success)" label="Met target" />
        <Legend color="var(--warning)" label="Close" />
        <Legend color="var(--danger)" label="Missed" />
        <Legend color="var(--bg-input)" label="No data" border />
      </div>
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
