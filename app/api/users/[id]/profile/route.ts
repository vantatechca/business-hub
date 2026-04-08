import { NextRequest, NextResponse } from "next/server";
import { sql, toCamel, toDateString } from "@/lib/db";
import {
  getSessionUser,
  canViewOthersProfile,
  canEditOthersProfile,
  canSeeSuperAdmin,
} from "@/lib/authz";
import { logAudit } from "@/lib/audit";

// GET /api/users/[id]/profile
// Role gate:
//   super_admin, admin, manager  →  view any profile (except super_admin,
//                                   unless the viewer IS super_admin)
//   lead, member                  →  404 (they can't use the drawer)
// The 404 return for leads is intentional: we're treating the endpoint as
// non-existent for unauthorized viewers, matching the super_admin stealth
// pattern.
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canViewOthersProfile(me.role) && me.id !== params.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const rows = await sql`
      SELECT u.id, u.email, u.name, u.role, u.timezone, u.birthday, u.avatar_url,
             u.job_title, u.address, u.phone, u.skills, u.hobbies, u.favorite_quote,
             u.bio, u.pronouns, u.requires_checkin, u.birthday_notifications,
             u.is_active, u.department_id, u.last_login_at, u.last_checkin_at
      FROM users u
      WHERE u.id = ${params.id}
    `;
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const row = rows[0] as Record<string, unknown>;
    // Stealth: pretend the super admin doesn't exist unless the caller IS
    // the super admin.
    if (row.role === "super_admin" && !canSeeSuperAdmin(me.role)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const profile = toCamel<Record<string, unknown>>(row);
    profile.birthday = toDateString(profile.birthday);

    const deptRows = await sql`
      SELECT ud.department_id AS id, d.name, d.color, ud.role_in_dept
      FROM user_departments ud
      LEFT JOIN departments d ON d.id::text = ud.department_id::text
      WHERE ud.user_id = ${params.id}
    `;
    profile.departments = deptRows.map(r => ({
      id: String(r.id),
      name: r.name,
      color: r.color,
      roleInDept: r.role_in_dept,
    }));
    return NextResponse.json({ data: profile });
  } catch (e) {
    console.error("[users/[id]/profile/GET] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// PATCH /api/users/[id]/profile
// Only super_admin can edit another user's profile. Admin + manager can only
// view (handled by the GET → drawer in read-only mode).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEditOthersProfile(me.role)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const b = await req.json();
  try {
    if (b.name          !== undefined) await sql`UPDATE users SET name          = ${b.name},              updated_at = NOW() WHERE id = ${params.id}`;
    if (b.email         !== undefined) await sql`UPDATE users SET email         = ${b.email},             updated_at = NOW() WHERE id = ${params.id}`;
    if (b.timezone      !== undefined) await sql`UPDATE users SET timezone      = ${b.timezone},          updated_at = NOW() WHERE id = ${params.id}`;
    if (b.birthday      !== undefined) await sql`UPDATE users SET birthday      = ${b.birthday || null},  updated_at = NOW() WHERE id = ${params.id}`;
    if (b.jobTitle      !== undefined) await sql`UPDATE users SET job_title     = ${b.jobTitle || null},  updated_at = NOW() WHERE id = ${params.id}`;
    if (b.address       !== undefined) await sql`UPDATE users SET address       = ${b.address || null},   updated_at = NOW() WHERE id = ${params.id}`;
    if (b.phone         !== undefined) await sql`UPDATE users SET phone         = ${b.phone || null},     updated_at = NOW() WHERE id = ${params.id}`;
    if (b.skills        !== undefined) await sql`UPDATE users SET skills        = ${b.skills || null},    updated_at = NOW() WHERE id = ${params.id}`;
    if (b.hobbies       !== undefined) await sql`UPDATE users SET hobbies       = ${b.hobbies || null},   updated_at = NOW() WHERE id = ${params.id}`;
    if (b.favoriteQuote !== undefined) await sql`UPDATE users SET favorite_quote = ${b.favoriteQuote || null}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.bio           !== undefined) await sql`UPDATE users SET bio           = ${b.bio || null},       updated_at = NOW() WHERE id = ${params.id}`;
    if (b.pronouns      !== undefined) await sql`UPDATE users SET pronouns      = ${b.pronouns || null},  updated_at = NOW() WHERE id = ${params.id}`;
    if (b.requiresCheckin       !== undefined) await sql`UPDATE users SET requires_checkin       = ${!!b.requiresCheckin},       updated_at = NOW() WHERE id = ${params.id}`;
    if (b.birthdayNotifications !== undefined) await sql`UPDATE users SET birthday_notifications = ${!!b.birthdayNotifications}, updated_at = NOW() WHERE id = ${params.id}`;

    await logAudit({
      action: "profile.update_other",
      entityType: "user",
      entityId: params.id,
      metadata: { fields: Object.keys(b) },
      req,
    });
    return NextResponse.json({ message: "Profile updated" });
  } catch (e) {
    console.error("[users/[id]/profile/PATCH] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
