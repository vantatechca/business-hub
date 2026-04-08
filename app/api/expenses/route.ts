import { NextRequest, NextResponse } from "next/server";
import { sql, rowsToCamel, toCamel } from "@/lib/db";

function shape(r: Record<string, unknown>): Record<string, unknown> {
  return { ...r, amount: Number(r.amount) };
}

export async function GET() {
  try {
    const rows = await sql`
      SELECT e.id, e.amount, e.department_id, e.description, e.month, e.year, e.created_at,
             d.name AS department_name
      FROM expense_entries e
      LEFT JOIN departments d ON d.id = e.department_id
      ORDER BY e.year DESC, e.created_at DESC
    `;
    return NextResponse.json({ data: rowsToCamel<Record<string, unknown>>(rows as Record<string, unknown>[]).map(shape) });
  } catch (e: unknown) {
    console.error("[expenses/GET] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const b = await req.json();
  if (b.amount == null) return NextResponse.json({ error: "amount required" }, { status: 400 });
  try {
    const inserted = await sql`
      INSERT INTO expense_entries (amount, department_id, description, month, year)
      VALUES (
        ${Number(b.amount) || 0},
        ${b.departmentId || null},
        ${b.description ?? ""},
        ${b.month ?? null},
        ${Number(b.year) || new Date().getFullYear()}
      )
      RETURNING id
    `;
    const id = (inserted[0] as Record<string, unknown>).id as string;
    const rows = await sql`
      SELECT e.id, e.amount, e.department_id, e.description, e.month, e.year, e.created_at,
             d.name AS department_name
      FROM expense_entries e
      LEFT JOIN departments d ON d.id = e.department_id
      WHERE e.id = ${id}
    `;
    return NextResponse.json({ data: shape(toCamel(rows[0] as Record<string, unknown>)) }, { status: 201 });
  } catch (e: unknown) {
    console.error("[expenses/POST] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
