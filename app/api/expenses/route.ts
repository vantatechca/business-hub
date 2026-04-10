import { NextRequest, NextResponse } from "next/server";
import { sql, rowsToCamel, toCamel } from "@/lib/db";

function shape(r: Record<string, unknown>): Record<string, unknown> {
  return { ...r, amount: Number(r.amount) };
}

const ALLOWED_CURRENCIES = new Set(["USD", "CAD"]);

export async function GET() {
  try {
    const rows = await sql`
      SELECT e.id, e.amount, e.currency, e.department_id, e.description, e.month, e.year, e.entry_date, e.created_at,
             d.name AS department_name
      FROM expense_entries e
      LEFT JOIN departments d ON d.id::text = e.department_id::text
      ORDER BY e.entry_date DESC NULLS LAST, e.year DESC, e.created_at DESC
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
  const currency = ALLOWED_CURRENCIES.has(b.currency) ? b.currency : "USD";
  try {
    const inserted = await sql`
      INSERT INTO expense_entries (amount, currency, department_id, description, month, year, entry_date)
      VALUES (
        ${Number(b.amount) || 0},
        ${currency},
        ${b.departmentId || null},
        ${b.description ?? ""},
        ${b.month ?? null},
        ${Number(b.year) || new Date().getFullYear()},
        ${b.entryDate || null}
      )
      RETURNING id
    `;
    const id = (inserted[0] as Record<string, unknown>).id as string;
    const rows = await sql`
      SELECT e.id, e.amount, e.currency, e.department_id, e.description, e.month, e.year, e.entry_date, e.created_at,
             d.name AS department_name
      FROM expense_entries e
      LEFT JOIN departments d ON d.id::text = e.department_id::text
      WHERE e.id = ${id}
    `;
    return NextResponse.json({ data: shape(toCamel(rows[0] as Record<string, unknown>)) }, { status: 201 });
  } catch (e: unknown) {
    console.error("[expenses/POST] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
