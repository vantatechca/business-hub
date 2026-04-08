import { NextRequest, NextResponse } from "next/server";
import { sql, toCamel } from "@/lib/db";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const rows = await sql`
      SELECT u.*, ARRAY_AGG(DISTINCT jsonb_build_object('metricId', ma.metric_id, 'metricName', m.name, 'role', ma.role_in_metric)) FILTER (WHERE ma.id IS NOT NULL) AS assignments
      FROM users u
      LEFT JOIN metric_assignments ma ON ma.user_id = u.id
      LEFT JOIN metrics m ON m.id = ma.metric_id
      WHERE u.id = ${params.id} GROUP BY u.id
    `;
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ data: toCamel(rows[0] as Record<string,unknown>) });
  } catch(e: unknown) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json();
  try {
    const rows = await sql`
      UPDATE users SET
        name = COALESCE(${b.name ?? null}, name),
        role = COALESCE(${b.role ?? null}, role),
        is_active = COALESCE(${b.isActive ?? null}, is_active),
        timezone = COALESCE(${b.timezone ?? null}, timezone),
        updated_at = NOW()
      WHERE id = ${params.id} RETURNING id, email, name, role, is_active, timezone
    `;
    return NextResponse.json({ data: toCamel(rows[0] as Record<string,unknown>) });
  } catch(e: unknown) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await sql`UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = ${params.id}`;
    return NextResponse.json({ message: "Deactivated" });
  } catch(e: unknown) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
