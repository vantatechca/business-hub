import { NextRequest, NextResponse } from "next/server";
import { sql, rowsToCamel, toDateString } from "@/lib/db";
import bcrypt from "bcryptjs";
import { getInitials } from "@/lib/types";
import { getSessionUser, canSeeSuperAdmin, isAdmin } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const me = await getSessionUser();
  const { searchParams } = new URL(req.url);
  const role = searchParams.get("role");
  try {
    const includeSA = canSeeSuperAdmin(me?.role);
    // Four query shapes — inline because the neon tagged-template doesn't
    // compose WHERE fragments nicely. Each query explicitly filters out
    // role='super_admin' unless the caller IS the super admin.
    const rows = role
      ? (includeSA
          ? await sql`SELECT id, email, name, role, is_active, timezone, last_login_at, last_checkin_at, created_at, birthday, must_change_password FROM users WHERE role = ${role} ORDER BY name`
          : await sql`SELECT id, email, name, role, is_active, timezone, last_login_at, last_checkin_at, created_at, birthday, must_change_password FROM users WHERE role = ${role} AND role != 'super_admin' ORDER BY name`)
      : (includeSA
          ? await sql`SELECT id, email, name, role, is_active, timezone, last_login_at, last_checkin_at, created_at, birthday, must_change_password FROM users ORDER BY role, name`
          : await sql`SELECT id, email, name, role, is_active, timezone, last_login_at, last_checkin_at, created_at, birthday, must_change_password FROM users WHERE role != 'super_admin' ORDER BY role, name`);
    const users = rowsToCamel<Record<string,unknown>>(rows as Record<string,unknown>[]).map(u => ({
      ...u,
      initials: getInitials(u.name as string),
      birthday: toDateString(u.birthday),
      checkedInToday: false,
    }));
    return NextResponse.json({ data: users });
  } catch { return NextResponse.json({ error: "DB not configured" }, { status: 503 }); }
}

export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!isAdmin(me?.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json();
  if (!b.name || !b.email || !b.role) return NextResponse.json({ error: "name, email, role required" }, { status: 400 });
  // Super admin creation restricted.
  if (b.role === "super_admin" && me?.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const pw = b.password ?? "member123";
  const hash = await bcrypt.hash(pw, 10);
  const requiresCheckin       = b.role === "manager" ? true : (b.requiresCheckin ?? false);
  const birthdayNotifications = b.role === "manager" ? true : (b.birthdayNotifications ?? false);

  try {
    const rows = await sql`
      INSERT INTO users (email, name, password_hash, role, timezone, birthday,
                         must_change_password, requires_checkin, birthday_notifications)
      VALUES (${b.email}, ${b.name}, ${hash}, ${b.role}, ${b.timezone ?? "America/Toronto"},
              ${b.birthday ?? null}, TRUE, ${requiresCheckin}, ${birthdayNotifications})
      RETURNING id, email, name, role, is_active, created_at, birthday
    `;
    await logAudit({
      action: "user.create",
      entityType: "user",
      entityId: (rows[0] as { id: string }).id,
      metadata: { name: b.name, email: b.email, role: b.role },
      req,
    });
    return NextResponse.json({ data: rows[0], tempPassword: pw }, { status: 201 });
  } catch(e: unknown) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
