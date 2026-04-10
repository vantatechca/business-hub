import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSessionUser, isManagerOrHigher } from "@/lib/authz";

/**
 * POST /api/recurring-expenses/check-due
 *
 * Finds recurring expenses due within their notify_days_before window and
 * sends notifications to all managers/admins/super_admins. Can be invoked
 * manually from the UI or via a cron job.
 *
 * Deduplicates by checking if a notification already exists for the same
 * (recurring_expense_id, due_date) combo today.
 */
export async function POST() {
  const me = await getSessionUser();
  if (!me || !isManagerOrHigher(me.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // Find recurring expenses where today + notify_days_before >= next_due_date
    const dueRows = await sql`
      SELECT r.*, d.name AS department_name
      FROM recurring_expenses r
      LEFT JOIN departments d ON d.id::text = r.department_id::text
      WHERE r.is_active = TRUE
        AND r.next_due_date <= CURRENT_DATE + (r.notify_days_before || ' days')::interval
    `;

    const managers = await sql`
      SELECT id, name FROM users
      WHERE is_active = TRUE AND role IN ('manager', 'admin', 'super_admin')
    `;
    const mgrIds = (managers as { id: string; name: string }[]).map(u => u.id);

    let notifsCreated = 0;
    const dueItems: Array<{ id: string; name: string; nextDueDate: string; amount: number; currency: string }> = [];

    for (const r of dueRows as Record<string, unknown>[]) {
      const nextDue = r.next_due_date instanceof Date
        ? `${r.next_due_date.getFullYear()}-${String(r.next_due_date.getMonth() + 1).padStart(2, "0")}-${String(r.next_due_date.getDate()).padStart(2, "0")}`
        : String(r.next_due_date).slice(0, 10);
      const daysUntil = Math.ceil((new Date(nextDue + "T00:00:00").getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000);
      const label = daysUntil <= 0 ? "Due today or overdue" : `Due in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`;
      const title = `${r.name}: ${label}`;
      const body = `${r.currency} ${Number(r.amount).toLocaleString()} recurring ${r.frequency} payment${r.department_name ? ` for ${r.department_name}` : ""}. Next due: ${nextDue}.`;

      dueItems.push({
        id: String(r.id),
        name: String(r.name),
        nextDueDate: nextDue,
        amount: Number(r.amount),
        currency: String(r.currency),
      });

      // Notify each manager
      for (const uid of mgrIds) {
        try {
          // Dedup: skip if an identical title already exists for this user today
          const existing = await sql`
            SELECT 1 FROM notifications
            WHERE user_id = ${uid}
              AND title = ${title}
              AND created_at::date = CURRENT_DATE
            LIMIT 1
          `;
          if (existing.length) continue;

          await sql`
            INSERT INTO notifications (user_id, type, title, body, severity, action_url, sender_id)
            VALUES (${uid}, 'metric_alert', ${title}, ${body},
                    ${daysUntil <= 0 ? "critical" : "warning"}, '/expenses', ${me.id})
          `;
          notifsCreated++;
        } catch (e) {
          console.warn("[check-due] notify failed:", e);
        }
      }
    }

    return NextResponse.json({
      data: {
        dueCount: dueItems.length,
        notificationsCreated: notifsCreated,
        items: dueItems,
      },
    });
  } catch (e: unknown) {
    console.error("[recurring-expenses/check-due] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
