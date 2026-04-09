import { NextRequest, NextResponse } from "next/server";
import { sql, rowsToCamel, toDateString } from "@/lib/db";
import { getSessionUser, isManagerOrHigher, getUserScope } from "@/lib/authz";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Postgres DECIMAL columns come back as strings; coerce to numbers so the UI
// can do math and call toFixed without crashing.
const NUMERIC_FIELDS = ["currentValue", "previousValue", "thirtyDayTotal", "targetValue"] as const;
function coerceMetric(m: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...m };
  for (const f of NUMERIC_FIELDS) {
    if (out[f] != null) out[f] = Number(out[f]);
  }
  // Postgres DATE → "YYYY-MM-DD" string for the UI date picker.
  if (out.dueDate != null) out.dueDate = toDateString(out.dueDate);
  return out;
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
      // Explicit "metrics for THIS user" lookup. The /assignments page uses
      // this; auth gating is handled there. Behave as before.
      rows = await sql`SELECT m.*, d.name AS department_name, d.color AS department_color FROM metrics m JOIN departments d ON d.id = m.department_id JOIN metric_assignments ma ON ma.metric_id = m.id WHERE ma.user_id = ${userId} ORDER BY m.sort_order ASC, m.priority_score DESC`;
    } else if (deptId) {
      rows = await sql`SELECT m.*, d.name AS department_name, d.color AS department_color FROM metrics m JOIN departments d ON d.id = m.department_id WHERE m.department_id = ${deptId} ORDER BY m.sort_order ASC, m.priority_score DESC`;
    } else if (!me || isManagerOrHigher(me.role)) {
      rows = await sql`SELECT m.*, d.name AS department_name, d.color AS department_color FROM metrics m JOIN departments d ON d.id = m.department_id ORDER BY d.sort_order ASC, m.sort_order ASC`;
    } else {
      // Lead and member: metrics in a department they belong to (any role)
      // OR metrics they personally have an assignment to.
      const scope = await getUserScope(me.id);
      rows = await sql`
        SELECT m.*, d.name AS department_name, d.color AS department_color
        FROM metrics m
        JOIN departments d ON d.id = m.department_id
        WHERE m.department_id::text = ANY(${scope.departmentIds}::text[])
           OR m.id::text = ANY(${scope.metricIds}::text[])
        ORDER BY d.sort_order ASC, m.sort_order ASC
      `;
    }
    return NextResponse.json({ data: rowsToCamel(rows as Record<string,unknown>[]).map(coerceMetric) });
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
    const rows = await sql`
      INSERT INTO metrics (department_id, name, metric_type, direction, current_value, target_value, unit, priority_score, notes, sort_order, due_date)
      VALUES (${b.departmentId}, ${b.name}, ${b.metricType ?? "value"}, ${b.direction ?? "higher_better"}, ${b.currentValue ?? 0}, ${b.targetValue ?? null}, ${b.unit ?? "count"}, ${b.priorityScore ?? 50}, ${b.notes ?? null}, ${b.sortOrder ?? 99}, ${b.dueDate || null})
      RETURNING *
    `;
    return NextResponse.json({ data: rows[0] }, { status: 201 });
  } catch(e: unknown) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
