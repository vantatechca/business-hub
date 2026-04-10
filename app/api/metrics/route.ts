import { NextRequest, NextResponse } from "next/server";
import { sql, rowsToCamel, toDateString } from "@/lib/db";
import { getSessionUser, isManagerOrHigher, getUserScope } from "@/lib/authz";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Postgres DECIMAL columns come back as strings; coerce to numbers so the UI
// can do math and call toFixed without crashing.
const NUMERIC_FIELDS = ["currentValue", "previousValue", "thirtyDayTotal", "weeklyTotal", "overallTotal", "targetValue"] as const;
function coerceMetric(m: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...m };
  for (const f of NUMERIC_FIELDS) {
    if (out[f] != null) out[f] = Number(out[f]);
  }
  // Postgres DATE → "YYYY-MM-DD" string for the UI date picker.
  if (out.dueDate != null) out.dueDate = toDateString(out.dueDate);
  return out;
}

/**
 * Enrich metric rows with weeklyTotal and overallTotal computed from
 * metric_contributions. For metrics with no contribution history, both
 * default to 0 (falls back to current_value in the UI for overall).
 */
async function enrichTotals(metrics: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  if (!metrics.length) return metrics;
  try {
    const ids = metrics.map(m => String(m.id ?? m.Id ?? ""));
    const totalRows = await sql`
      SELECT
        metric_id,
        COALESCE(SUM(value) FILTER (WHERE contribution_date >= CURRENT_DATE - INTERVAL '6 days'), 0) AS weekly_total,
        COALESCE(SUM(value), 0) AS overall_total
      FROM metric_contributions
      WHERE metric_id::text = ANY(${ids}::text[])
      GROUP BY metric_id
    `;
    const totalsMap = new Map<string, { weekly: number; overall: number }>();
    for (const r of totalRows as { metric_id: string; weekly_total: string; overall_total: string }[]) {
      totalsMap.set(String(r.metric_id), {
        weekly: Number(r.weekly_total) || 0,
        overall: Number(r.overall_total) || 0,
      });
    }
    return metrics.map(m => {
      const totals = totalsMap.get(String(m.id));
      return {
        ...m,
        weeklyTotal: totals?.weekly ?? 0,
        overallTotal: totals?.overall ?? Number(m.currentValue) ?? 0,
      };
    });
  } catch (e) {
    console.warn("[metrics] enrichTotals failed:", e);
    return metrics.map(m => ({ ...m, weeklyTotal: 0, overallTotal: Number(m.currentValue) ?? 0 }));
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const deptId = searchParams.get("departmentId");
  const userId = searchParams.get("userId");
  // Demo/fallback users don't have UUIDs — skip DB query and return empty list.
  if (userId && !UUID_RE.test(userId)) return NextResponse.json({ data: [] });
  try {
    const me = await getSessionUser();
    let rows;
    if (userId) {
      rows = await sql`SELECT m.*, d.name AS department_name, d.color AS department_color FROM metrics m LEFT JOIN departments d ON d.id = m.department_id JOIN metric_assignments ma ON ma.metric_id = m.id WHERE ma.user_id = ${userId} ORDER BY m.sort_order ASC, m.priority_score DESC`;
    } else if (deptId) {
      if (deptId === "__general__") {
        rows = await sql`SELECT m.*, NULL AS department_name, NULL AS department_color FROM metrics m WHERE m.department_id IS NULL ORDER BY m.sort_order ASC, m.priority_score DESC`;
      } else {
        rows = await sql`SELECT m.*, d.name AS department_name, d.color AS department_color FROM metrics m LEFT JOIN departments d ON d.id = m.department_id WHERE m.department_id = ${deptId} ORDER BY m.sort_order ASC, m.priority_score DESC`;
      }
    } else if (!me || isManagerOrHigher(me.role)) {
      rows = await sql`SELECT m.*, d.name AS department_name, d.color AS department_color FROM metrics m LEFT JOIN departments d ON d.id = m.department_id ORDER BY d.sort_order ASC NULLS LAST, m.sort_order ASC`;
    } else {
      const scope = await getUserScope(me.id);
      rows = await sql`
        SELECT m.*, d.name AS department_name, d.color AS department_color
        FROM metrics m
        LEFT JOIN departments d ON d.id = m.department_id
        WHERE m.department_id IS NULL
           OR m.department_id::text = ANY(${scope.departmentIds}::text[])
           OR m.id::text = ANY(${scope.metricIds}::text[])
        ORDER BY d.sort_order ASC NULLS LAST, m.sort_order ASC
      `;
    }
    const camelRows = rowsToCamel(rows as Record<string, unknown>[]);
    const enriched = await enrichTotals(camelRows);
    return NextResponse.json({ data: enriched.map(coerceMetric) });
  } catch { return NextResponse.json({ error: "DB not configured" }, { status: 503 }); }
}

export async function POST(req: NextRequest) {
  // Metric create is manager+ only.
  const me = await getSessionUser();
  if (!isManagerOrHigher(me?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const b = await req.json();
  try {
    const deptId = b.departmentId && b.departmentId !== "__general__" ? b.departmentId : null;
    const rows = await sql`
      INSERT INTO metrics (department_id, name, metric_type, direction, current_value, target_value, unit, priority_score, notes, sort_order, due_date)
      VALUES (${deptId}, ${b.name}, ${b.metricType ?? "value"}, ${b.direction ?? "higher_better"}, ${b.currentValue ?? 0}, ${b.targetValue ?? null}, ${b.unit ?? "count"}, ${b.priorityScore ?? 50}, ${b.notes ?? null}, ${b.sortOrder ?? 99}, ${b.dueDate || null})
      RETURNING *
    `;
    return NextResponse.json({ data: rows[0] }, { status: 201 });
  } catch(e: unknown) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
