import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSessionUser, isManagerOrHigher } from "@/lib/authz";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Task edit + delete are manager+ only. Lead and member can view tasks (scoped
// by getUserScope in GET) but can't mutate them.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!isManagerOrHigher(me?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const b = await req.json();
  try {
    if (b.title        !== undefined) await sql`UPDATE tasks SET title = ${b.title}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.priority     !== undefined) await sql`UPDATE tasks SET priority = ${b.priority}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.status       !== undefined) await sql`UPDATE tasks SET status = ${b.status}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.departmentId !== undefined) await sql`UPDATE tasks SET department_id = ${b.departmentId || null}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.assigneeId   !== undefined) await sql`UPDATE tasks SET assignee_id = ${b.assigneeId || null}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.dueDate      !== undefined) {
      // Accept YYYY-MM-DD or empty/null. Reject anything else (e.g. the
      // "Wed Apr 08" legacy string from the old broken shape function)
      // with a clean error message instead of letting Postgres reject it.
      const raw = (b.dueDate ?? "") as string;
      if (raw && !ISO_DATE_RE.test(String(raw))) {
        return NextResponse.json({ error: `Invalid dueDate: ${raw}` }, { status: 400 });
      }
      await sql`UPDATE tasks SET due_date = ${raw || null}, updated_at = NOW() WHERE id = ${params.id}`;
    }
    if (b.sortOrder    !== undefined) await sql`UPDATE tasks SET sort_order = ${Number(b.sortOrder) || 0}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.notes        !== undefined) {
      try { await sql`UPDATE tasks SET notes = ${b.notes || null}, updated_at = NOW() WHERE id = ${params.id}`; } catch { /* column may not exist */ }
    }
    // Notification when assigning a task to someone new
    if (b.assigneeId && b.assigneeId !== me?.id) {
      try {
        const taskRows = await sql`SELECT title FROM tasks WHERE id = ${params.id}`;
        const taskName = taskRows.length ? (taskRows[0] as { title: string }).title : "a task";
        await sql`
          INSERT INTO notifications (user_id, type, title, body, severity, action_url, sender_id)
          VALUES (${b.assigneeId}, 'metric_alert', ${`Task assigned: ${taskName}`},
                  ${`${me?.name ?? "Admin"} assigned you the task "${taskName}".`},
                  'info', '/tasks', ${me?.id ?? null})
        `;
      } catch {}
    }
    return NextResponse.json({ message: "Updated" });
  } catch (e: unknown) {
    console.error("[tasks/[id]/PATCH] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!isManagerOrHigher(me?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    await sql`DELETE FROM tasks WHERE id = ${params.id}`;
    return NextResponse.json({ message: "Deleted" });
  } catch (e: unknown) {
    console.error("[tasks/[id]/DELETE] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
