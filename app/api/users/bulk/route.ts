import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSessionUser, isAdmin } from "@/lib/authz";

/**
 * POST /api/users/bulk
 *
 * Bulk update operations for user management. Admin/Super Admin only.
 *
 * Body: {
 *   action: "update_role" | "update_checkin" | "update_birthday_notif" | "update_timezone" | "reset_passwords" | "deactivate" | "activate",
 *   userIds: string[],
 *   value?: string | boolean,  // the new value to set
 * }
 */
export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me || !isAdmin(me.role)) {
    return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
  }

  let body: { action: string; userIds: string[]; value?: string | boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { action, userIds, value } = body;
  if (!action || !userIds?.length) {
    return NextResponse.json({ error: "action and userIds required" }, { status: 400 });
  }

  try {
    let updated = 0;

    for (const uid of userIds) {
      try {
        switch (action) {
          case "update_role":
            if (!value || !["super_admin", "admin", "manager", "lead", "member"].includes(value as string)) {
              return NextResponse.json({ error: `Invalid role: ${value}` }, { status: 400 });
            }
            await sql`UPDATE users SET role = ${value as string}, updated_at = NOW() WHERE id = ${uid}`;
            updated++;
            break;

          case "update_checkin":
            await sql`UPDATE users SET requires_checkin = ${!!value}, updated_at = NOW() WHERE id = ${uid}`;
            updated++;
            break;

          case "update_birthday_notif":
            await sql`UPDATE users SET birthday_notifications = ${!!value}, updated_at = NOW() WHERE id = ${uid}`;
            updated++;
            break;

          case "update_timezone":
            await sql`UPDATE users SET timezone = ${(value as string) || "America/Toronto"}, updated_at = NOW() WHERE id = ${uid}`;
            updated++;
            break;

          case "reset_passwords": {
            const bcrypt = require("bcryptjs");
            const hash = await bcrypt.hash("TempPass123!", 10);
            await sql`UPDATE users SET password_hash = ${hash}, must_change_password = TRUE, updated_at = NOW() WHERE id = ${uid}`;
            updated++;
            break;
          }

          case "deactivate":
            await sql`UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = ${uid}`;
            updated++;
            break;

          case "activate":
            await sql`UPDATE users SET is_active = TRUE, updated_at = NOW() WHERE id = ${uid}`;
            updated++;
            break;

          default:
            return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
        }
      } catch (e) {
        console.warn(`[users/bulk] Failed for ${uid}:`, e);
      }
    }

    return NextResponse.json({
      data: { action, updated, total: userIds.length },
    });
  } catch (e: unknown) {
    console.error("[users/bulk] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
