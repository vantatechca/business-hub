import { NextRequest, NextResponse } from "next/server";
import { sql, toCamel } from "@/lib/db";

// PATCH /api/team/[id] — update a team member. This is just a user update
// scoped to the fields the Team page cares about.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json();
  try {
    if (b.name         !== undefined) await sql`UPDATE users SET name = ${b.name}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.email        !== undefined) await sql`UPDATE users SET email = ${b.email}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.role         !== undefined) await sql`UPDATE users SET role = ${b.role}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.jobTitle     !== undefined) await sql`UPDATE users SET job_title = ${b.jobTitle || null}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.departmentId !== undefined) await sql`UPDATE users SET department_id = ${b.departmentId || null}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.status       !== undefined) await sql`UPDATE users SET status = ${b.status}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.birthday     !== undefined) await sql`UPDATE users SET birthday = ${b.birthday || null}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.checkedInToday !== undefined) {
      // Only the last_checkin_at column exists on users; toggling the check-in
      // flag updates it to now or nulls it out.
      if (b.checkedInToday) await sql`UPDATE users SET last_checkin_at = NOW() WHERE id = ${params.id}`;
      else await sql`UPDATE users SET last_checkin_at = NULL WHERE id = ${params.id}`;
    }
    const rows = await sql`
      SELECT u.id, u.email, u.name, u.role, u.job_title, u.status, u.birthday,
             u.department_id, d.name AS department_name, u.is_active
      FROM users u LEFT JOIN departments d ON d.id = u.department_id
      WHERE u.id = ${params.id}
    `;
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ data: toCamel(rows[0] as Record<string, unknown>) });
  } catch (e: unknown) {
    console.error("[team/[id]/PATCH] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

// DELETE soft-deactivates the user so they keep their audit history and can
// be reactivated from /users.
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await sql`UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = ${params.id}`;
    return NextResponse.json({ message: "Deactivated" });
  } catch (e: unknown) {
    console.error("[team/[id]/DELETE] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
