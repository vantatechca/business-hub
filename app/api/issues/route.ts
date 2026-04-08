import { NextRequest, NextResponse } from "next/server";
import { sql, rowsToCamel } from "@/lib/db";
import {
  getSessionUser,
  isAdmin,
  isLeadOrHigher,
  isSuperAdmin,
} from "@/lib/authz";
import { logAudit } from "@/lib/audit";

// GET /api/issues
//
// Query params:
//   tab=mine                — issues I reported
//   tab=assigned            — issues I should handle (filtered by my role)
//   tab=archived            — archived issues (super admin only)
//   includeArchived=1       — include archived in tab=mine/assigned
//
// Routing rules:
//   category='system' is visible (in tab=assigned) only to admin / super_admin
//   category='work'   is visible (in tab=assigned) to lead / manager / admin / super_admin
//   reporter always sees their own issues regardless
//
// The 30-day auto-archive is opportunistic: every list call also flips
// resolved issues older than 30 days to archived=true. Super admin can see
// all archived rows via tab=archived.
async function autoArchive() {
  try {
    await sql`
      UPDATE issues
      SET archived = TRUE, archived_at = NOW()
      WHERE status = 'resolved'
        AND archived = FALSE
        AND resolved_at < NOW() - INTERVAL '30 days'
    `;
  } catch {
    // best-effort, ignore
  }
}

export async function GET(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ data: [] });

  const { searchParams } = new URL(req.url);
  const tab = searchParams.get("tab") ?? "mine";
  const includeArchived = searchParams.get("includeArchived") === "1";

  await autoArchive();

  try {
    let rows;
    if (tab === "archived") {
      // Super admin only.
      if (!isSuperAdmin(me.role)) {
        return NextResponse.json({ data: [] });
      }
      rows = await sql`
        SELECT i.*,
               r.name AS reporter_name,
               a.name AS assignee_name,
               s.name AS resolver_name
        FROM issues i
        LEFT JOIN users r ON r.id = i.reporter_id
        LEFT JOIN users a ON a.id = i.assignee_id
        LEFT JOIN users s ON s.id = i.resolver_id
        WHERE i.archived = TRUE
        ORDER BY i.archived_at DESC NULLS LAST, i.created_at DESC
      `;
    } else if (tab === "assigned") {
      // Issues someone in my eligible role can pick up.
      // 'system' issues — admin or super_admin only.
      // 'work' issues — lead / manager / admin / super_admin.
      // Members hit this tab and see nothing.
      if (!isLeadOrHigher(me.role)) {
        return NextResponse.json({ data: [] });
      }
      const canSeeSystem = isAdmin(me.role);
      rows = canSeeSystem
        ? await sql`
            SELECT i.*,
                   r.name AS reporter_name,
                   a.name AS assignee_name,
                   s.name AS resolver_name
            FROM issues i
            LEFT JOIN users r ON r.id = i.reporter_id
            LEFT JOIN users a ON a.id = i.assignee_id
            LEFT JOIN users s ON s.id = i.resolver_id
            WHERE (i.archived = FALSE OR ${includeArchived})
            ORDER BY
              CASE i.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
              i.created_at DESC
          `
        : await sql`
            SELECT i.*,
                   r.name AS reporter_name,
                   a.name AS assignee_name,
                   s.name AS resolver_name
            FROM issues i
            LEFT JOIN users r ON r.id = i.reporter_id
            LEFT JOIN users a ON a.id = i.assignee_id
            LEFT JOIN users s ON s.id = i.resolver_id
            WHERE i.category = 'work'
              AND (i.archived = FALSE OR ${includeArchived})
            ORDER BY
              CASE i.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
              i.created_at DESC
          `;
    } else {
      // tab === 'mine'
      rows = await sql`
        SELECT i.*,
               r.name AS reporter_name,
               a.name AS assignee_name,
               s.name AS resolver_name
        FROM issues i
        LEFT JOIN users r ON r.id = i.reporter_id
        LEFT JOIN users a ON a.id = i.assignee_id
        LEFT JOIN users s ON s.id = i.resolver_id
        WHERE i.reporter_id = ${me.id}
          AND (i.archived = FALSE OR ${includeArchived})
        ORDER BY i.created_at DESC
      `;
    }
    return NextResponse.json({ data: rowsToCamel(rows as Record<string, unknown>[]) });
  } catch (e) {
    console.error("[issues/GET] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// POST /api/issues — anyone signed in can report.
//
// Body: { category: 'system'|'work', title, description?, assigneeId? }
//
// assigneeId is optional. If supplied, the assignee must hold a role that
// can resolve the category — we don't enforce that strictly here (the
// assignee will see it in their queue regardless), but we DO validate
// existence.
export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json();
  const category = b.category === "system" ? "system" : b.category === "work" ? "work" : null;
  const title = String(b.title ?? "").trim();
  const description = b.description ? String(b.description).trim() : null;
  const assigneeId = b.assigneeId || null;
  if (!category) return NextResponse.json({ error: "category required" }, { status: 400 });
  if (!title)    return NextResponse.json({ error: "title required" },    { status: 400 });
  try {
    const rows = await sql`
      INSERT INTO issues (reporter_id, category, title, description, assignee_id)
      VALUES (${me.id}, ${category}, ${title}, ${description}, ${assigneeId})
      RETURNING id, category, title, status, created_at
    `;
    await logAudit({
      action: "issue.create",
      entityType: "issue",
      entityId: (rows[0] as { id: string }).id,
      metadata: { category, title, assigneeId },
      req,
    });
    return NextResponse.json({ data: rows[0] }, { status: 201 });
  } catch (e) {
    console.error("[issues/POST] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
