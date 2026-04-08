import { NextRequest, NextResponse } from "next/server";
import { sql, rowsToCamel } from "@/lib/db";
import bcrypt from "bcryptjs";
import { getInitials } from "@/lib/types";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const role = searchParams.get("role");
  try {
    const rows = role
      ? await sql`SELECT id, email, name, role, is_active, timezone, last_login_at, last_checkin_at, created_at, birthday FROM users WHERE role = ${role} ORDER BY name`
      : await sql`SELECT id, email, name, role, is_active, timezone, last_login_at, last_checkin_at, created_at, birthday FROM users ORDER BY role, name`;
    const users = rowsToCamel<Record<string,unknown>>(rows as Record<string,unknown>[]).map(u => ({
      ...u,
      initials: getInitials(u.name as string),
      birthday: u.birthday ? String(u.birthday).slice(0, 10) : null,
      checkedInToday: false,
    }));
    return NextResponse.json({ data: users });
  } catch { return NextResponse.json({ error: "DB not configured" }, { status: 503 }); }
}

export async function POST(req: NextRequest) {
  const b = await req.json();
  if (!b.name || !b.email || !b.role) return NextResponse.json({ error: "name, email, role required" }, { status: 400 });
  const pw = b.password ?? "member123";
  const hash = await bcrypt.hash(pw, 10);
  try {
    const rows = await sql`
      INSERT INTO users (email, name, password_hash, role, timezone, birthday)
      VALUES (${b.email}, ${b.name}, ${hash}, ${b.role}, ${b.timezone ?? "America/Toronto"}, ${b.birthday ?? null})
      RETURNING id, email, name, role, is_active, created_at, birthday
    `;
    return NextResponse.json({ data: rows[0], tempPassword: pw }, { status: 201 });
  } catch(e: unknown) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
