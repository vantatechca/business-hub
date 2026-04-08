import { NextResponse } from "next/server";
import { sql, rowsToCamel } from "@/lib/db";

interface Notif {
  id: string | number;
  type: string;
  message: string;
  read: boolean;
  createdAt: string;
  actionUrl?: string;
}

// Compute synthetic notifications from user birthdays so they appear in the
// bell dropdown alongside real DB notifications. Today's birthdays render as
// unread alerts; upcoming birthdays render as informational.
async function birthdayNotifications(): Promise<Notif[]> {
  try {
    const rows = await sql`SELECT id, name, birthday FROM users WHERE is_active = TRUE AND birthday IS NOT NULL`;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const out: Notif[] = [];
    for (const r of rows as Record<string, unknown>[]) {
      const name = r.name as string;
      const bdayStr = r.birthday ? String(r.birthday).slice(0, 10) : null;
      if (!bdayStr || !/^\d{4}-\d{2}-\d{2}$/.test(bdayStr)) continue;
      const [, m, d] = bdayStr.split("-").map(Number);
      const thisYear = new Date(today.getFullYear(), m - 1, d);
      const diff = Math.round((thisYear.getTime() - today.getTime()) / 86400000);
      if (diff === 0) {
        out.push({
          id: `bday-today-${r.id}`,
          type: "birthday",
          message: `🎂 Today is ${name}'s birthday!`,
          read: false,
          createdAt: today.toISOString(),
          actionUrl: "/birthdays",
        });
      } else if (diff > 0 && diff <= 7) {
        out.push({
          id: `bday-upcoming-${r.id}`,
          type: "birthday",
          message: `${name}'s birthday in ${diff} day${diff === 1 ? "" : "s"}`,
          read: true,
          createdAt: new Date(today.getTime() - diff * 1000).toISOString(),
          actionUrl: "/birthdays",
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

export async function GET() {
  let dbNotifs: Notif[] = [];
  try {
    const rows = await sql`
      SELECT id, type, title AS message, body, is_read AS read, action_url AS "actionUrl", created_at AS "createdAt"
      FROM notifications ORDER BY created_at DESC LIMIT 30
    `;
    dbNotifs = rowsToCamel(rows as Record<string, unknown>[]) as Notif[];
  } catch (e) {
    console.warn("[notifications/GET] DB query failed, returning birthdays only:", (e as Error).message);
    dbNotifs = [];
  }
  const bdays = await birthdayNotifications();
  return NextResponse.json({ data: [...bdays, ...dbNotifs] });
}

export async function PATCH() {
  try {
    await sql`UPDATE notifications SET is_read = TRUE`;
  } catch (e) {
    console.warn("[notifications/PATCH] mark-all-read failed:", (e as Error).message);
  }
  return NextResponse.json({ message: "All marked read" });
}
