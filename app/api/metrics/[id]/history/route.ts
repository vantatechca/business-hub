import { NextRequest, NextResponse } from "next/server";
import { sql, toDateString } from "@/lib/db";
import { getInitials } from "@/lib/types";

// GET /api/metrics/[id]/history?days=30
// Returns:
//   {
//     metric: { id, name, unit, metricType, currentValue, targetValue, ... },
//     updates: [{ date, value, delta, source, notes, userName }],
//     daily:   [{ date: "YYYY-MM-DD", value, count }]
//   }
//
// `daily` is what the month calendar consumes — for each day we keep the last
// value reported that day. The metric_updates query is wrapped in its own
// try/catch so that even if the audit table has a schema drift (missing
// `delta` column, etc.) the drawer still shows the calendar header + an empty
// month instead of a 500.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { searchParams } = new URL(req.url);
  const days = Math.min(365, Math.max(1, Number(searchParams.get("days") ?? 30)));

  // Compute the "since" timestamp in JS so we don't do interval arithmetic in SQL
  const since = new Date(Date.now() - days * 86400 * 1000).toISOString();

  try {
    const metricRows = await sql`
      SELECT m.*, d.name AS department_name
      FROM metrics m
      LEFT JOIN departments d ON d.id::text = m.department_id::text
      WHERE m.id::text = ${params.id}
    `;
    if (!metricRows.length) {
      return NextResponse.json({ error: "Metric not found" }, { status: 404 });
    }
    const m = metricRows[0] as Record<string, unknown>;

    // Separate the updates query so a failure there doesn't kill the whole
    // response. We don't SELECT mu.delta — it's a generated column in the
    // canonical schema but may be missing in DBs that pre-date that migration.
    // Compute delta in JS from old_value / new_value instead. We also skip
    // the users JOIN — fetching user_name was non-essential and triggered
    // type-mismatch failures on DBs where users.id / metric_updates.user_id
    // don't line up.
    let updateRows: Record<string, unknown>[] = [];
    try {
      updateRows = (await sql`
        SELECT mu.id, mu.created_at, mu.old_value, mu.new_value, mu.source, mu.notes
        FROM metric_updates mu
        WHERE mu.metric_id::text = ${params.id}
          AND mu.created_at >= ${since}::timestamptz
        ORDER BY mu.created_at ASC
      `) as Record<string, unknown>[];
    } catch (e) {
      console.warn("[metrics/[id]/history] metric_updates query failed (non-fatal):", (e as Error).message);
      updateRows = [];
    }

    // Group by YYYY-MM-DD — last value reported on each day
    const byDay = new Map<string, { date: string; value: number; count: number }>();
    for (const r of updateRows) {
      const ts = r.created_at as Date | string;
      const date = new Date(ts).toISOString().slice(0, 10);
      const value = Number(r.new_value);
      const existing = byDay.get(date);
      if (existing) {
        existing.value = value;
        existing.count += 1;
      } else {
        byDay.set(date, { date, value, count: 1 });
      }
    }

    // Assignees — wrapped in try/catch because the metric_assignments join can
    // fail on DBs with mixed id types. A failure here just means the drawer
    // shows "no assignees" instead of 500-ing.
    let assignees: { userId: string; name: string; initials: string; roleInMetric: string }[] = [];
    try {
      const assigneeRows = (await sql`
        SELECT ma.user_id, ma.role_in_metric, u.name
        FROM metric_assignments ma
        JOIN users u ON u.id = ma.user_id
        WHERE ma.metric_id::text = ${params.id}
        ORDER BY u.name
      `) as Record<string, unknown>[];
      assignees = assigneeRows.map(r => ({
        userId: r.user_id as string,
        name: r.name as string,
        initials: getInitials(r.name as string),
        roleInMetric: (r.role_in_metric as string) ?? "contributor",
      }));
    } catch (e) {
      console.warn("[metrics/[id]/history] assignee lookup failed (non-fatal):", (e as Error).message);
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
        dueDate: toDateString(m.due_date),
        departmentName: m.department_name,
        assignees,
      },
      updates: updateRows.map(r => {
        const oldV = r.old_value != null ? Number(r.old_value) : null;
        const newV = Number(r.new_value);
        return {
          id: r.id,
          date: new Date(r.created_at as Date | string).toISOString(),
          oldValue: oldV,
          newValue: newV,
          delta: oldV != null ? newV - oldV : null,
          source: r.source,
          notes: r.notes,
          userName: null,
        };
      }),
      daily: Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date)),
    });
  } catch (e: unknown) {
    console.error("[metrics/[id]/history] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
