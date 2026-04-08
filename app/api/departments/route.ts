import { NextRequest, NextResponse } from "next/server";
import { sql, rowsToCamel } from "@/lib/db";

export async function GET() {
  try {
    // Counts come from separate scalar subqueries so a type mismatch on any
    // one FK won't fail the whole row (e.g. a task.department_id that's
    // TEXT while users.department_id is UUID still returns valid numbers
    // for the joinable tables).
    // member_count comes from the user_departments junction table now —
    // members and team leads are equally counted, and the legacy
    // users.department_id column is no longer authoritative.
    const rows = await sql`
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
    return NextResponse.json({ data: rowsToCamel(rows as Record<string,unknown>[]) });
  } catch (e) {
    console.error("[departments/GET] error:", e);
    return NextResponse.json({ error: "DB not configured" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const b = await req.json();
  // The form sends "head" as the department description, plus an optional
  // "notes" textarea (which replaces the old health field). description and
  // notes are stored as separate columns: description is the short tagline
  // shown on the card, notes is the long-form content shown on detail pages.
  const description = b.description ?? b.head ?? null;
  try {
    const rows = await sql`
      INSERT INTO departments (name, slug, color, icon, priority_score, google_sheet_url, description, notes, sort_order)
      VALUES (${b.name}, ${b.slug ?? b.name.toLowerCase().replace(/\s+/g,"-")}, ${b.color ?? "#5b8ef8"},
              ${b.icon ?? "📦"}, ${b.priorityScore ?? 50}, ${b.googleSheetUrl ?? null}, ${description},
              ${b.notes ?? null}, ${b.sortOrder ?? 99})
      RETURNING *
    `;
    return NextResponse.json({ data: rows[0] }, { status: 201 });
  } catch(e: unknown) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
