import { NextResponse } from "next/server";
import { sql, rowsToCamel } from "@/lib/db";
import { getInitials } from "@/lib/types";

// GET /api/birthdays
// Returns:
//   {
//     today:    [{ userId, name, initials, birthday, mmdd, turningAge? }],
//     upcoming: [...],  // in the next 14 days (excluding today)
//     recent:   [...],  // in the past 14 days (excluding today) — "missed"
//   }
//
// Matching is by month + day only (year-agnostic), so birthdays recur each year.

interface BirthdayUser {
  userId: string;
  name: string;
  initials: string;
  birthday: string; // YYYY-MM-DD
  mmdd: string;     // MM-DD
  daysUntil: number; // negative = past, 0 = today, positive = upcoming
  turningAge?: number;
}

// Zero-pad helper
const pad = (n: number) => String(n).padStart(2, "0");

function mmddFromDate(d: Date): string {
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// How many days from `today` until the next occurrence of this month-day
// (can be negative for past-this-year occurrences within the window).
function daysFromTodayToBirthday(todayYmd: Date, bdayStr: string): number {
  const [y, m, d] = bdayStr.split("-").map(Number);
  void y;
  // This year's occurrence
  const thisYear = new Date(todayYmd.getFullYear(), m - 1, d);
  const todayOnly = new Date(todayYmd.getFullYear(), todayYmd.getMonth(), todayYmd.getDate());
  return Math.round((thisYear.getTime() - todayOnly.getTime()) / 86400000);
}

export async function GET() {
  try {
    const rows = await sql`
      SELECT id, name, birthday
      FROM users
      WHERE is_active = TRUE AND birthday IS NOT NULL
      ORDER BY name
    `;
    const users = rowsToCamel<Record<string, unknown>>(rows as Record<string, unknown>[]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const entries: BirthdayUser[] = [];
    for (const u of users) {
      if (!u.birthday) continue;
      const bdayStr = String(u.birthday).slice(0, 10); // YYYY-MM-DD
      if (!/^\d{4}-\d{2}-\d{2}$/.test(bdayStr)) continue;
      const [bY, bM, bD] = bdayStr.split("-").map(Number);
      const diff = daysFromTodayToBirthday(today, bdayStr);
      const turningAge = today.getFullYear() - bY;
      entries.push({
        userId: u.id as string,
        name: u.name as string,
        initials: getInitials(u.name as string),
        birthday: bdayStr,
        mmdd: `${pad(bM)}-${pad(bD)}`,
        daysUntil: diff,
        turningAge: turningAge >= 0 && turningAge < 150 ? turningAge : undefined,
      });
    }

    const todayList    = entries.filter(e => e.daysUntil === 0).sort((a, b) => a.name.localeCompare(b.name));
    const upcomingList = entries.filter(e => e.daysUntil > 0 && e.daysUntil <= 14).sort((a, b) => a.daysUntil - b.daysUntil);
    const recentList   = entries.filter(e => e.daysUntil < 0 && e.daysUntil >= -14).sort((a, b) => b.daysUntil - a.daysUntil);

    return NextResponse.json({
      today: todayList,
      upcoming: upcomingList,
      recent: recentList,
    });
  } catch (e: unknown) {
    console.error("[birthdays/GET] error:", e);
    return NextResponse.json({ today: [], upcoming: [], recent: [], error: (e as Error).message }, { status: 200 });
  }
}
