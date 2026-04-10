import { NextResponse } from "next/server";
import { sql, rowsToCamel, toDateString } from "@/lib/db";
import { getInitials } from "@/lib/types";
import { getSessionUser, canSeeSuperAdmin } from "@/lib/authz";

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
  const me = await getSessionUser();
  try {
    // Show ALL employees who have a birthday set. The birthday_notifications
    // flag controls who RECEIVES notifications, not whose birthday is shown.
    const rows = canSeeSuperAdmin(me?.role)
      ? await sql`
          SELECT id, name, birthday, is_active
          FROM users
          WHERE is_active = TRUE AND birthday IS NOT NULL
          ORDER BY name
        `
      : await sql`
          SELECT id, name, birthday, is_active
          FROM users
          WHERE is_active = TRUE AND birthday IS NOT NULL AND role != 'super_admin'
          ORDER BY name
        `;
    const users = rowsToCamel<Record<string, unknown>>(rows as Record<string, unknown>[]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const entries: BirthdayUser[] = [];
    const diagnostics: { name: string; birthday: string | null; daysUntil: number | null }[] = [];
    for (const u of users) {
      const bdayStr = toDateString(u.birthday);
      if (!bdayStr || !/^\d{4}-\d{2}-\d{2}$/.test(bdayStr)) {
        diagnostics.push({ name: u.name as string, birthday: bdayStr, daysUntil: null });
        continue;
      }
      const [bY, bM, bD] = bdayStr.split("-").map(Number);
      const diff = daysFromTodayToBirthday(today, bdayStr);
      const turningAge = today.getFullYear() - bY;
      diagnostics.push({ name: u.name as string, birthday: bdayStr, daysUntil: diff });
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

    console.log(`[birthdays/GET] ${users.length} active users with birthday; today=${todayList.length}, upcoming=${upcomingList.length}, recent=${recentList.length}`);
    if (users.length > 0 && todayList.length + upcomingList.length + recentList.length === 0) {
      // All birthdays are outside the window — log the full computed list
      // so we can see what went wrong from Render logs.
      console.log("[birthdays/GET] computed:", JSON.stringify(diagnostics));
    }

    // Sort ALL entries by next upcoming birthday (closest first)
    const allSorted = [...entries].sort((a, b) => {
      // Normalize: past birthdays wrap to next year (+365)
      const aDays = a.daysUntil < 0 ? a.daysUntil + 365 : a.daysUntil;
      const bDays = b.daysUntil < 0 ? b.daysUntil + 365 : b.daysUntil;
      return aDays - bDays;
    });

    return NextResponse.json({
      today: todayList,
      upcoming: upcomingList,
      recent: recentList,
      all: allSorted,
    });
  } catch (e: unknown) {
    console.error("[birthdays/GET] error:", e);
    return NextResponse.json({ today: [], upcoming: [], recent: [], error: (e as Error).message }, { status: 200 });
  }
}
