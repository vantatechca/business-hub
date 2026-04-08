import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

// GET /api/metrics/[id]/history?days=30
// Returns:
//   {
//     metric: { id, name, unit, metricType, currentValue, targetValue, ... },
//     updates: [{ date, value, delta, source, notes, userName }],
//     daily:   [{ date: "YYYY-MM-DD", value, count }]
//   }
//
// `daily` is what the calendar heatmap consumes; for daily-type metrics each
// day's last reported value is what's tracked. For value-type metrics it's the
// latest cumulative value as of that day.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { searchParams } = new URL(req.url);
  const days = Math.min(365, Math.max(1, Number(searchParams.get("days") ?? 30)));

  // Compute the "since" timestamp in JS so we never do interval arithmetic in
  // SQL — that used to throw 500s on certain Postgres/Neon param-typing paths.
  const since = new Date(Date.now() - days * 86400 * 1000).toISOString();

  try {
    const metricRows = await sql`
      SELECT m.*, d.name AS department_name
      FROM metrics m
      LEFT JOIN departments d ON d.id = m.department_id
      WHERE m.id = ${params.id}
    `;
    if (!metricRows.length) {
      return NextResponse.json({ error: "Metric not found" }, { status: 404 });
    }
    const m = metricRows[0] as Record<string, unknown>;

    const updateRows = await sql`
      SELECT mu.id, mu.created_at, mu.old_value, mu.new_value, mu.delta, mu.source, mu.notes,
             u.name AS user_name
      FROM metric_updates mu
      LEFT JOIN users u ON u.id = mu.user_id
      WHERE mu.metric_id = ${params.id}
        AND mu.created_at >= ${since}
      ORDER BY mu.created_at ASC
    `;

    // Group by YYYY-MM-DD, keep the LAST value reported on each day (option A)
    const byDay = new Map<string, { date: string; value: number; count: number }>();
    for (const r of updateRows as Record<string, unknown>[]) {
      const ts = r.created_at as Date | string;
      const date = new Date(ts).toISOString().slice(0, 10);
      const value = Number(r.new_value);
      const existing = byDay.get(date);
      if (existing) {
        existing.value = value; // last write wins
        existing.count += 1;
      } else {
        byDay.set(date, { date, value, count: 1 });
      }
    }

    return NextResponse.json({
      metric: {
        id: m.id,
        name: m.name,
        unit: m.unit,
        metricType: m.metric_type,
        direction: m.direction,
        currentValue: Number(m.current_value),
        previousValue: Number(m.previous_value),
        targetValue: m.target_value != null ? Number(m.target_value) : null,
        priorityScore: m.priority_score,
        notes: m.notes,
        departmentName: m.department_name,
      },
      updates: (updateRows as Record<string, unknown>[]).map(r => ({
        id: r.id,
        date: new Date(r.created_at as Date | string).toISOString(),
        oldValue: r.old_value != null ? Number(r.old_value) : null,
        newValue: Number(r.new_value),
        delta: r.delta != null ? Number(r.delta) : null,
        source: r.source,
        notes: r.notes,
        userName: r.user_name,
      })),
      daily: Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date)),
    });
  } catch (e: unknown) {
    console.error("[metrics/[id]/history] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
