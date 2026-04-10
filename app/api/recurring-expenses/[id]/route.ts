import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSessionUser, isAdmin } from "@/lib/authz";

/**
 * PATCH /api/recurring-expenses/[id]  — update (admin only)
 * DELETE /api/recurring-expenses/[id] — delete (admin only)
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!me || !isAdmin(me.role)) {
    return NextResponse.json({ error: "Only admin or super admin can edit recurring expenses" }, { status: 403 });
  }
  const b = await req.json();
  try {
    if (b.name              !== undefined) await sql`UPDATE recurring_expenses SET name = ${b.name}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.amount            !== undefined) await sql`UPDATE recurring_expenses SET amount = ${Number(b.amount) || 0}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.currency          !== undefined) await sql`UPDATE recurring_expenses SET currency = ${b.currency || "USD"}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.departmentId      !== undefined) await sql`UPDATE recurring_expenses SET department_id = ${b.departmentId || null}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.description       !== undefined) await sql`UPDATE recurring_expenses SET description = ${b.description || null}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.frequency         !== undefined) await sql`UPDATE recurring_expenses SET frequency = ${b.frequency}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.nextDueDate       !== undefined) await sql`UPDATE recurring_expenses SET next_due_date = ${b.nextDueDate}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.notifyDaysBefore  !== undefined) await sql`UPDATE recurring_expenses SET notify_days_before = ${Number(b.notifyDaysBefore) || 3}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.isActive          !== undefined) await sql`UPDATE recurring_expenses SET is_active = ${!!b.isActive}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.notes             !== undefined) await sql`UPDATE recurring_expenses SET notes = ${b.notes || null}, updated_at = NOW() WHERE id = ${params.id}`;
    return NextResponse.json({ message: "Updated" });
  } catch (e: unknown) {
    console.error("[recurring-expenses/[id]/PATCH] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!me || !isAdmin(me.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    await sql`DELETE FROM recurring_expenses WHERE id = ${params.id}`;
    return NextResponse.json({ message: "Deleted" });
  } catch (e: unknown) {
    console.error("[recurring-expenses/[id]/DELETE] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
