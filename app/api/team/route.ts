import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { sql, rowsToCamel } from "@/lib/db";
import { getInitials } from "@/lib/types";

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
  try {
    const rows = await sql`
      SELECT u.id, u.email, u.name, u.role, u.is_active, u.job_title, u.status,
             u.birthday, u.last_login_at, u.last_checkin_at, u.department_id,
             d.name AS department_name
      FROM users u
      LEFT JOIN departments d ON d.id = u.department_id
      WHERE u.is_active = TRUE
      ORDER BY u.role, u.name
    `;
    const members = rowsToCamel<Record<string, unknown>>(rows as Record<string, unknown>[]).map(u => ({
      ...u,
      initials: getInitials(u.name as string),
      birthday: u.birthday ? String(u.birthday).slice(0, 10) : null,
      checkedInToday: false,
    }));
    return NextResponse.json({ data: members });
  } catch (e: unknown) {
    console.error("[team/GET] error:", e);
    return NextResponse.json({ error: "DB not configured" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const b = await req.json();
  const name: string = (b.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  // Auto-generate credentials. Admin can edit email later via /users.
  const email: string = (b.email && String(b.email).trim()) || slugifyEmail(name);
  const role: string = b.role && ["admin", "leader", "member"].includes(b.role) ? b.role : "member";
  const tempPassword = randomPassword();
  const hash = await bcrypt.hash(tempPassword, 10);

  try {
    const rows = await sql`
      INSERT INTO users (email, name, password_hash, role, department_id, job_title, status, birthday)
      VALUES (
        ${email},
        ${name},
        ${hash},
        ${role},
        ${b.departmentId || null},
        ${b.jobTitle ?? b.role_title ?? null},
        ${b.status ?? "active"},
        ${b.birthday || null}
      )
      RETURNING id, email, name, role, is_active, department_id, job_title, status, birthday
    `;
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
