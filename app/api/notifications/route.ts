import { NextRequest, NextResponse } from "next/server";
import { sql, rowsToCamel, toDateString } from "@/lib/db";
import { getSessionUser, canSeeSuperAdmin } from "@/lib/authz";

interface Notif {
  id: string | number;
  type: string;
  message: string;
  read: boolean;
  createdAt: string;
  actionUrl?: string;
  senderName?: string | null;
  severity?: string;
}

// Lazy backfill of today's birthday notifications. Instead of generating
// synthetic IDs (which never persist when marked-read because they're
// recomputed every fetch), we INSERT a real notifications row per
// (viewer, celebrant, today). The backfill runs once per viewer per day —
// the unique title pattern + a quick existence check makes it idempotent.
async function ensureBirthdayNotificationsForViewer(viewerId: string, viewerRole: string) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayKey = today.toISOString().slice(0, 10);

    // Pull active users with a birthday today (matching MM-DD year-agnostic).
    // Respect the per-user birthday_notifications preference. Stealth-filter
    // the super admin out unless the viewer IS the super admin.
    const includeSA = canSeeSuperAdmin(viewerRole);
    const rows = includeSA
      ? await sql`
          SELECT id, name, birthday FROM users
          WHERE is_active = TRUE AND birthday IS NOT NULL AND birthday_notifications = TRUE
        `
      : await sql`
          SELECT id, name, birthday FROM users
          WHERE is_active = TRUE AND birthday IS NOT NULL AND birthday_notifications = TRUE AND role != 'super_admin'
        `;
    for (const r of rows as Record<string, unknown>[]) {
      const bdayStr = toDateString(r.birthday);
      if (!bdayStr) continue;
      const [, m, d] = bdayStr.split("-").map(Number);
      const thisYear = new Date(today.getFullYear(), m - 1, d);
      if (thisYear.getTime() !== today.getTime()) continue;
      // Title is the dedup key — pattern includes celebrant id + today.
      const title = `🎂 Today is ${r.name}'s birthday!`;
      const actionUrl = "/birthdays";
      const dedupTitle = `birthday-${r.id}-${todayKey}`;
      const existing = await sql`
        SELECT 1 FROM notifications
        WHERE user_id = ${viewerId} AND type = 'birthday' AND body = ${dedupTitle}
        LIMIT 1
      `;
      if (existing.length) continue;
      await sql`
        INSERT INTO notifications (user_id, type, title, body, action_url, severity)
        VALUES (${viewerId}, 'birthday', ${title}, ${dedupTitle}, ${actionUrl}, 'info')
      `;
    }
  } catch (e) {
    console.warn("[notifications] birthday backfill failed:", (e as Error).message);
  }
}

export async function GET() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ data: [] });

  // Lazy backfill: ensure today's birthday notifications exist for this user.
  // Cheap (one SELECT + one INSERT max per celebrant) and runs once per fetch.
  await ensureBirthdayNotificationsForViewer(me.id, me.role);

  let dbNotifs: Notif[] = [];
  try {
    const rows = await sql`
      SELECT n.id, n.type, n.title AS message, n.body, n.is_read AS read,
             n.action_url AS "actionUrl", n.created_at AS "createdAt",
             n.severity, n.sender_id AS "senderId",
             u.name AS "senderName"
      FROM notifications n
      LEFT JOIN users u ON u.id = n.sender_id
      WHERE n.user_id = ${me.id}
      ORDER BY n.created_at DESC
      LIMIT 50
    `;
    dbNotifs = rowsToCamel(rows as Record<string, unknown>[]) as Notif[];
  } catch (e) {
    console.warn("[notifications/GET] DB query failed:", (e as Error).message);
    dbNotifs = [];
  }
  return NextResponse.json({ data: dbNotifs });
}

// Mark all of THIS USER's notifications as read. Previously this updated
// every row in the table (no WHERE clause), which (a) leaked across users
// and (b) was the source of the "refresh and badge is back" bug because
// synthetic birthday notifs always came back unread.
export async function PATCH(_: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await sql`UPDATE notifications SET is_read = TRUE WHERE user_id = ${me.id} AND is_read = FALSE`;
  } catch (e) {
    console.warn("[notifications/PATCH] mark-all-read failed:", (e as Error).message);
  }
  return NextResponse.json({ message: "All marked read" });
}
