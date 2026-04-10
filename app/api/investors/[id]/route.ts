import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSessionUser, isManagerOrHigher } from "@/lib/authz";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!isManagerOrHigher(me?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const b = await req.json();
  try {
    if (b.name             !== undefined) await sql`UPDATE investors SET name = ${b.name}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.email            !== undefined) await sql`UPDATE investors SET email = ${b.email || null}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.phone            !== undefined) await sql`UPDATE investors SET phone = ${b.phone || null}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.company          !== undefined) await sql`UPDATE investors SET company = ${b.company || null}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.investmentAmount !== undefined) await sql`UPDATE investors SET investment_amount = ${Number(b.investmentAmount) || 0}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.currency         !== undefined) await sql`UPDATE investors SET currency = ${b.currency || "USD"}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.notes            !== undefined) await sql`UPDATE investors SET notes = ${b.notes || null}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.isActive         !== undefined) await sql`UPDATE investors SET is_active = ${b.isActive}, updated_at = NOW() WHERE id = ${params.id}`;
    return NextResponse.json({ message: "Updated" });
  } catch (e: unknown) {
    console.error("[investors/[id]/PATCH] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!isManagerOrHigher(me?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    await sql`DELETE FROM investors WHERE id = ${params.id}`;
    return NextResponse.json({ message: "Deleted" });
  } catch (e: unknown) {
    console.error("[investors/[id]/DELETE] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
