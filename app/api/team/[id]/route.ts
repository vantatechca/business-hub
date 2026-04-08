import { NextRequest, NextResponse } from "next/server";
import { sql, toCamel } from "@/lib/db";
import { getSessionUser, canSeeSuperAdmin, isAdmin, isManagerOrHigher } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

// Super admin stealth: non-SA callers that try to touch an SA record get a
// 404 — the existence of the record is hidden, not just its modification.
async function denyIfSuperAdmin(targetId: string, viewerRole: string | undefined): Promise<boolean> {
  if (canSeeSuperAdmin(viewerRole)) return false;
  const rows = await sql`SELECT role FROM users WHERE id = ${targetId} LIMIT 1`;
  if (!rows.length) return true;
  return rows[0].role === "super_admin";
}

// PATCH /api/team/[id] — update a team member. Permission tier depends on
// what's being changed:
//   * checkedInToday only         → manager / admin / super_admin (the
//                                   "Mark In" button on the Team page)
//   * any other field             → admin / super_admin
// Anyone else gets 403 regardless of which fields are present.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  const b = await req.json();

  // Two permission tiers based on the body. The "Mark In" button only sends
  // { checkedInToday: ... }, so a manager hitting it should succeed even
  // though they can't edit / rename / change role on the same row.
  const fields = Object.keys(b);
  const isOnlyCheckIn = fields.length > 0 && fields.every(k => k === "checkedInToday");
  if (isOnlyCheckIn) {
    if (!isManagerOrHigher(me?.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else {
    if (!isAdmin(me?.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }
  if (await denyIfSuperAdmin(params.id, me?.role)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    if (b.name         !== undefined) await sql`UPDATE users SET name = ${b.name}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.email        !== undefined) await sql`UPDATE users SET email = ${b.email}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.role         !== undefined) {
      // Super admin can only be assigned by an existing super admin.
      if (b.role === "super_admin" && !canSeeSuperAdmin(me?.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      await sql`UPDATE users SET role = ${b.role}, updated_at = NOW() WHERE id = ${params.id}`;
    }
    if (b.jobTitle     !== undefined) await sql`UPDATE users SET job_title = ${b.jobTitle || null}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.departmentId !== undefined) await sql`UPDATE users SET department_id = ${b.departmentId || null}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.status       !== undefined) await sql`UPDATE users SET status = ${b.status}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.birthday     !== undefined) await sql`UPDATE users SET birthday = ${b.birthday || null}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.requiresCheckin       !== undefined) await sql`UPDATE users SET requires_checkin       = ${!!b.requiresCheckin},       updated_at = NOW() WHERE id = ${params.id}`;
    if (b.birthdayNotifications !== undefined) await sql`UPDATE users SET birthday_notifications = ${!!b.birthdayNotifications}, updated_at = NOW() WHERE id = ${params.id}`;

    // Multi-department: if caller passed departmentIds (array), diff against
    // the junction table to add/remove rows. roleInDept on each membership
    // is derived from the user's top-level role (lead → lead, everyone else
    // → member).
    if (Array.isArray(b.departmentIds)) {
      const roleRows = await sql`SELECT role FROM users WHERE id = ${params.id}`;
      const topRole = (roleRows[0]?.role as string) ?? "member";
      const roleInDept = topRole === "lead" ? "lead" : "member";
      const requested = (b.departmentIds as unknown[]).map(String).filter(Boolean);
      const existing = await sql`SELECT department_id FROM user_departments WHERE user_id = ${params.id}`;
      const existingIds = (existing as { department_id: string }[]).map(r => String(r.department_id));
      const toAdd    = requested.filter(d => !existingIds.includes(d));
      const toRemove = existingIds.filter(d => !requested.includes(d));
      for (const d of toAdd) {
        await sql`INSERT INTO user_departments (user_id, department_id, role_in_dept) VALUES (${params.id}, ${d}, ${roleInDept}) ON CONFLICT (user_id, department_id) DO NOTHING`;
      }
      for (const d of toRemove) {
        await sql`DELETE FROM user_departments WHERE user_id = ${params.id} AND department_id = ${d}`;
      }
    }

    if (b.checkedInToday !== undefined) {
      // Only the last_checkin_at column exists on users; toggling the check-in
      // flag updates it to now or nulls it out.
      if (b.checkedInToday) await sql`UPDATE users SET last_checkin_at = NOW() WHERE id = ${params.id}`;
      else await sql`UPDATE users SET last_checkin_at = NULL WHERE id = ${params.id}`;
    }
    const rows = await sql`
      SELECT u.id, u.email, u.name, u.role, u.job_title, u.status, u.birthday,
             u.department_id, d.name AS department_name, u.is_active,
             u.requires_checkin, u.birthday_notifications
      FROM users u LEFT JOIN departments d ON d.id = u.department_id
      WHERE u.id = ${params.id}
    `;
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await logAudit({
      action: "user.update",
      entityType: "user",
      entityId: params.id,
      metadata: { fields: Object.keys(b) },
      req,
    });
    return NextResponse.json({ data: toCamel(rows[0] as Record<string, unknown>) });
  } catch (e: unknown) {
    console.error("[team/[id]/PATCH] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

// DELETE hard-deletes the user. Related data:
//   user_departments, daily_checkins, metric_assignments, notifications,
//   issues (reporter_id) — all cascade automatically.
//   metric_assignments.assigned_by, daily_checkins.reviewed_by,
//   metric_updates.user_id — null'd out before delete (defensive against
//   legacy databases whose FK constraints predate the new ON DELETE rules).
//   login_messages — deleted explicitly so the FK doesn't block the user delete.
//   audit_logs.actor_id — already SET NULL on delete.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!isAdmin(me?.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (await denyIfSuperAdmin(params.id, me?.role)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (params.id === me?.id) {
    return NextResponse.json({ error: "You can't delete your own account." }, { status: 400 });
  }
  try {
    const target = await sql`SELECT email, role FROM users WHERE id = ${params.id}`;
    if (!target.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
  } catch (e: unknown) {
    console.error("[team/[id]/DELETE] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
