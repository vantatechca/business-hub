import { NextRequest, NextResponse } from "next/server";
import { sql, rowsToCamel } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const deptId = searchParams.get("departmentId");
  const userId = searchParams.get("userId");
  try {
    let rows;
    if (userId) {
      rows = await sql`SELECT m.*, d.name AS department_name, d.color AS department_color FROM metrics m JOIN departments d ON d.id = m.department_id JOIN metric_assignments ma ON ma.metric_id = m.id WHERE ma.user_id = ${userId} ORDER BY m.priority_score DESC`;
    } else if (deptId) {
      rows = await sql`SELECT m.*, d.name AS department_name, d.color AS department_color FROM metrics m JOIN departments d ON d.id = m.department_id WHERE m.department_id = ${deptId} ORDER BY m.priority_score DESC, m.sort_order ASC`;
    } else {
      rows = await sql`SELECT m.*, d.name AS department_name, d.color AS department_color FROM metrics m JOIN departments d ON d.id = m.department_id ORDER BY d.priority_score DESC, m.priority_score DESC, m.sort_order ASC`;
    }
    return NextResponse.json({ data: rowsToCamel(rows as Record<string,unknown>[]) });
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
