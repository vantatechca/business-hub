import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSessionUser, isManagerOrHigher } from "@/lib/authz";

/**
 * POST /api/ai-actions
 *
 * Executes an action suggested by the AI assistant. Currently supports:
 *   - NOTIFY: Send a notification to a user or group of users.
 *
 * Body: { type: "NOTIFY", target: string, title: string, body: string }
 *
 * Target can be:
 *   - A user UUID — sends to that specific user
 *   - "ALL_MANAGERS" — sends to all managers, admins, super_admins
 *   - "ALL_LEADS" — sends to all leads
 *   - "ALL_ASSIGNED:metricName" — sends to everyone assigned to that metric
 */
export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me || !isManagerOrHigher(me.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { type: string; target: string; title: string; body: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.type !== "NOTIFY") {
    return NextResponse.json({ error: `Unknown action type: ${body.type}` }, { status: 400 });
  }

  const { target, title, body: alertBody } = body;
  if (!title || !alertBody) {
    return NextResponse.json({ error: "title and body required" }, { status: 400 });
  }

  try {
    let userIds: string[] = [];

    if (target === "ALL_MANAGERS") {
      const rows = await sql`
        SELECT id FROM users
        WHERE is_active = TRUE AND role IN ('manager', 'admin', 'super_admin')
      `;
      userIds = (rows as { id: string }[]).map(r => r.id);
    } else if (target === "ALL_LEADS") {
      const rows = await sql`
        SELECT id FROM users
        WHERE is_active = TRUE AND role = 'lead'
      `;
      userIds = (rows as { id: string }[]).map(r => r.id);
    } else if (target.startsWith("ALL_ASSIGNED:")) {
      const metricName = target.slice(13);
      const rows = await sql`
        SELECT DISTINCT ma.user_id AS id
        FROM metric_assignments ma
        JOIN metrics m ON m.id = ma.metric_id
        WHERE m.name ILIKE ${"%" + metricName + "%"}
      `;
      userIds = (rows as { id: string }[]).map(r => r.id);
      // Also include managers for visibility
      const mgrRows = await sql`
        SELECT id FROM users
        WHERE is_active = TRUE AND role IN ('manager', 'admin', 'super_admin')
      `;
      const mgrIds = (mgrRows as { id: string }[]).map(r => r.id);
      userIds = [...new Set([...userIds, ...mgrIds])];
    } else {
      // Assume it's a user UUID
      const exists = await sql`SELECT id FROM users WHERE id = ${target} AND is_active = TRUE`;
      if (exists.length) {
        userIds = [target];
      } else {
        // Try matching by name
        const nameRows = await sql`
          SELECT id FROM users WHERE name ILIKE ${"%" + target + "%"} AND is_active = TRUE LIMIT 1
        `;
        if (nameRows.length) {
          userIds = [(nameRows[0] as { id: string }).id];
        }
      }
    }

    if (userIds.length === 0) {
      return NextResponse.json({ error: "No recipients found" }, { status: 404 });
    }

    // Insert notifications for each user
    let count = 0;
    for (const userId of userIds) {
      try {
        await sql`
          INSERT INTO notifications (user_id, type, title, body, severity, action_url, sender_id)
          VALUES (${userId}, 'metric_alert', ${title}, ${alertBody}, 'warning', '/metrics', ${me.id})
        `;
        count++;
      } catch (e) {
        console.warn(`[ai-actions] Failed to notify ${userId}:`, e);
      }
    }

    return NextResponse.json({
      data: { count, recipients: userIds.length },
    });
  } catch (e: unknown) {
    console.error("[ai-actions] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
