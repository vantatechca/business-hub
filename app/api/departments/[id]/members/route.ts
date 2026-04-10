import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSessionUser, isManagerOrHigher } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

/**
 * Permission check for department member mutations:
 *   - admin / super_admin: can manage any department
 *   - manager: can manage any department
 *   - lead: can manage ONLY departments where they are a lead (role_in_dept = 'lead')
 *   - member: cannot manage
 *
 * Returns true if allowed, false otherwise.
 */
async function canManageDeptMembers(
  me: { id: string; role: string } | null,
  departmentId: string,
): Promise<boolean> {
  if (!me) return false;
  if (isManagerOrHigher(me.role)) return true;
  if (me.role !== "lead") return false;
  try {
    const rows = await sql`
      SELECT 1 FROM user_departments
      WHERE user_id = ${me.id}
        AND department_id::text = ${departmentId}
        AND role_in_dept = 'lead'
      LIMIT 1
    `;
    return rows.length > 0;
  } catch {
    return false;
  }
}

// POST /api/departments/[id]/members
//   Body: { userId, roleInDept: 'lead' | 'member' }
// Adds a row to user_departments OR updates the existing row's role_in_dept.
//
// Permission: admin/super_admin/manager, OR a lead of THIS department.
// Leads cannot promote someone else to 'lead' — they can only add members.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!(await canManageDeptMembers(me, params.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const b = await req.json();
  const userId = String(b.userId ?? "").trim();
  let roleInDept = b.roleInDept === "lead" ? "lead" : "member";
  // Leads can add members but cannot promote someone to 'lead'
  if (me && me.role === "lead" && roleInDept === "lead") {
    roleInDept = "member";
  }
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  try {
    await sql`
      INSERT INTO user_departments (user_id, department_id, role_in_dept)
      VALUES (${userId}, ${params.id}, ${roleInDept})
      ON CONFLICT (user_id, department_id) DO UPDATE
        SET role_in_dept = EXCLUDED.role_in_dept
    `;
    // Send notification to the assigned user
    try {
      const deptRows = await sql`SELECT name FROM departments WHERE id = ${params.id}`;
      const deptName = deptRows.length ? (deptRows[0] as { name: string }).name : "a department";
      const roleLabel = roleInDept === "lead" ? "Team Lead" : "Member";
      await sql`
        INSERT INTO notifications (user_id, type, title, body, severity, action_url, sender_id)
        VALUES (${userId}, 'metric_alert', ${`Added to ${deptName} as ${roleLabel}`},
                ${`${me?.name ?? "Admin"} added you to the "${deptName}" department as ${roleLabel}.`},
                'info', '/departments', ${me?.id ?? null})
      `;
    } catch (notifErr) {
      console.warn("[departments/members/POST] notification failed:", notifErr);
    }
    await logAudit({
      action: "department.member_assign",
      entityType: "department",
      entityId: params.id,
      metadata: { userId, roleInDept },
      req,
    });
    return NextResponse.json({ message: "Assigned" }, { status: 201 });
  } catch (e) {
    console.error("[departments/[id]/members/POST] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

// DELETE /api/departments/[id]/members?userId=...
// Removes a single membership row. Doesn't touch the user record itself.
// Permission: same as POST — admin/manager or department lead.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!(await canManageDeptMembers(me, params.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  try {
    await sql`
      DELETE FROM user_departments
      WHERE department_id = ${params.id} AND user_id = ${userId}
    `;
    await logAudit({
      action: "department.member_remove",
      entityType: "department",
      entityId: params.id,
      metadata: { userId },
      req,
    });
    return NextResponse.json({ message: "Removed" });
  } catch (e) {
    console.error("[departments/[id]/members/DELETE] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
