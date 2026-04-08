import { NextRequest, NextResponse } from "next/server";
import { sql, toCamel } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json();
  try {
    if (b.currentValue !== undefined) {
      const curr = await sql`SELECT current_value FROM metrics WHERE id = ${params.id}`;
      if (curr.length) {
        await sql`INSERT INTO metric_updates (metric_id, user_id, source, old_value, new_value, notes) VALUES (${params.id}, ${b.userId ?? null}, ${b.source ?? "manual"}, ${curr[0].current_value}, ${b.currentValue}, ${b.notes ?? null})`;
      }
    }
    const rows = await sql`
      UPDATE metrics SET
        current_value = COALESCE(${b.currentValue ?? null}, current_value),
        previous_value = CASE WHEN ${b.currentValue ?? null} IS NOT NULL THEN current_value ELSE previous_value END,
        target_value = COALESCE(${b.targetValue ?? null}, target_value),
        name = COALESCE(${b.name ?? null}, name),
        notes = COALESCE(${b.notes ?? null}, notes),
        priority_score = COALESCE(${b.priorityScore ?? null}, priority_score),
        updated_at = NOW()
      WHERE id = ${params.id} RETURNING *
    `;
    return NextResponse.json({ data: toCamel(rows[0] as Record<string,unknown>) });
  } catch(e: unknown) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await sql`DELETE FROM metrics WHERE id = ${params.id}`;
    return NextResponse.json({ message: "Deleted" });
  } catch(e: unknown) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
