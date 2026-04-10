import { NextRequest, NextResponse } from "next/server";
import { sql, rowsToCamel } from "@/lib/db";

function shape(r: Record<string, unknown>): Record<string, unknown> {
  return { ...r, target: Number(r.target), current: Number(r.current) };
}

export async function GET() {
  try {
    const rows = await sql`
      SELECT id, name, target, current, format, currency, color, notes, sort_order, created_at, updated_at
      FROM goals ORDER BY sort_order ASC, created_at ASC
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
    const rows = await sql`
      INSERT INTO goals (name, target, current, format, currency, color, notes)
      VALUES (
        ${b.name},
        ${Number(b.target) || 0},
        ${Number(b.current) || 0},
        ${b.format ?? "number"},
        ${b.currency ?? "USD"},
        ${b.color ?? "#5b8ef8"},
        ${b.notes ?? null}
      )
      RETURNING id, name, target, current, format, currency, color, notes, sort_order
    `;
    return NextResponse.json({ data: shape(rows[0] as Record<string, unknown>) }, { status: 201 });
  } catch (e: unknown) {
    console.error("[goals/POST] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
