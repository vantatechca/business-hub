import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json();
  try {
    if (b.amount       !== undefined) await sql`UPDATE revenue_entries SET amount = ${Number(b.amount) || 0} WHERE id = ${params.id}`;
    if (b.departmentId !== undefined) await sql`UPDATE revenue_entries SET department_id = ${b.departmentId || null} WHERE id = ${params.id}`;
    if (b.description  !== undefined) await sql`UPDATE revenue_entries SET description = ${b.description} WHERE id = ${params.id}`;
    if (b.month        !== undefined) await sql`UPDATE revenue_entries SET month = ${b.month} WHERE id = ${params.id}`;
    if (b.year         !== undefined) await sql`UPDATE revenue_entries SET year = ${Number(b.year) || new Date().getFullYear()} WHERE id = ${params.id}`;
    return NextResponse.json({ message: "Updated" });
  } catch (e: unknown) {
    console.error("[revenue/[id]/PATCH] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await sql`DELETE FROM revenue_entries WHERE id = ${params.id}`;
    return NextResponse.json({ message: "Deleted" });
  } catch (e: unknown) {
    console.error("[revenue/[id]/DELETE] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
