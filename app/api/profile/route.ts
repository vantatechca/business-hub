import { NextRequest, NextResponse } from "next/server";
import { sql, toCamel, toDateString } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

// GET /api/profile  → the caller's own profile with all editable fields and
// their department membership rows (multi-dept).
export async function GET() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const rows = await sql`
      SELECT u.id, u.email, u.name, u.role, u.timezone, u.birthday, u.avatar_url,
             u.job_title, u.address, u.phone, u.skills, u.hobbies, u.favorite_quote,
             u.bio, u.pronouns, u.requires_checkin, u.birthday_notifications,
             u.must_change_password, u.department_id
      FROM users u
      WHERE u.id = ${me.id}
    `;
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const deptRows = await sql`
      SELECT ud.department_id AS id, d.name, d.color, ud.role_in_dept AS role_in_dept
      FROM user_departments ud
      LEFT JOIN departments d ON d.id::text = ud.department_id::text
      WHERE ud.user_id = ${me.id}
    `;

    const profile = toCamel<Record<string, unknown>>(rows[0] as Record<string, unknown>);
    profile.birthday = toDateString(profile.birthday);
    profile.departments = deptRows.map(r => ({
      id: String(r.id),
      name: r.name,
      color: r.color,
      roleInDept: r.role_in_dept,
    }));
    return NextResponse.json({ data: profile });
  } catch (e) {
    console.error("[profile/GET] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// PATCH /api/profile  → update my own profile. Users can edit their email,
// name, birthday, timezone, and all free-text profile fields. Role, department
// assignments, and active status are NOT editable here (admin-only via
// /api/users).
export async function PATCH(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json();
  try {
    if (b.name          !== undefined) await sql`UPDATE users SET name          = ${b.name},              updated_at = NOW() WHERE id = ${me.id}`;
    if (b.email         !== undefined) await sql`UPDATE users SET email         = ${b.email},             updated_at = NOW() WHERE id = ${me.id}`;
    if (b.timezone      !== undefined) await sql`UPDATE users SET timezone      = ${b.timezone},          updated_at = NOW() WHERE id = ${me.id}`;
    if (b.birthday      !== undefined) await sql`UPDATE users SET birthday      = ${b.birthday || null},  updated_at = NOW() WHERE id = ${me.id}`;
    if (b.jobTitle      !== undefined) await sql`UPDATE users SET job_title     = ${b.jobTitle || null},  updated_at = NOW() WHERE id = ${me.id}`;
    if (b.address       !== undefined) await sql`UPDATE users SET address       = ${b.address || null},   updated_at = NOW() WHERE id = ${me.id}`;
    if (b.phone         !== undefined) await sql`UPDATE users SET phone         = ${b.phone || null},     updated_at = NOW() WHERE id = ${me.id}`;
    if (b.skills        !== undefined) await sql`UPDATE users SET skills        = ${b.skills || null},    updated_at = NOW() WHERE id = ${me.id}`;
    if (b.hobbies       !== undefined) await sql`UPDATE users SET hobbies       = ${b.hobbies || null},   updated_at = NOW() WHERE id = ${me.id}`;
    if (b.favoriteQuote !== undefined) await sql`UPDATE users SET favorite_quote = ${b.favoriteQuote || null}, updated_at = NOW() WHERE id = ${me.id}`;
    if (b.bio           !== undefined) await sql`UPDATE users SET bio           = ${b.bio || null},       updated_at = NOW() WHERE id = ${me.id}`;
    if (b.pronouns      !== undefined) await sql`UPDATE users SET pronouns      = ${b.pronouns || null},  updated_at = NOW() WHERE id = ${me.id}`;

    await logAudit({
      action: "profile.update",
      entityType: "user",
      entityId: me.id,
      metadata: { fields: Object.keys(b) },
      req,
    });
    return NextResponse.json({ message: "Profile updated" });
  } catch (e) {
    console.error("[profile/PATCH] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
