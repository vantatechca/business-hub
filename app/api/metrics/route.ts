import { NextRequest, NextResponse } from "next/server";
import { sql, rowsToCamel } from "@/lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Postgres DECIMAL columns come back as strings; coerce to numbers so the UI
// can do math and call toFixed without crashing.
const NUMERIC_FIELDS = ["currentValue", "previousValue", "thirtyDayTotal", "targetValue"] as const;
function coerceMetric(m: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...m };
  for (const f of NUMERIC_FIELDS) {
    if (out[f] != null) out[f] = Number(out[f]);
  }
  return out;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const deptId = searchParams.get("departmentId");
  const userId = searchParams.get("userId");
  // Demo/fallback users don't have UUIDs — skip DB query and return empty list.
  if (userId && !UUID_RE.test(userId)) return NextResponse.json({ data: [] });
  try {
    let rows;
    if (userId) {
      rows = await sql`SELECT m.*, d.name AS department_name, d.color AS department_color FROM metrics m JOIN departments d ON d.id = m.department_id JOIN metric_assignments ma ON ma.metric_id = m.id WHERE ma.user_id = ${userId} ORDER BY m.sort_order ASC, m.priority_score DESC`;
    } else if (deptId) {
      rows = await sql`SELECT m.*, d.name AS department_name, d.color AS department_color FROM metrics m JOIN departments d ON d.id = m.department_id WHERE m.department_id = ${deptId} ORDER BY m.sort_order ASC, m.priority_score DESC`;
    } else {
      rows = await sql`SELECT m.*, d.name AS department_name, d.color AS department_color FROM metrics m JOIN departments d ON d.id = m.department_id ORDER BY d.sort_order ASC, m.sort_order ASC`;
    }
    return NextResponse.json({ data: rowsToCamel(rows as Record<string,unknown>[]).map(coerceMetric) });
  } catch { return NextResponse.json({ error: "DB not configured" }, { status: 503 }); }
}

export async function POST(req: NextRequest) {
  const b = await req.json();
  try {
    const rows = await sql`
      INSERT INTO metrics (department_id, name, metric_type, direction, current_value, target_value, unit, priority_score, notes, sort_order)
      VALUES (${b.departmentId}, ${b.name}, ${b.metricType ?? "value"}, ${b.direction ?? "higher_better"}, ${b.currentValue ?? 0}, ${b.targetValue ?? null}, ${b.unit ?? "count"}, ${b.priorityScore ?? 50}, ${b.notes ?? null}, ${b.sortOrder ?? 99})
      RETURNING *
    `;
    return NextResponse.json({ data: rows[0] }, { status: 201 });
  } catch(e: unknown) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
