import { NextRequest, NextResponse } from "next/server";
import { sql, toCamel, toDateString } from "@/lib/db";
import { getSessionUser, canSeeSuperAdmin, isAdmin } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

// Hide super_admin rows from non-SA callers at the GET level.
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  try {
    const rows = await sql`
      SELECT u.*, ARRAY_AGG(DISTINCT jsonb_build_object('metricId', ma.metric_id, 'metricName', m.name, 'role', ma.role_in_metric)) FILTER (WHERE ma.id IS NOT NULL) AS assignments
      FROM users u
      LEFT JOIN metric_assignments ma ON ma.user_id = u.id
      LEFT JOIN metrics m ON m.id = ma.metric_id
      WHERE u.id = ${params.id} GROUP BY u.id
    `;
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const row = rows[0] as Record<string, unknown>;
    if (row.role === "super_admin" && !canSeeSuperAdmin(me?.role)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ data: toCamel(row) });
  } catch(e: unknown) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

async function denyIfSuperAdmin(targetId: string, viewerRole: string | undefined): Promise<boolean> {
  if (canSeeSuperAdmin(viewerRole)) return false;
  const rows = await sql`SELECT role FROM users WHERE id = ${targetId} LIMIT 1`;
  if (!rows.length) return true;
  return rows[0].role === "super_admin";
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!isAdmin(me?.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (await denyIfSuperAdmin(params.id, me?.role)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const b = await req.json();
  try {
    // Conditional updates per field to avoid COALESCE NULL type-inference issues.
    if (b.name      !== undefined) await sql`UPDATE users SET name = ${b.name}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.role      !== undefined) {
      if (b.role === "super_admin" && !canSeeSuperAdmin(me?.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      await sql`UPDATE users SET role = ${b.role}, updated_at = NOW() WHERE id = ${params.id}`;
    }
    if (b.isActive  !== undefined) await sql`UPDATE users SET is_active = ${!!b.isActive}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.timezone  !== undefined) await sql`UPDATE users SET timezone = ${b.timezone}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.requiresCheckin       !== undefined) await sql`UPDATE users SET requires_checkin       = ${!!b.requiresCheckin},       updated_at = NOW() WHERE id = ${params.id}`;
    if (b.birthdayNotifications !== undefined) await sql`UPDATE users SET birthday_notifications = ${!!b.birthdayNotifications}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.birthday  !== undefined) {
      // Allow clearing with null / empty string
      const bd = b.birthday ? b.birthday : null;
      await sql`UPDATE users SET birthday = ${bd}, updated_at = NOW() WHERE id = ${params.id}`;
    }
    const rows = await sql`SELECT id, email, name, role, is_active, timezone, birthday, requires_checkin, birthday_notifications FROM users WHERE id = ${params.id}`;
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const row = toCamel(rows[0] as Record<string,unknown>) as Record<string, unknown>;
    row.birthday = toDateString(row.birthday);
    await logAudit({
      action: "user.update",
      entityType: "user",
      entityId: params.id,
      metadata: { fields: Object.keys(b) },
      req,
    });
    return NextResponse.json({ data: row });
  } catch(e: unknown) {
    console.error("[users/[id]/PATCH] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!isAdmin(me?.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (await denyIfSuperAdmin(params.id, me?.role)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Don't let an admin delete themselves — they'd lose access immediately
  // and the row needs to exist to log them out cleanly.
  if (params.id === me?.id) {
    return NextResponse.json({ error: "You can't delete your own account." }, { status: 400 });
  }
  try {
    // Capture the email + role for the audit trail before the row vanishes.
    const target = await sql`SELECT email, role FROM users WHERE id = ${params.id}`;
    if (!target.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Defensive NULL-out for FK columns whose constraints might predate the
    // ON DELETE migration. Once setup-db.js has run, these are no-ops because
    // the constraints handle it; before that, they prevent the DELETE from
    // failing on legacy databases.
    await sql`UPDATE metric_assignments SET assigned_by = NULL WHERE assigned_by = ${params.id}`;
    await sql`UPDATE daily_checkins SET reviewed_by = NULL WHERE reviewed_by = ${params.id}`;
    await sql`UPDATE metric_updates SET user_id = NULL WHERE user_id = ${params.id}`;
    await sql`DELETE FROM login_messages WHERE from_user_id = ${params.id}`;

    await sql`DELETE FROM users WHERE id = ${params.id}`;
    await logAudit({
      action: "user.delete",
      entityType: "user",
      entityId: params.id,
      metadata: { email: (target[0] as { email: string }).email, role: (target[0] as { role: string }).role },
      req,
    });
    return NextResponse.json({ message: "Deleted" });
  } catch(e: unknown) {
    console.error("[users/[id]/DELETE] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
