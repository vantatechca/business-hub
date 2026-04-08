import { NextRequest, NextResponse } from "next/server";
import { sql, rowsToCamel, toCamel } from "@/lib/db";
import { getInitials } from "@/lib/types";

function shape(row: Record<string, unknown>): Record<string, unknown> {
  const o = toCamel<Record<string, unknown>>(row);
  if (o.dueDate) o.dueDate = String(o.dueDate).slice(0, 10);
  if (o.assigneeName) o.assigneeInitials = getInitials(o.assigneeName as string);
  return o;
}

export async function GET() {
  try {
    const rows = await sql`
      SELECT t.id, t.title, t.priority, t.status, t.department_id, t.assignee_id,
             t.due_date, t.sort_order, t.created_at, t.updated_at,
             d.name AS department_name,
             u.name AS assignee_name
      FROM tasks t
      LEFT JOIN departments d ON d.id = t.department_id
      LEFT JOIN users       u ON u.id = t.assignee_id
      ORDER BY t.sort_order ASC, t.created_at DESC
    `;
    return NextResponse.json({ data: rowsToCamel<Record<string, unknown>>(rows as Record<string, unknown>[]).map(shape) });
  } catch (e: unknown) {
    console.error("[tasks/GET] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const b = await req.json();
  if (!b.title) return NextResponse.json({ error: "title required" }, { status: 400 });
  try {
    const inserted = await sql`
      INSERT INTO tasks (title, priority, status, department_id, assignee_id, due_date)
      VALUES (
        ${b.title},
        ${b.priority ?? "medium"},
        ${b.status ?? "todo"},
        ${b.departmentId || null},
        ${b.assigneeId || null},
        ${b.dueDate || null}
      )
      RETURNING id
    `;
    const id = (inserted[0] as Record<string, unknown>).id as string;
    const rows = await sql`
      SELECT t.id, t.title, t.priority, t.status, t.department_id, t.assignee_id,
             t.due_date, t.sort_order, t.created_at, t.updated_at,
             d.name AS department_name,
             u.name AS assignee_name
      FROM tasks t
      LEFT JOIN departments d ON d.id = t.department_id
      LEFT JOIN users       u ON u.id = t.assignee_id
      WHERE t.id = ${id}
    `;
    return NextResponse.json({ data: shape(rows[0] as Record<string, unknown>) }, { status: 201 });
  } catch (e: unknown) {
    console.error("[tasks/POST] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
