import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { sql, rowsToCamel } from "@/lib/db";
import { getSessionUser, isManagerOrHigher, getUserScope } from "@/lib/authz";

export async function GET() {
  try {
    // Counts come from separate scalar subqueries so a type mismatch on any
    // one FK won't fail the whole row (e.g. a task.department_id that's
    // TEXT while users.department_id is UUID still returns valid numbers
    // for the joinable tables).
    // member_count comes from the user_departments junction table now —
    // members and team leads are equally counted, and the legacy
    // users.department_id column is no longer authoritative.
    //
    // Lead and member only see departments they're a member of (any
    // role_in_dept). Manager+ sees everything.
    const me = await getSessionUser();
    let rows: Record<string, unknown>[] = [];
    if (!me) {
      rows = [];
    } else if (isManagerOrHigher(me.role)) {
      rows = await sql`
        SELECT d.*,
          (SELECT COUNT(*)::int FROM metrics m WHERE m.department_id::text = d.id::text) AS metric_count,
          (SELECT COUNT(*)::int
             FROM user_departments ud
             JOIN users u ON u.id = ud.user_id
             WHERE ud.department_id::text = d.id::text
               AND u.is_active = TRUE
               AND u.role != 'super_admin') AS member_count,
          (SELECT COUNT(*)::int FROM tasks t WHERE t.department_id::text = d.id::text) AS task_count
        FROM departments d
        ORDER BY d.sort_order ASC, d.priority_score DESC
      `;
    } else {
      const scope = await getUserScope(me.id);
      rows = await sql`
        SELECT d.*,
          (SELECT COUNT(*)::int FROM metrics m WHERE m.department_id::text = d.id::text) AS metric_count,
          (SELECT COUNT(*)::int
             FROM user_departments ud
             JOIN users u ON u.id = ud.user_id
             WHERE ud.department_id::text = d.id::text
               AND u.is_active = TRUE
               AND u.role != 'super_admin') AS member_count,
          (SELECT COUNT(*)::int FROM tasks t WHERE t.department_id::text = d.id::text) AS task_count
        FROM departments d
        WHERE d.id::text = ANY(${scope.departmentIds}::text[])
        ORDER BY d.sort_order ASC, d.priority_score DESC
      `;
    }
    return NextResponse.json({ data: rowsToCamel(rows as Record<string,unknown>[]) });
  } catch (e) {
    console.error("[departments/GET] error:", e);
    return NextResponse.json({ error: "DB not configured" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  // Department create is manager+ only. Lead and member can see the list
  // (filtered to their memberships) but can't add new ones.
  const me = await getSessionUser();
  if (!isManagerOrHigher(me?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const b = await req.json();
  if (!b.name || !String(b.name).trim()) {
    return NextResponse.json({ error: "Department name is required" }, { status: 400 });
  }
  const description = b.description ?? b.head ?? null;

  // Build a unique, URL-safe slug. If the requested slug is taken, append
  // -2, -3, etc. until we find a free one.
  const baseSlug =
    (b.slug ?? String(b.name))
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "dept";

  try {
    let slug = baseSlug;
    let n = 1;
    // Try up to 20 variants
    while (n < 20) {
      const existing = await sql`SELECT 1 FROM departments WHERE slug = ${slug} LIMIT 1`;
      if (!existing.length) break;
      n++;
      slug = `${baseSlug}-${n}`;
    }

    // Generate the id in Node so we don't depend on the column having
    // a default (some deployments have departments.id as TEXT with no
    // default, which causes "null value violates not-null constraint").
    const newId = randomUUID();
    const rows = await sql`
      INSERT INTO departments (id, name, slug, color, icon, priority_score, google_sheet_url, description, notes, sort_order)
      VALUES (
        ${newId},
        ${b.name}, ${slug}, ${b.color ?? "#5b8ef8"},
        ${b.icon ?? "📦"}, ${b.priorityScore ?? 50}, ${b.googleSheetUrl ?? null}, ${description},
        ${b.notes ?? null}, ${b.sortOrder ?? 99}
      )
      RETURNING *
    `;
    return NextResponse.json({ data: rows[0] }, { status: 201 });
  } catch(e: unknown) {
    console.error("[departments/POST] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
