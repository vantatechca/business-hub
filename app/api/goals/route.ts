import { NextRequest, NextResponse } from "next/server";
import { sql, rowsToCamel } from "@/lib/db";

function shape(r: Record<string, unknown>): Record<string, unknown> {
  return { ...r, target: Number(r.target), current: Number(r.current) };
}

export async function GET() {
  try {
    // Use SELECT * so the query works whether or not the currency column
    // has been added yet (the additive migration in setup-db.js adds it).
    const rows = await sql`
      SELECT * FROM goals ORDER BY sort_order ASC, created_at ASC
    `;
    return NextResponse.json({ data: rowsToCamel<Record<string, unknown>>(rows as Record<string, unknown>[]).map(shape) });
  } catch (e: unknown) {
    console.error("[goals/GET] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const b = await req.json();
  if (!b.name) return NextResponse.json({ error: "name required" }, { status: 400 });
  try {
    // Try with currency column first; fall back without it if the
    // additive migration hasn't run yet.
    let rows;
    try {
      rows = await sql`
        INSERT INTO goals (name, target, current, format, currency, color, notes)
        VALUES (${b.name}, ${Number(b.target) || 0}, ${Number(b.current) || 0},
                ${b.format ?? "number"}, ${b.currency ?? "USD"},
                ${b.color ?? "#5b8ef8"}, ${b.notes ?? null})
        RETURNING *
      `;
    } catch {
      rows = await sql`
        INSERT INTO goals (name, target, current, format, color, notes)
        VALUES (${b.name}, ${Number(b.target) || 0}, ${Number(b.current) || 0},
                ${b.format ?? "number"}, ${b.color ?? "#5b8ef8"}, ${b.notes ?? null})
        RETURNING *
      `;
    }
    return NextResponse.json({ data: shape(rows[0] as Record<string, unknown>) }, { status: 201 });
  } catch (e: unknown) {
    console.error("[goals/POST] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
