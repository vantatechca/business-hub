import { NextRequest, NextResponse } from "next/server";
import { sql, rowsToCamel } from "@/lib/db";
import { getSessionUser, canSeeSuperAdmin, isManagerOrHigher, getUserScope } from "@/lib/authz";

export async function GET(req: NextRequest) {
  const me = await getSessionUser();
  const { searchParams } = new URL(req.url);
  const metricId = searchParams.get("metricId");
  const userId = searchParams.get("userId");
  const includeSA = canSeeSuperAdmin(me?.role);
  try {
    let rows;
    if (metricId) {
      rows = includeSA
        ? await sql`SELECT ma.*, u.name AS user_name, u.role AS user_role FROM metric_assignments ma JOIN users u ON u.id = ma.user_id WHERE ma.metric_id = ${metricId} ORDER BY ma.role_in_metric`
        : await sql`SELECT ma.*, u.name AS user_name, u.role AS user_role FROM metric_assignments ma JOIN users u ON u.id = ma.user_id WHERE ma.metric_id = ${metricId} AND u.role != 'super_admin' ORDER BY ma.role_in_metric`;
    } else if (userId) {
      rows = await sql`SELECT ma.*, m.name AS metric_name, d.name AS department_name FROM metric_assignments ma JOIN metrics m ON m.id = ma.metric_id JOIN departments d ON d.id = m.department_id WHERE ma.user_id = ${userId} ORDER BY m.priority_score DESC`;
    } else if (!me || isManagerOrHigher(me.role)) {
      rows = includeSA
        ? await sql`SELECT ma.*, u.name AS user_name, m.name AS metric_name FROM metric_assignments ma JOIN users u ON u.id = ma.user_id JOIN metrics m ON m.id = ma.metric_id`
        : await sql`SELECT ma.*, u.name AS user_name, m.name AS metric_name FROM metric_assignments ma JOIN users u ON u.id = ma.user_id JOIN metrics m ON m.id = ma.metric_id WHERE u.role != 'super_admin'`;
    } else {
      // Lead and member: assignments where THEY are the assignee, OR
      // assignments for any metric in a department they belong to (any
      // role_in_dept). Same OR-shape as the tasks / metrics filters.
      const scope = await getUserScope(me.id);
      rows = await sql`
        SELECT ma.*, u.name AS user_name, m.name AS metric_name
        FROM metric_assignments ma
        JOIN users u ON u.id = ma.user_id
        JOIN metrics m ON m.id = ma.metric_id
        WHERE u.role != 'super_admin'
          AND (
            ma.user_id = ${me.id}
            OR m.department_id::text = ANY(${scope.departmentIds}::text[])
          )
      `;
    }
    return NextResponse.json({ data: rowsToCamel(rows as Record<string,unknown>[]) });
  } catch { return NextResponse.json({ error: "DB not configured" }, { status: 503 }); }
}

export async function POST(req: NextRequest) {
  // Assignment create is manager+ only.
  const me = await getSessionUser();
  if (!isManagerOrHigher(me?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const b = await req.json();
  if (!b.metricId || !b.userId) return NextResponse.json({ error: "metricId and userId required" }, { status: 400 });
  try {
    const rows = await sql`
      INSERT INTO metric_assignments (metric_id, user_id, role_in_metric, assigned_by)
      VALUES (${b.metricId}, ${b.userId}, ${b.roleInMetric ?? "contributor"}, ${b.assignedBy ?? null})
      ON CONFLICT (metric_id, user_id) DO UPDATE SET role_in_metric = EXCLUDED.role_in_metric
      RETURNING *
    `;
    return NextResponse.json({ data: rows[0] }, { status: 201 });
  } catch(e: unknown) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}

export async function DELETE(req: NextRequest) {
  // Assignment remove is manager+ only.
  const me = await getSessionUser();
  if (!isManagerOrHigher(me?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { metricId, userId } = await req.json();
  try {
    await sql`DELETE FROM metric_assignments WHERE metric_id = ${metricId} AND user_id = ${userId}`;
    return NextResponse.json({ message: "Removed" });
  } catch(e: unknown) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
