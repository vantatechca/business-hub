import { NextRequest, NextResponse } from "next/server";
import { sql, rowsToCamel, toCamel } from "@/lib/db";

function shape(r: Record<string, unknown>): Record<string, unknown> {
  return { ...r, amount: Number(r.amount) };
}

const ALLOWED_CURRENCIES = new Set(["USD", "CAD"]);

export async function GET() {
  try {
    const rows = await sql`
      SELECT r.*, d.name AS department_name
      FROM revenue_entries r
      LEFT JOIN departments d ON d.id::text = r.department_id::text
      ORDER BY r.year DESC, r.created_at DESC
    `;
    return NextResponse.json({ data: rowsToCamel<Record<string, unknown>>(rows as Record<string, unknown>[]).map(shape) });
  } catch (e: unknown) {
    console.error("[revenue/GET] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const b = await req.json();
  if (b.amount == null) return NextResponse.json({ error: "amount required" }, { status: 400 });
  const currency = ALLOWED_CURRENCIES.has(b.currency) ? b.currency : "USD";
  try {
    let inserted;
    try {
      inserted = await sql`
        INSERT INTO revenue_entries (amount, currency, department_id, description, month, year, entry_date)
        VALUES (${Number(b.amount) || 0}, ${currency}, ${b.departmentId || null},
                ${b.description ?? ""}, ${b.month ?? null},
                ${Number(b.year) || new Date().getFullYear()}, ${b.entryDate || null})
        RETURNING id
      `;
    } catch {
      inserted = await sql`
        INSERT INTO revenue_entries (amount, currency, department_id, description, month, year)
        VALUES (${Number(b.amount) || 0}, ${currency}, ${b.departmentId || null},
                ${b.description ?? ""}, ${b.month ?? null},
                ${Number(b.year) || new Date().getFullYear()})
        RETURNING id
      `;
    }
    const id = (inserted[0] as Record<string, unknown>).id as string;
    const rows = await sql`
      SELECT r.*, d.name AS department_name
      FROM revenue_entries r
      LEFT JOIN departments d ON d.id::text = r.department_id::text
      WHERE r.id = ${id}
    `;
    return NextResponse.json({ data: shape(toCamel(rows[0] as Record<string, unknown>)) }, { status: 201 });
  } catch (e: unknown) {
    console.error("[revenue/POST] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
