import { NextResponse } from "next/server";
import { sql, rowsToCamel } from "@/lib/db";

// Returns today's check-in status for all team members.
// Used by the dashboard "missing check-ins" count.
export async function GET() {
  const today = new Date().toISOString().slice(0, 10);
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
