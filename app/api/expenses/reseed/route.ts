import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSessionUser, isManagerOrHigher } from "@/lib/authz";

/**
 * POST /api/expenses/reseed
 *
 * Deletes ALL existing expenses and re-inserts with corrected dates (2026).
 * Manager+ only. DESTRUCTIVE — use carefully.
 */
const EXPENSES = [
  { d: "2026-04-04", amount: 520, currency: "USD", description: "Envelopes bubble", month: "Apr", year: 2026 },
  { d: "2026-04-04", amount: 600, currency: "USD", description: "Amazon Office Related Crap", month: "Apr", year: 2026 },
  { d: "2026-04-04", amount: 2700, currency: "USD", description: "Laptops pour processeurs", month: "Apr", year: 2026 },
  { d: "2026-03-29", amount: 42000, currency: "USD", description: "Filipino team salaries - 42 workers (monthly mid estimate)", month: "Mar", year: 2026 },
  { d: "2026-03-01", amount: 504, currency: "USD", description: "Claude Pro plan x18 IT (@ $28 each, monthly)", month: "Mar", year: 2026 },
  { d: "2026-03-01", amount: 660, currency: "USD", description: "Claude Max plan x3 PH team (@ $220 each, monthly)", month: "Mar", year: 2026 },
  { d: "2026-03-01", amount: 240, currency: "USD", description: "Gemini plan x12 IT (monthly)", month: "Mar", year: 2026 },
  { d: "2026-03-01", amount: 400, currency: "USD", description: "Chat support API (monthly)", month: "Mar", year: 2026 },
  { d: "2026-03-01", amount: 750, currency: "USD", description: "Private proxies x250 MPP (monthly)", month: "Mar", year: 2026 },
  { d: "2026-03-01", amount: 500, currency: "USD", description: "Hydro / electricity (monthly)", month: "Mar", year: 2026 },
  { d: "2026-03-01", amount: 450, currency: "USD", description: "AdsPower proxy & account manager (monthly)", month: "Mar", year: 2026 },
  { d: "2026-03-01", amount: 510, currency: "USD", description: "Proxies - WebShare (monthly)", month: "Mar", year: 2026 },
  { d: "2026-03-01", amount: 200, currency: "USD", description: "SEO blog servers (monthly)", month: "Mar", year: 2026 },
  { d: "2026-03-01", amount: 400, currency: "USD", description: "SEO tool API (monthly)", month: "Mar", year: 2026 },
  { d: "2026-03-01", amount: 480, currency: "USD", description: "Clock-in / HR app - 42 PH staff (monthly)", month: "Mar", year: 2026 },
  { d: "2026-03-01", amount: 600, currency: "USD", description: "Warm-up tool API (monthly)", month: "Mar", year: 2026 },
  { d: "2026-03-01", amount: 10000, currency: "CAD", description: "Hockey (monthly)", month: "Mar", year: 2026 },
  { d: "2026-03-01", amount: 4000, currency: "CAD", description: "Food (monthly)", month: "Mar", year: 2026 },
  { d: "2026-03-01", amount: 450, currency: "CAD", description: "Bell (monthly)", month: "Mar", year: 2026 },
  { d: "2026-03-01", amount: 600, currency: "CAD", description: "Rogers (monthly)", month: "Mar", year: 2026 },
  { d: "2026-03-01", amount: 250, currency: "CAD", description: "Videotron (monthly)", month: "Mar", year: 2026 },
  { d: "2026-03-01", amount: 1300, currency: "CAD", description: "TELUS (monthly)", month: "Mar", year: 2026 },
  { d: "2026-03-01", amount: 5800, currency: "CAD", description: "Main local assistant (monthly)", month: "Mar", year: 2026 },
  { d: "2026-03-01", amount: 1400, currency: "CAD", description: "Packing staff (monthly)", month: "Mar", year: 2026 },
  { d: "2026-03-01", amount: 3000, currency: "CAD", description: "G Wagon payment (monthly)", month: "Mar", year: 2026 },
  { d: "2026-03-01", amount: 1000, currency: "CAD", description: "Electric car payment (monthly)", month: "Mar", year: 2026 },
  { d: "2026-03-01", amount: 2100, currency: "CAD", description: "C63 payment (monthly)", month: "Mar", year: 2026 },
  { d: "2026-03-01", amount: 3000, currency: "CAD", description: "GTR payment (monthly)", month: "Mar", year: 2026 },
  { d: "2026-03-01", amount: 1000, currency: "CAD", description: "Gab Jihrou (monthly)", month: "Mar", year: 2026 },
  { d: "2026-03-01", amount: 1300, currency: "CAD", description: "Partner - truck payment (monthly)", month: "Mar", year: 2026 },
  { d: "2026-03-01", amount: 900, currency: "CAD", description: "Gian Paulo (monthly)", month: "Mar", year: 2026 },
  { d: "2026-03-01", amount: 400, currency: "CAD", description: "Partner - loan interest (monthly)", month: "Mar", year: 2026 },
  { d: "2026-03-01", amount: 6300, currency: "CAD", description: "Tax debt repayment (monthly)", month: "Mar", year: 2026 },
  { d: "2026-01-01", amount: 4800, currency: "CAD", description: "400 new domains (Cloudflare @ $12 each) - yearly", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 2940, currency: "CAD", description: "Gmail accounts - 2,100 (@ $1.40 each) - one-time", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 2400, currency: "CAD", description: "200 new domains (Cloudflare @ $12 each) - yearly", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 500, currency: "USD", description: "Cloaking domains (~40) - yearly", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 1100, currency: "CAD", description: "Old website domains (~80-90 domains) - yearly", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 1440, currency: "CAD", description: "US shipping losses - duty issues (60 orders x $24)", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 22400, currency: "CAD", description: "Shipping labels - all orders (~1,400 orders x $16 avg)", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 12000, currency: "USD", description: "Payment processor training - German system (valuable)", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 4700, currency: "USD", description: "Business Hub App - outside developer", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 1450, currency: "USD", description: "Google Merchant Center guide", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 1500, currency: "CAD", description: "Partner - March trip advance", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 25000, currency: "USD", description: "Yuri - inventory & partnership costs (est. $20-30K, $8.1K repaid)", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 4500, currency: "CAD", description: "Google Merchant Center - testing & wasted spend", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 17000, currency: "USD", description: "Payment processor training - Paul (wasted)", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 4000, currency: "USD", description: "New Jersey web professional", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 3800, currency: "USD", description: "Chat App - outside developer", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 3900, currency: "CAD", description: "Back treatments x26 (@ $150 each)", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 850, currency: "CAD", description: "MRI scan", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 3000, currency: "CAD", description: "Back products, cushions, creams, misc.", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 1400, currency: "CAD", description: "House AC system parts", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 2500, currency: "CAD", description: "Dyson fans (air quality / dizziness issue)", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 7600, currency: "CAD", description: "AC unit upgrades x2 (@ $3,800 each)", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 1800, currency: "CAD", description: "Failed AC units x2 (underpowered - discarded)", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 3100, currency: "CAD", description: "Power station x2 (backup electricity)", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 2800, currency: "CAD", description: "Power station x1 (backup electricity)", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 1500, currency: "CAD", description: "Bubble envelopes (shipping)", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 1300, currency: "CAD", description: "Canon printers x2 (@ $650 each)", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 800, currency: "CAD", description: "Power cords & extensions", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 7000, currency: "CAD", description: "Power tools, batteries, accessories", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 400, currency: "CAD", description: "Thermal paper (cumulative)", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 80, currency: "CAD", description: "Paper & misc. supplies", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 800, currency: "CAD", description: "Thermal printers (replaced cheap units with 2 good ones)", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 450, currency: "CAD", description: "Ink cartridges", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 2400, currency: "CAD", description: "Chair - ergonomic (1)", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 3150, currency: "CAD", description: "Wooden tables x9 (@ $350 each)", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 400, currency: "CAD", description: "Chair (4)", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 1600, currency: "CAD", description: "Chair - ergonomic (2)", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 1200, currency: "CAD", description: "High-rise chairs (Struck Tube)", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 1755, currency: "CAD", description: "Cheap sit/stand tables x9 (discarded - poor quality)", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 700, currency: "CAD", description: "Chair (3)", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 5220, currency: "CAD", description: "High-quality sit/stand tables x9 (@ $580 each)", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 5520, currency: "CAD", description: "75\" screens x8 Costco (@ $690 each)", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 3400, currency: "CAD", description: "49\" curved monitors x2 (@ $1,700 each)", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 6600, currency: "CAD", description: "55\" screens x12 (@ $550 each)", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 5000, currency: "CAD", description: "Various displays / small & medium screens", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 14000, currency: "CAD", description: "AI workstation (2nd unit) - used for screens", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 2400, currency: "CAD", description: "RAM upgrades (multiple systems)", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 4000, currency: "CAD", description: "Keyboards, mice, charging stations, peripherals", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 5100, currency: "CAD", description: "MacBook Pro x3 (@ $1,700 each)", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 3500, currency: "CAD", description: "Amazon misc. setup / cables / gadgets", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 644, currency: "CAD", description: "6 PebCheck", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 1434, currency: "CAD", description: "8 PepCheck", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 285, currency: "CAD", description: "14 Check", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 544, currency: "CAD", description: "19 PepCheck", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 998, currency: "CAD", description: "STN Check", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 154, currency: "CAD", description: "THT Check", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 443, currency: "CAD", description: "12 Check", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 750, currency: "CAD", description: "10 PepCheck", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 1482, currency: "CAD", description: "5 PepCheck", month: "Jan", year: 2026 },
  { d: "2026-01-01", amount: 2400, currency: "CAD", description: "9 PepCheck", month: "Jan", year: 2026 },
];

export async function POST() {
  const me = await getSessionUser();
  if (!me || !isManagerOrHigher(me.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // Delete all existing expenses
    await sql`DELETE FROM expense_entries`;

    let ok = 0;
    for (const e of EXPENSES) {
      try {
        // Try with entry_date; fall back without
        try {
          await sql`
            INSERT INTO expense_entries (amount, currency, department_id, description, month, year, entry_date)
            VALUES (${e.amount}, ${e.currency}, NULL, ${e.description}, ${e.month}, ${e.year}, ${e.d})
          `;
        } catch {
          await sql`
            INSERT INTO expense_entries (amount, currency, department_id, description, month, year)
            VALUES (${e.amount}, ${e.currency}, NULL, ${e.description}, ${e.month}, ${e.year})
          `;
        }
        ok++;
      } catch (err: unknown) {
        console.warn(`[reseed] Failed: ${e.description}:`, (err as Error).message);
      }
    }

    return NextResponse.json({ data: { deleted: "all", added: ok, total: EXPENSES.length } });
  } catch (e: unknown) {
    console.error("[reseed] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
