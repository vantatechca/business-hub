import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { sql, rowsToCamel, toDateString } from "@/lib/db";
import { getInitials } from "@/lib/types";
import { getSessionUser, canSeeSuperAdmin, isAdmin } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

// Team page is a VIEW of the users table. The in-memory teamMembers array
// is gone — adding a member here creates a real user with auto-generated
// credentials that an admin can edit or reset later.

function slugifyEmail(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, ".")
    .slice(0, 40) || "member";
  return `${base}@hub.com`;
}

function randomPassword(): string {
  // 10-char base36 random string — shown once after creation, never stored
  // in plaintext and never retrievable via any API.
  return Array.from({ length: 10 }, () => Math.random().toString(36).slice(2, 3)).join("");
}

export async function GET() {
  const me = await getSessionUser();
  try {
    // The super admin user is invisible to everyone except themselves, so
    // non-SA viewers get a WHERE clause that hides role='super_admin'.
    const includeSuperAdmin = canSeeSuperAdmin(me?.role);
    const rows = includeSuperAdmin
      ? await sql`
          SELECT u.id, u.email, u.name, u.role, u.is_active, u.job_title, u.status,
                 u.birthday, u.last_login_at, u.last_checkin_at, u.department_id,
                 u.requires_checkin, u.birthday_notifications,
                 d.name AS department_name, d.color AS department_color
          FROM users u
          LEFT JOIN departments d ON d.id = u.department_id
          WHERE u.is_active = TRUE
          ORDER BY u.role, u.name
        `
      : await sql`
          SELECT u.id, u.email, u.name, u.role, u.is_active, u.job_title, u.status,
                 u.birthday, u.last_login_at, u.last_checkin_at, u.department_id,
                 u.requires_checkin, u.birthday_notifications,
                 d.name AS department_name, d.color AS department_color
          FROM users u
          LEFT JOIN departments d ON d.id = u.department_id
          WHERE u.is_active = TRUE AND u.role != 'super_admin'
          ORDER BY u.role, u.name
        `;

    // Fetch all department memberships in one query
    const userIds = (rows as { id: string }[]).map(r => r.id);
    const deptMap = new Map<string, Array<{ id: string; name: string; color?: string; roleInDept?: string }>>();
    if (userIds.length) {
      const deptRows = await sql`
        SELECT ud.user_id, ud.department_id AS id, d.name, d.color, ud.role_in_dept
        FROM user_departments ud
        LEFT JOIN departments d ON d.id::text = ud.department_id::text
        WHERE ud.user_id = ANY(${userIds}::uuid[])
      `;
      for (const r of deptRows as Record<string, unknown>[]) {
        const uid = r.user_id as string;
        if (!deptMap.has(uid)) deptMap.set(uid, []);
        deptMap.get(uid)!.push({
          id: String(r.id),
          name: r.name as string,
          color: r.color as string | undefined,
          roleInDept: r.role_in_dept as string | undefined,
        });
      }
    }

    const members = rowsToCamel<Record<string, unknown>>(rows as Record<string, unknown>[]).map(u => ({
      ...u,
      initials: getInitials(u.name as string),
      birthday: toDateString(u.birthday),
      checkedInToday: false,
      departments: deptMap.get(u.id as string) ?? [],
    }));
    return NextResponse.json({ data: members });
  } catch (e: unknown) {
    console.error("[team/GET] error:", e);
    return NextResponse.json({ error: "DB not configured" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!isAdmin(me?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const b = await req.json();
  const name: string = (b.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  // Auto-generate credentials. Admin can edit email later via /users.
  const email: string = (b.email && String(b.email).trim()) || slugifyEmail(name);
  const VALID_ROLES = ["admin", "manager", "lead", "member"] as const;
  // Only super_admin can create super_admin accounts.
  if (b.role === "super_admin" && me?.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const role: string = b.role === "super_admin"
    ? "super_admin"
    : VALID_ROLES.includes(b.role) ? b.role : "member";
  const tempPassword = randomPassword();
  const hash = await bcrypt.hash(tempPassword, 10);

  // Manager defaults — requires_checkin + birthday_notifications flip on
  // automatically. Admin/SA can still toggle them per user afterward.
  const requiresCheckin       = role === "manager" ? true : (b.requiresCheckin ?? false);
  const birthdayNotifications = role === "manager" ? true : (b.birthdayNotifications ?? false);

  try {
    const rows = await sql`
      INSERT INTO users (email, name, password_hash, role, department_id, job_title,
                         status, birthday, must_change_password,
                         requires_checkin, birthday_notifications)
      VALUES (
        ${email},
        ${name},
        ${hash},
        ${role},
        ${b.departmentId || null},
        ${b.jobTitle ?? b.role_title ?? null},
        ${b.status ?? "active"},
        ${b.birthday || null},
        TRUE,
        ${requiresCheckin},
        ${birthdayNotifications}
      )
      RETURNING id, email, name, role, is_active, department_id, job_title, status, birthday
    `;
    const newUser = rows[0] as { id: string };

    // Multi-department: also write to the junction table. If caller sent an
    // array of departmentIds, use those; otherwise fall back to the primary
    // department_id.
    const deptIds: string[] = Array.isArray(b.departmentIds)
      ? b.departmentIds.filter((x: unknown) => !!x)
      : (b.departmentId ? [b.departmentId] : []);
    for (const depId of deptIds) {
      await sql`
        INSERT INTO user_departments (user_id, department_id, role_in_dept)
        VALUES (${newUser.id}, ${depId}, ${role === "lead" ? "lead" : "member"})
        ON CONFLICT (user_id, department_id) DO NOTHING
      `;
    }

    await logAudit({
      action: "user.create",
      entityType: "user",
      entityId: newUser.id,
      metadata: { name, email, role, departmentIds: deptIds },
      req,
    });

    // Return the temp password ONCE so the admin can share it with the new user.
    // It's never queryable again.
    return NextResponse.json(
      { data: rows[0], tempPassword, email },
      { status: 201 },
    );
  } catch (e: unknown) {
    console.error("[team/POST] error:", e);
    const msg = (e as Error).message ?? "Failed to create member";
    // Friendly message for the common unique-email conflict
    if (msg.includes("users_email_key") || msg.toLowerCase().includes("duplicate")) {
      return NextResponse.json({ error: "Email already exists — edit email on the Users page" }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
