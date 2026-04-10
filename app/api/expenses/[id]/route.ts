import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json();
  try {
    if (b.amount       !== undefined) await sql`UPDATE expense_entries SET amount = ${Number(b.amount) || 0} WHERE id = ${params.id}`;
    if (b.currency     !== undefined && (b.currency === "USD" || b.currency === "CAD")) {
      await sql`UPDATE expense_entries SET currency = ${b.currency} WHERE id = ${params.id}`;
    }
    if (b.departmentId !== undefined) await sql`UPDATE expense_entries SET department_id = ${b.departmentId || null} WHERE id = ${params.id}`;
    if (b.description  !== undefined) await sql`UPDATE expense_entries SET description = ${b.description} WHERE id = ${params.id}`;
    if (b.month        !== undefined) await sql`UPDATE expense_entries SET month = ${b.month} WHERE id = ${params.id}`;
    if (b.year         !== undefined) await sql`UPDATE expense_entries SET year = ${Number(b.year) || new Date().getFullYear()} WHERE id = ${params.id}`;
    if (b.entryDate    !== undefined) {
      try { await sql`UPDATE expense_entries SET entry_date = ${b.entryDate || null} WHERE id = ${params.id}`; } catch { /* column may not exist yet */ }
    }
    return NextResponse.json({ message: "Updated" });
  } catch (e: unknown) {
    console.error("[expenses/[id]/PATCH] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await sql`DELETE FROM expense_entries WHERE id = ${params.id}`;
    return NextResponse.json({ message: "Deleted" });
  } catch (e: unknown) {
    console.error("[expenses/[id]/DELETE] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
