import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSessionUser, isManagerOrHigher } from "@/lib/authz";

/**
 * POST /api/recurring-expenses/[id]/pay
 *
 * Marks a recurring expense as paid for the current period. Actions:
 *   1. Creates an expense_entries row for the paid amount
 *   2. Records the payment in recurring_expense_payments
 *   3. Advances next_due_date by one period based on frequency
 *
 * Permission: manager+ can record payments.
 */

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function advanceDate(iso: string, frequency: string): string {
  const d = new Date(iso + "T00:00:00");
  switch (frequency) {
    case "weekly":    d.setDate(d.getDate() + 7); break;
    case "biweekly":  d.setDate(d.getDate() + 14); break;
    case "monthly":   d.setMonth(d.getMonth() + 1); break;
    case "quarterly": d.setMonth(d.getMonth() + 3); break;
    case "yearly":    d.setFullYear(d.getFullYear() + 1); break;
    default:          d.setMonth(d.getMonth() + 1);
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!me || !isManagerOrHigher(me.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Optional: client can override the payment date or amount for this period
  const body = await req.json().catch(() => ({})) as {
    paidForDate?: string;
    amount?: number;
    note?: string;
  };

  try {
    // Look up the recurring expense
    const rows = await sql`SELECT * FROM recurring_expenses WHERE id = ${params.id}`;
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const re = rows[0] as Record<string, unknown>;
    const frequency = String(re.frequency || "monthly");
    const nextDueRaw = re.next_due_date;
    const nextDueStr = typeof nextDueRaw === "string" ? nextDueRaw.slice(0, 10)
      : nextDueRaw instanceof Date ? `${nextDueRaw.getFullYear()}-${String(nextDueRaw.getMonth() + 1).padStart(2, "0")}-${String(nextDueRaw.getDate()).padStart(2, "0")}`
      : new Date().toISOString().slice(0, 10);

    const paidForDate = body.paidForDate || nextDueStr;
    const amount = body.amount ?? Number(re.amount) ?? 0;
    const currency = String(re.currency || "USD");
    const description = `${re.name}${body.note ? " — " + body.note : ""}`;
    const dt = new Date(paidForDate + "T00:00:00");
    const month = MONTHS[dt.getMonth()];
    const year = dt.getFullYear();

    // Create the expense entry
    let expenseId: string | null = null;
    try {
      const expRows = await sql`
        INSERT INTO expense_entries (amount, currency, department_id, description, month, year, entry_date)
        VALUES (${amount}, ${currency}, ${re.department_id ?? null}, ${description}, ${month}, ${year}, ${paidForDate})
        RETURNING id
      `;
      expenseId = (expRows[0] as { id: string }).id;
    } catch {
      // Fall back without entry_date if the column doesn't exist yet
      const expRows = await sql`
        INSERT INTO expense_entries (amount, currency, department_id, description, month, year)
        VALUES (${amount}, ${currency}, ${re.department_id ?? null}, ${description}, ${month}, ${year})
        RETURNING id
      `;
      expenseId = (expRows[0] as { id: string }).id;
    }

    // Record the payment
    try {
      await sql`
        INSERT INTO recurring_expense_payments (recurring_expense_id, expense_entry_id, paid_for_date, paid_by)
        VALUES (${params.id}, ${expenseId}, ${paidForDate}, ${me.id})
        ON CONFLICT (recurring_expense_id, paid_for_date) DO NOTHING
      `;
    } catch (e) {
      console.warn("[recurring-expenses/pay] payment log failed:", e);
    }

    // Advance next_due_date
    const newDue = advanceDate(paidForDate, frequency);
    await sql`UPDATE recurring_expenses SET next_due_date = ${newDue}, updated_at = NOW() WHERE id = ${params.id}`;

    return NextResponse.json({
      data: { expenseId, newDue, amount, description },
    });
  } catch (e: unknown) {
    console.error("[recurring-expenses/pay] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
