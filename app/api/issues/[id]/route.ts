import { NextRequest, NextResponse } from "next/server";
import { sql, toCamel } from "@/lib/db";
import {
  getSessionUser,
  isAdmin,
  isLeadOrHigher,
  isSuperAdmin,
} from "@/lib/authz";
import { logAudit } from "@/lib/audit";

// Permission helper: can the viewer act on this issue (assign / resolve /
// change status)? Routing rules:
//   system → admin / super_admin
//   work   → lead / manager / admin / super_admin
//   reporter is allowed to view + close their own issue but not assign others
function canActOnCategory(viewerRole: string | undefined, category: string): boolean {
  if (category === "system") return isAdmin(viewerRole);
  if (category === "work")   return isLeadOrHigher(viewerRole);
  return false;
}

// PATCH /api/issues/[id]
//
// Body: { status?, assigneeId?, resolutionNotes?, archived? }
//
// Status transitions: open → in_progress → resolved. When status flips to
// 'resolved', resolved_at + resolver_id are set, AND a notification is sent
// back to the reporter ("Your issue '{title}' has been resolved by {who}").
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json();

  try {
    const existing = await sql`
      SELECT id, reporter_id, category, status, title FROM issues WHERE id = ${params.id}
    `;
    if (!existing.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const row = existing[0] as { id: string; reporter_id: string; category: string; status: string; title: string };
    const isReporter = row.reporter_id === me.id;
    const canAct = canActOnCategory(me.role, row.category);
    if (!isReporter && !canAct) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Reporter can only mark their own issue resolved. They can't assign
    // others or change category.
    if (!canAct && (b.assigneeId !== undefined || b.archived !== undefined)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Field updates
    if (b.assigneeId !== undefined) {
      await sql`UPDATE issues SET assignee_id = ${b.assigneeId || null} WHERE id = ${params.id}`;
    }
    if (b.resolutionNotes !== undefined) {
      await sql`UPDATE issues SET resolution_notes = ${b.resolutionNotes || null} WHERE id = ${params.id}`;
    }
    if (b.archived !== undefined) {
      // Only super admin can manually archive/unarchive (auto-archive runs
      // on every list call separately).
      if (!isSuperAdmin(me.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (b.archived) {
        await sql`UPDATE issues SET archived = TRUE, archived_at = NOW() WHERE id = ${params.id}`;
      } else {
        await sql`UPDATE issues SET archived = FALSE, archived_at = NULL WHERE id = ${params.id}`;
      }
    }

    if (b.status !== undefined) {
      const next = ["open", "in_progress", "resolved"].includes(b.status) ? b.status : null;
      if (!next) return NextResponse.json({ error: "Invalid status" }, { status: 400 });

      if (next === "resolved") {
        await sql`
          UPDATE issues
          SET status = 'resolved',
              resolver_id = ${me.id},
              resolved_at = NOW()
          WHERE id = ${params.id}
        `;
        // Notify the reporter — but only if the resolver isn't the reporter
        // themselves (don't spam yourself).
        if (row.reporter_id !== me.id) {
          await sql`
            INSERT INTO notifications (user_id, type, title, body, action_url, severity, sender_id)
            VALUES (
              ${row.reporter_id},
              'issue_update',
              ${"✅ Your issue has been resolved"},
              ${`"${row.title}" was marked resolved by ${me.name}.`},
              ${"/issues"},
              'info',
              ${me.id}
            )
          `;
        }
        await logAudit({
          action: "issue.resolve",
          entityType: "issue",
          entityId: params.id,
          metadata: { title: row.title, category: row.category },
          req,
        });
      } else if (next === "in_progress") {
        // Moving to in_progress = "I'm taking this". Auto-set assignee_id to
        // the actor so the issue card shows who picked it up. If somebody
        // had already been explicitly assigned we don't overwrite that.
        await sql`
          UPDATE issues
          SET status = 'in_progress',
              assignee_id = COALESCE(assignee_id, ${me.id})
          WHERE id = ${params.id}
        `;
        await logAudit({
          action: "issue.status_change",
          entityType: "issue",
          entityId: params.id,
          metadata: { from: row.status, to: next, takenBy: me.id },
          req,
        });
      } else {
        await sql`UPDATE issues SET status = ${next} WHERE id = ${params.id}`;
        await logAudit({
          action: "issue.status_change",
          entityType: "issue",
          entityId: params.id,
          metadata: { from: row.status, to: next },
          req,
        });
      }
    }

    const updated = await sql`
      SELECT i.*, r.name AS reporter_name, a.name AS assignee_name, s.name AS resolver_name
      FROM issues i
      LEFT JOIN users r ON r.id = i.reporter_id
      LEFT JOIN users a ON a.id = i.assignee_id
      LEFT JOIN users s ON s.id = i.resolver_id
      WHERE i.id = ${params.id}
    `;
    return NextResponse.json({ data: toCamel(updated[0] as Record<string, unknown>) });
  } catch (e) {
    console.error("[issues/[id]/PATCH] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

// DELETE /api/issues/[id] — super admin only. Hard delete, no recovery.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!isSuperAdmin(me?.role)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const rows = await sql`DELETE FROM issues WHERE id = ${params.id} RETURNING id, title`;
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await logAudit({
      action: "issue.delete",
      entityType: "issue",
      entityId: params.id,
      metadata: { title: (rows[0] as { title: string }).title },
      req,
    });
    return NextResponse.json({ message: "Deleted" });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
