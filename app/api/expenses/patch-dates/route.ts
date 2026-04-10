import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSessionUser, isManagerOrHigher } from "@/lib/authz";

/**
 * POST /api/expenses/patch-dates
 *
 * One-time endpoint to backfill entry_date on existing expenses
 * based on their description + month + year. Manager+ only.
 */
const DATE_MAP: Record<string, string> = {
  "Envelopes bubble": "2026-04-04",
  "Amazon Office Related Crap": "2026-04-04",
  "Laptops pour processeurs": "2026-04-04",
  "Filipino team salaries - 42 workers (monthly mid estimate)": "2025-03-29",
};

// All "2025-03-01" monthly expenses
const MAR_MONTHLY = [
  "Claude Pro plan x18 IT", "Claude Max plan x3 PH team", "Gemini plan x12 IT",
  "Chat support API", "Private proxies x250 MPP", "Hydro / electricity",
  "AdsPower proxy", "Proxies - WebShare", "SEO blog servers", "SEO tool API",
  "Clock-in / HR app", "Warm-up tool API", "Hockey", "Food", "Bell", "Rogers",
  "Videotron", "TELUS", "Main local assistant", "Packing staff",
  "G Wagon payment", "Electric car payment", "C63 payment", "GTR payment",
  "Gab Jihrou", "Partner - truck payment", "Gian Paulo",
  "Partner - loan interest", "Tax debt repayment",
];

export async function POST() {
  const me = await getSessionUser();
  if (!me || !isManagerOrHigher(me.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // Check if entry_date column exists
    try {
      await sql`SELECT entry_date FROM expense_entries LIMIT 0`;
    } catch {
      return NextResponse.json({ error: "entry_date column not found. Run node scripts/setup-db.js first." }, { status: 400 });
    }

    let updated = 0;

    // Exact description matches
    for (const [desc, date] of Object.entries(DATE_MAP)) {
      const res = await sql`UPDATE expense_entries SET entry_date = ${date} WHERE description = ${desc} AND entry_date IS NULL`;
      if (res) updated++;
    }

    // March monthly expenses → 2025-03-01
    for (const prefix of MAR_MONTHLY) {
      await sql`UPDATE expense_entries SET entry_date = '2025-03-01' WHERE description ILIKE ${prefix + "%"} AND month = 'Mar' AND year = 2025 AND entry_date IS NULL`;
      updated++;
    }

    // All January 2025 expenses → 2025-01-01
    await sql`UPDATE expense_entries SET entry_date = '2025-01-01' WHERE month = 'Jan' AND year = 2025 AND entry_date IS NULL`;
    updated++;

    return NextResponse.json({ data: { updated, message: "Dates backfilled" } });
  } catch (e: unknown) {
    console.error("[patch-dates] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
