import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json();
  try {
    if (b.name    !== undefined) await sql`UPDATE goals SET name = ${b.name}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.target  !== undefined) await sql`UPDATE goals SET target = ${Number(b.target) || 0}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.current !== undefined) await sql`UPDATE goals SET current = ${Number(b.current) || 0}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.format  !== undefined) await sql`UPDATE goals SET format = ${b.format}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.color   !== undefined) await sql`UPDATE goals SET color = ${b.color}, updated_at = NOW() WHERE id = ${params.id}`;
    return NextResponse.json({ message: "Updated" });
  } catch (e: unknown) {
    console.error("[goals/[id]/PATCH] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await sql`DELETE FROM goals WHERE id = ${params.id}`;
    return NextResponse.json({ message: "Deleted" });
  } catch (e: unknown) {
    console.error("[goals/[id]/DELETE] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
