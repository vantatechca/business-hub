import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { sql } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

// POST /api/profile/password
// Self-service password change. Requires the current password for
// verification, except when the account has must_change_password=TRUE
// (first login), in which case the current password check is skipped —
// the user is already authenticated via the temp password, and we need
// them to be able to set a real one without remembering the temp.
export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { currentPassword, newPassword } = await req.json();
  if (!newPassword || newPassword.length < 6) {
    return NextResponse.json({ error: "New password must be at least 6 characters" }, { status: 400 });
  }
  try {
    const rows = await sql`SELECT password_hash, must_change_password FROM users WHERE id = ${me.id}`;
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const mustChange = !!rows[0].must_change_password;

    // Verify current password UNLESS this is a forced first-login change.
    if (!mustChange) {
      if (!currentPassword) {
        return NextResponse.json({ error: "Current password is required" }, { status: 400 });
      }
      const ok = await bcrypt.compare(currentPassword, rows[0].password_hash as string);
      if (!ok) {
        await logAudit({
          action: "auth.password_change_failed",
          entityType: "user",
          entityId: me.id,
          metadata: { reason: "bad_current_password" },
          req,
        });
        return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
      }
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await sql`
      UPDATE users
      SET password_hash = ${hash},
          must_change_password = FALSE,
          updated_at = NOW()
      WHERE id = ${me.id}
    `;
    await logAudit({
      action: "auth.password_change",
      entityType: "user",
      entityId: me.id,
      metadata: { forcedFirstLogin: mustChange },
      req,
    });
    return NextResponse.json({ message: "Password updated" });
  } catch (e) {
    console.error("[profile/password/POST] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
