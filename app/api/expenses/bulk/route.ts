import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSessionUser, isManagerOrHigher } from "@/lib/authz";

/**
 * POST /api/expenses/bulk
 *
 * Bulk-insert expense entries. Manager+ only.
 * Body: { entries: Array<{ amount, currency, description, month, year, departmentId? }> }
 */
export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me || !isManagerOrHigher(me.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { entries: Array<{ amount: number; currency: string; description: string; month: string; year: number; departmentId?: string }> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.entries?.length) {
    return NextResponse.json({ error: "entries array required" }, { status: 400 });
  }

  let ok = 0;
  const errors: string[] = [];

  for (const e of body.entries) {
    try {
      await sql`
        INSERT INTO expense_entries (amount, currency, department_id, description, month, year)
        VALUES (${Number(e.amount) || 0}, ${e.currency || "USD"}, ${e.departmentId || null}, ${e.description || ""}, ${e.month || "Jan"}, ${Number(e.year) || 2025})
      `;
      ok++;
    } catch (err: unknown) {
      errors.push(`${e.description}: ${(err as Error).message}`);
    }
  }

  return NextResponse.json({
    data: { added: ok, failed: errors.length, total: body.entries.length, errors: errors.slice(0, 5) },
  });
}
