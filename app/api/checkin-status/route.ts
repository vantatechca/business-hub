import { NextResponse } from "next/server";
import { sql, rowsToCamel } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";

// Returns today's check-in status for all team members.
// Uses the viewer's timezone to determine "today".
export async function GET() {
  const me = await getSessionUser();
  let userTz = "America/Toronto";
  if (me?.id) {
    try {
      const tzRows = await sql`SELECT timezone FROM users WHERE id = ${me.id}`;
      if (tzRows.length) userTz = (tzRows[0] as { timezone: string }).timezone || "America/Toronto";
    } catch {}
  }
  let today: string;
  try {
    today = new Intl.DateTimeFormat("en-CA", {
      timeZone: userTz, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
  } catch {
    today = new Date().toISOString().slice(0, 10);
  }
  try {
    const rows = await sql`
      SELECT
        u.id, u.name, u.role,
        dc.id AS checkin_id,
        dc.status AS checkin_status,
        dc.submitted_at
      FROM users u
      LEFT JOIN daily_checkins dc ON dc.user_id = u.id AND dc.checkin_date = ${today}
      WHERE u.is_active = TRUE AND u.role = 'member'
      ORDER BY u.name
    `;
    const data = rowsToCamel(rows as Record<string,unknown>[]).map((u: Record<string,unknown>) => ({
      ...u,
      checkedIn: !!u.checkinId,
    }));
    const missing = data
      .filter((u: Record<string,unknown>) => !u.checkedIn)
      .map((u: Record<string,unknown>) => u.name as string);
    return NextResponse.json({
      data,
      missing,
      rate: Math.round((data.length - missing.length) / Math.max(data.length, 1) * 100),
    });
  } catch (e) {
    console.error("[checkin-status/GET] error:", e);
    return NextResponse.json({ data: [], missing: [], rate: 0 }, { status: 200 });
  }
}
