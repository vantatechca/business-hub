import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSessionUser, isLeadOrHigher, canSeeSuperAdmin } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

// POST /api/alerts
//
// Body: { target: "all" | "<userId>", title, body?, severity? }
//
// Permission: lead, manager, admin, super_admin (anyone above member). The
// alert is fanned out by INSERT-ing one notifications row per recipient,
// reusing the existing notifications panel for delivery.
//
// "all" means every active user EXCEPT the super admin (unless the sender
// IS the super admin, in which case it's true broadcast). The sender is
// always excluded — no point in sending an alert to yourself.
export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isLeadOrHigher(me.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const b = await req.json();
  const target = String(b.target ?? "").trim();
  const title  = String(b.title ?? "").trim();
  const body   = b.body ? String(b.body).trim() : null;
  const severity = ["info", "warning", "critical"].includes(b.severity) ? b.severity : "info";
  if (!target) return NextResponse.json({ error: "target is required" }, { status: 400 });
  if (!title)  return NextResponse.json({ error: "title is required"  }, { status: 400 });

  try {
    let recipientIds: string[] = [];
    if (target === "all") {
      const includeSA = canSeeSuperAdmin(me.role);
      const rows = includeSA
        ? await sql`SELECT id FROM users WHERE is_active = TRUE AND id != ${me.id}`
        : await sql`SELECT id FROM users WHERE is_active = TRUE AND id != ${me.id} AND role != 'super_admin'`;
      recipientIds = (rows as { id: string }[]).map(r => r.id);
    } else {
      // Single-recipient. Validate they exist and aren't the super admin
      // unless the sender can see them.
      const includeSA = canSeeSuperAdmin(me.role);
      const rows = includeSA
        ? await sql`SELECT id FROM users WHERE id = ${target} AND is_active = TRUE`
        : await sql`SELECT id FROM users WHERE id = ${target} AND is_active = TRUE AND role != 'super_admin'`;
      if (!rows.length) return NextResponse.json({ error: "Recipient not found" }, { status: 404 });
      recipientIds = [rows[0].id];
    }

    // INSERT one row per recipient. We could use a single INSERT ... SELECT
    // but the per-row form keeps the schema simple and gives us per-row
    // PK for the dismiss/read flow.
    for (const rid of recipientIds) {
      await sql`
        INSERT INTO notifications (user_id, type, title, body, severity, sender_id)
        VALUES (${rid}, 'alert', ${title}, ${body}, ${severity}, ${me.id})
      `;
    }

    await logAudit({
      action: "alert.send",
      entityType: "alert",
      metadata: { target, title, severity, recipientCount: recipientIds.length },
      req,
    });

    return NextResponse.json({ data: { recipients: recipientIds.length } }, { status: 201 });
  } catch (e) {
    console.error("[alerts/POST] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
