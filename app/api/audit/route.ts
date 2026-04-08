import { NextRequest, NextResponse } from "next/server";
import { sql, rowsToCamel } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

// GET /api/audit
// Query params:
//   action    — filter by exact action string
//   actor     — filter by actor email substring
//   from      — ISO date (inclusive)
//   to        — ISO date (inclusive)
//   limit     — default 200, max 1000
//   offset    — default 0
//
// Super admin only. The endpoint pretends not to exist for everyone else
// (via requireSuperAdmin which returns 404 instead of 403).
export async function GET(req: NextRequest) {
  const forbidden = await requireSuperAdmin();
  if (forbidden) return forbidden;

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");
  const actor  = searchParams.get("actor");
  const from   = searchParams.get("from");
  const to     = searchParams.get("to");
  const limit  = Math.min(1000, Math.max(1, Number(searchParams.get("limit") ?? 200)));
  const offset = Math.max(0, Number(searchParams.get("offset") ?? 0));

  try {
    // Neon tagged-template doesn't support dynamic WHERE clauses easily,
    // so we build up a filter using a single query with all the conditions
    // being null-coalesced. Postgres handles NULL on both sides cleanly.
    const rows = await sql`
      SELECT id, occurred_at, actor_id, actor_email, actor_role,
             action, entity_type, entity_id, ip, user_agent, metadata
      FROM audit_logs
      WHERE (${action}::text IS NULL OR action = ${action})
        AND (${actor}::text IS NULL OR actor_email ILIKE ${'%' + (actor ?? '') + '%'})
        AND (${from}::text IS NULL OR occurred_at >= ${from}::timestamptz)
        AND (${to}::text IS NULL OR occurred_at < (${to}::timestamptz + INTERVAL '1 day'))
      ORDER BY occurred_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;
    return NextResponse.json({ data: rowsToCamel(rows as Record<string, unknown>[]) });
  } catch (e) {
    console.error("[audit/GET] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// DELETE /api/audit?from=YYYY-MM-DD&to=YYYY-MM-DD
// Super admin only. Bulk-deletes audit rows in the given date range
// (inclusive on both sides). The super admin is the only user with this
// power — the choice was to skip automatic retention and put deletion under
// manual control.
export async function DELETE(req: NextRequest) {
  const forbidden = await requireSuperAdmin();
  if (forbidden) return forbidden;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to   = searchParams.get("to");
  if (!from || !to) {
    return NextResponse.json({ error: "from and to are required" }, { status: 400 });
  }
  try {
    const rows = await sql`
      DELETE FROM audit_logs
      WHERE occurred_at >= ${from}::timestamptz
        AND occurred_at < (${to}::timestamptz + INTERVAL '1 day')
      RETURNING id
    `;
    const deleted = rows.length;
    // Self-audit — record the deletion itself so there's a trail of it
    // (the deletion row survives unless the SA also wipes today's range).
    await logAudit({
      action: "audit.delete",
      entityType: "audit_log",
      metadata: { from, to, count: deleted },
      req,
    });
    return NextResponse.json({ deleted });
  } catch (e) {
    console.error("[audit/DELETE] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
