import { NextRequest, NextResponse } from "next/server";
import { sql, rowsToCamel } from "@/lib/db";

export async function GET() {
  try {
    const rows = await sql`
      SELECT d.*, COUNT(DISTINCT m.id)::int AS metric_count, COUNT(DISTINCT ma.user_id)::int AS member_count
      FROM departments d
      LEFT JOIN metrics m ON m.department_id = d.id
      LEFT JOIN metric_assignments ma ON ma.metric_id = m.id
      GROUP BY d.id ORDER BY d.sort_order ASC, d.priority_score DESC
    `;
    return NextResponse.json({ data: rowsToCamel(rows as Record<string,unknown>[]) });
  } catch { return NextResponse.json({ error: "DB not configured" }, { status: 503 }); }
}

export async function POST(req: NextRequest) {
  const b = await req.json();
  try {
    const rows = await sql`
      INSERT INTO departments (name, slug, color, icon, priority_score, google_sheet_url, description, sort_order)
      VALUES (${b.name}, ${b.slug ?? b.name.toLowerCase().replace(/\s+/g,"-")}, ${b.color ?? "#5b8ef8"},
              ${b.icon ?? "📦"}, ${b.priorityScore ?? 50}, ${b.googleSheetUrl ?? null}, ${b.description ?? null}, ${b.sortOrder ?? 99})
      RETURNING *
    `;
    return NextResponse.json({ data: rows[0] }, { status: 201 });
  } catch(e: unknown) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
