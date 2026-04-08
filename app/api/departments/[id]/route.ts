import { NextRequest, NextResponse } from "next/server";
import { sql, toCamel } from "@/lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Look up a department by its id (UUID) OR its slug. This lets the URL
// /departments/shopify work even when the user's DB stores departments with
// custom slug-based ids or when the detail page is linked with a slug.
async function findDepartment(key: string) {
  if (UUID_RE.test(key)) {
    const rows = await sql`SELECT * FROM departments WHERE id = ${key}::uuid LIMIT 1`;
    if (rows.length) return rows[0] as Record<string, unknown>;
  }
  const rows = await sql`SELECT * FROM departments WHERE slug = ${key} LIMIT 1`;
  return rows.length ? (rows[0] as Record<string, unknown>) : null;
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const row = await findDepartment(params.id);
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ data: toCamel(row) });
  } catch (e: unknown) {
    console.error("[departments/[id]/GET] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  let b: Record<string, unknown>;
  try { b = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  try {
    const existing = await findDepartment(params.id);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const realId = existing.id as string;

    const rows = await sql`
      UPDATE departments SET
        name             = COALESCE(${(b.name as string | undefined) ?? null}::text, name),
        color            = COALESCE(${(b.color as string | undefined) ?? null}::text, color),
        icon             = COALESCE(${(b.icon as string | undefined) ?? null}::text, icon),
        priority_score   = COALESCE(${b.priorityScore != null ? Number(b.priorityScore) : null}::integer, priority_score),
        google_sheet_url = COALESCE(${(b.googleSheetUrl as string | undefined) ?? null}::text, google_sheet_url),
        description      = COALESCE(${(b.description as string | undefined) ?? null}::text, description),
        updated_at       = NOW()
      WHERE id = ${realId}
      RETURNING *
    `;
    return NextResponse.json({ data: toCamel(rows[0] as Record<string, unknown>) });
  } catch (e: unknown) {
    console.error("[departments/[id]/PATCH] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const existing = await findDepartment(params.id);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await sql`DELETE FROM departments WHERE id = ${existing.id as string}`;
    return NextResponse.json({ message: "Deleted" });
  } catch (e: unknown) {
    console.error("[departments/[id]/DELETE] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
