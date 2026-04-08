import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { sql } from "@/lib/db";
import { getSessionUser, canSeeSuperAdmin, isAdmin } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

// POST /api/users/[id]/reset-password
// Admin or super_admin only. Generates a new random temporary password, hashes
// it, stores the hash, and returns the plaintext ONCE in the response. The
// plaintext is never persisted and never retrievable again. No endpoint
// anywhere exposes the stored hash — this is the only way an admin can help
// a user regain access.
//
// Setting must_change_password = TRUE so the user is forced to change it on
// their next login.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!isAdmin(me?.role)) {
    return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
  }

  // Super admin stealth: if the target is super_admin, pretend the row
  // doesn't exist to non-SA callers.
  if (!canSeeSuperAdmin(me?.role)) {
    const check = await sql`SELECT role FROM users WHERE id = ${params.id}`;
    if (!check.length || check[0].role === "super_admin") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  // New 10-char base36 password
  const tempPassword = Array.from({ length: 10 }, () => Math.random().toString(36).slice(2, 3)).join("");
  const hash = await bcrypt.hash(tempPassword, 10);

  try {
    const rows = await sql`
      UPDATE users
      SET password_hash = ${hash},
          must_change_password = TRUE,
          updated_at = NOW()
      WHERE id = ${params.id}
      RETURNING id, email, name
    `;
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await logAudit({
      action: "auth.password_reset",
      entityType: "user",
      entityId: params.id,
      metadata: { targetEmail: (rows[0] as { email: string }).email },
      req,
    });
    return NextResponse.json({
      data: rows[0],
      tempPassword,
      message: "Password reset. Share this password with the user — it cannot be retrieved again.",
    });
  } catch (e: unknown) {
    console.error("[users/[id]/reset-password] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
