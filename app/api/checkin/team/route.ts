import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSessionUser, canSeeSuperAdmin, isManagerOrHigher } from "@/lib/authz";

// GET /api/checkin/team?month=YYYY-MM
// Returns:
//   {
//     month: "YYYY-MM",
//     daysInMonth: 30,
//     members: [
//       { userId, userName, role,
//         days: { "1": "ai_processed", "2": "submitted", ... } }
//     ]
//   }
//
// Used by the team check-in heatmap on /checkin. The super admin is filtered
// out of the member list unless the caller is the SA themselves.
export async function GET(req: NextRequest) {
  const me = await getSessionUser();
  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month") ?? new Date().toISOString().slice(0, 7); // YYYY-MM
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
  }

  const [year, monNum] = month.split("-").map(Number);
  const firstDay = `${month}-01`;
  const daysInMonth = new Date(year, monNum, 0).getDate();
  const lastDay = `${month}-${String(daysInMonth).padStart(2, "0")}`;

  const includeSA = canSeeSuperAdmin(me?.role);
  // Lead and member only see their own row in the matrix. Managers and
  // above see the whole team. Without a session, return nothing rather
  // than leaking the whole team to anonymous callers.
  if (!me) return NextResponse.json({ month, daysInMonth, members: [] });
  const personalOnly = !isManagerOrHigher(me.role);
  try {
    const rows = personalOnly
      ? await sql`
          SELECT u.id AS user_id, u.name AS user_name, u.role,
                 dc.checkin_date, dc.status, dc.id AS checkin_id
          FROM users u
          LEFT JOIN daily_checkins dc
            ON dc.user_id = u.id
           AND dc.checkin_date BETWEEN ${firstDay} AND ${lastDay}
          WHERE u.id = ${me.id}
          ORDER BY dc.checkin_date
        `
      : (includeSA
          ? await sql`
              SELECT u.id AS user_id, u.name AS user_name, u.role,
                     dc.checkin_date, dc.status, dc.id AS checkin_id
              FROM users u
              LEFT JOIN daily_checkins dc
                ON dc.user_id = u.id
               AND dc.checkin_date BETWEEN ${firstDay} AND ${lastDay}
              WHERE u.is_active = TRUE
              ORDER BY u.role, u.name, dc.checkin_date
            `
          : await sql`
              SELECT u.id AS user_id, u.name AS user_name, u.role,
                     dc.checkin_date, dc.status, dc.id AS checkin_id
              FROM users u
              LEFT JOIN daily_checkins dc
                ON dc.user_id = u.id
               AND dc.checkin_date BETWEEN ${firstDay} AND ${lastDay}
              WHERE u.is_active = TRUE AND u.role != 'super_admin'
              ORDER BY u.role, u.name, dc.checkin_date
            `);

    const memberMap = new Map<string, {
      userId: string;
      userName: string;
      role: string;
      days: Record<string, { status: string; checkinId: string }>;
    }>();

    for (const r of rows as Record<string, unknown>[]) {
      const userId = r.user_id as string;
      if (!memberMap.has(userId)) {
        memberMap.set(userId, {
          userId,
          userName: r.user_name as string,
          role: r.role as string,
          days: {},
        });
      }
      if (r.checkin_date) {
        const day = new Date(r.checkin_date as Date).getUTCDate();
        memberMap.get(userId)!.days[String(day)] = {
          status: (r.status as string) ?? "submitted",
          checkinId: r.checkin_id as string,
        };
      }
    }

    return NextResponse.json({
      month,
      daysInMonth,
      members: Array.from(memberMap.values()),
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
