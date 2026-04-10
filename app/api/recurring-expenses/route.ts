import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { sql, rowsToCamel, toCamel, toDateString } from "@/lib/db";
import { getSessionUser, isAdmin, isManagerOrHigher } from "@/lib/authz";

/**
 * Recurring expenses — templates that generate expense_entries on a schedule.
 *
 * GET   /api/recurring-expenses      — list (manager+)
 * POST  /api/recurring-expenses      — create (admin/super_admin only)
 *
 * Fields:
 *   name, amount, currency, departmentId, description, frequency,
 *   nextDueDate, notifyDaysBefore, isActive, notes
 */

function shape(r: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...r, amount: Number(r.amount) };
  if (out.nextDueDate != null) out.nextDueDate = toDateString(out.nextDueDate);
  return out;
}

export async function GET() {
  const me = await getSessionUser();
  if (!me || !isManagerOrHigher(me.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const rows = await sql`
      SELECT r.*, d.name AS department_name, u.name AS created_by_name
      FROM recurring_expenses r
      LEFT JOIN departments d ON d.id::text = r.department_id::text
      LEFT JOIN users u ON u.id = r.created_by
      ORDER BY r.is_active DESC, r.next_due_date ASC
    `;
    return NextResponse.json({
      data: rowsToCamel<Record<string, unknown>>(rows as Record<string, unknown>[]).map(shape),
    });
  } catch (e: unknown) {
    console.error("[recurring-expenses/GET] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me || !isAdmin(me.role)) {
    return NextResponse.json({ error: "Only admin or super admin can create recurring expenses" }, { status: 403 });
  }
  const b = await req.json();
  if (!b.name || !b.nextDueDate) {
    return NextResponse.json({ error: "name and nextDueDate required" }, { status: 400 });
  }
  try {
    const newId = randomUUID();
    const rows = await sql`
      INSERT INTO recurring_expenses (
        id, name, amount, currency, department_id, description,
        frequency, next_due_date, notify_days_before, is_active, notes, created_by
      )
      VALUES (
        ${newId},
        ${b.name},
        ${Number(b.amount) || 0},
        ${b.currency || "USD"},
        ${b.departmentId || null},
        ${b.description || null},
        ${b.frequency || "monthly"},
        ${b.nextDueDate},
        ${Number(b.notifyDaysBefore) || 3},
        ${b.isActive !== false},
        ${b.notes || null},
        ${me.id}
      )
      RETURNING *
    `;
    return NextResponse.json({ data: shape(toCamel(rows[0] as Record<string, unknown>)) }, { status: 201 });
  } catch (e: unknown) {
    console.error("[recurring-expenses/POST] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
