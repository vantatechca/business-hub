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
    // Conditional updates per field to avoid COALESCE NULL type-inference issues.
    if (b.name      !== undefined) await sql`UPDATE users SET name = ${b.name}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.role      !== undefined) await sql`UPDATE users SET role = ${b.role}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.isActive  !== undefined) await sql`UPDATE users SET is_active = ${!!b.isActive}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.timezone  !== undefined) await sql`UPDATE users SET timezone = ${b.timezone}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.birthday  !== undefined) {
      // Allow clearing with null / empty string
      const bd = b.birthday ? b.birthday : null;
      await sql`UPDATE users SET birthday = ${bd}, updated_at = NOW() WHERE id = ${params.id}`;
    }
    const rows = await sql`SELECT id, email, name, role, is_active, timezone, birthday FROM users WHERE id = ${params.id}`;
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const row = toCamel(rows[0] as Record<string,unknown>) as Record<string, unknown>;
    if (row.birthday) row.birthday = String(row.birthday).slice(0, 10);
    return NextResponse.json({ data: row });
  } catch(e: unknown) {
    console.error("[users/[id]/PATCH] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await sql`UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = ${params.id}`;
    return NextResponse.json({ message: "Deactivated" });
  } catch(e: unknown) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
