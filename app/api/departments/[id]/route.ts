import { NextRequest, NextResponse } from "next/server";
import { sql, toCamel } from "@/lib/db";
import { getSessionUser, isManagerOrHigher, getUserScope } from "@/lib/authz";

// Look up a department by its id OR its slug. Uses id::text comparison so it
// works for BOTH `id UUID` and `id TEXT` column shapes without blowing up on
// type casts. Previously we used a UUID_RE check + explicit ::uuid cast,
// which 500'd on deployments whose departments.id column isn't native UUID.
async function findDepartment(key: string) {
  const rows = await sql`
    SELECT * FROM departments
    WHERE id::text = ${key} OR slug = ${key}
    LIMIT 1
  `;
  return rows.length ? (rows[0] as Record<string, unknown>) : null;
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const row = await findDepartment(params.id);
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // Lead and member can only view departments they're a member of. Return
    // 404 (not 403) for unauthorized viewers so the existence of the
    // department isn't leaked.
    const me = await getSessionUser();
    if (me && !isManagerOrHigher(me.role)) {
      const scope = await getUserScope(me.id);
      if (!scope.departmentIds.includes(String(row.id))) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    }
    return NextResponse.json({ data: toCamel(row) });
  } catch (e: unknown) {
    console.error("[departments/[id]/GET] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  // Department edit is manager+ only.
  const me = await getSessionUser();
  if (!isManagerOrHigher(me?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let b: Record<string, unknown>;
  try { b = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  try {
    const existing = await findDepartment(params.id);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const realId = existing.id as string;

    // Conditional updates — no COALESCE NULL casts, matches other PATCH routes
    if (b.name           !== undefined) await sql`UPDATE departments SET name = ${(b.name as string) || null}, updated_at = NOW() WHERE id::text = ${realId}`;
    if (b.color          !== undefined) await sql`UPDATE departments SET color = ${(b.color as string) || null}, updated_at = NOW() WHERE id::text = ${realId}`;
    if (b.icon           !== undefined) await sql`UPDATE departments SET icon = ${(b.icon as string) || null}, updated_at = NOW() WHERE id::text = ${realId}`;
    if (b.priorityScore  !== undefined) await sql`UPDATE departments SET priority_score = ${Number(b.priorityScore) || 0}, updated_at = NOW() WHERE id::text = ${realId}`;
    if (b.googleSheetUrl !== undefined) await sql`UPDATE departments SET google_sheet_url = ${(b.googleSheetUrl as string) || null}, updated_at = NOW() WHERE id::text = ${realId}`;
    if (b.description    !== undefined) await sql`UPDATE departments SET description = ${(b.description as string) || null}, updated_at = NOW() WHERE id::text = ${realId}`;
    if (b.head           !== undefined) await sql`UPDATE departments SET description = ${(b.head as string) || null}, updated_at = NOW() WHERE id::text = ${realId}`;
    if (b.notes          !== undefined) await sql`UPDATE departments SET notes = ${(b.notes as string) || null}, updated_at = NOW() WHERE id::text = ${realId}`;

    const rows = await sql`SELECT * FROM departments WHERE id::text = ${realId}`;
    return NextResponse.json({ data: toCamel(rows[0] as Record<string, unknown>) });
  } catch (e: unknown) {
    console.error("[departments/[id]/PATCH] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  // Department delete is manager+ only.
  const me = await getSessionUser();
  if (!isManagerOrHigher(me?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const existing = await findDepartment(params.id);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await sql`DELETE FROM departments WHERE id::text = ${existing.id as string}`;
    return NextResponse.json({ message: "Deleted" });
  } catch (e: unknown) {
    console.error("[departments/[id]/DELETE] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
