import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSessionUser, isManagerOrHigher } from "@/lib/authz";

/**
 * POST /api/metrics/[id]/convert
 *
 * Converts a metric into a task. Optionally deletes the original metric
 * (move) or keeps it (copy / create similar).
 *
 * Body: { mode: "move" | "copy", priority?: string, dueDate?: string }
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!isManagerOrHigher(me?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as {
    mode?: "move" | "copy";
    priority?: string;
    dueDate?: string;
  };
  const mode = body.mode ?? "copy";

  try {
    // Fetch source metric
    const metricRows = await sql`SELECT * FROM metrics WHERE id = ${params.id}`;
    if (!metricRows.length) return NextResponse.json({ error: "Metric not found" }, { status: 404 });
    const metric = metricRows[0] as Record<string, unknown>;

    // Build the task from the metric
    const priorityScore = Number(metric.priority_score) || 25;
    const priority = body.priority ?? (priorityScore >= 80 ? "urgent" : priorityScore >= 50 ? "high" : priorityScore >= 25 ? "medium" : "low");

    // Get the first owner of the metric (if any) to assign the task
    const ownerRows = await sql`
      SELECT user_id FROM metric_assignments
      WHERE metric_id = ${params.id} AND role_in_metric = 'owner'
      LIMIT 1
    `;
    const assigneeId = ownerRows.length ? (ownerRows[0] as { user_id: string }).user_id : null;

    // Insert the new task (with notes if column exists)
    let taskRows;
    try {
      taskRows = await sql`
        INSERT INTO tasks (title, priority, status, department_id, assignee_id, due_date, notes)
        VALUES (
          ${metric.name},
          ${priority},
          'todo',
          ${metric.department_id ?? null},
          ${assigneeId},
          ${body.dueDate ?? metric.due_date ?? null},
          ${metric.notes ?? null}
        )
        RETURNING id, title
      `;
    } catch {
      taskRows = await sql`
        INSERT INTO tasks (title, priority, status, department_id, assignee_id, due_date)
        VALUES (
          ${metric.name},
          ${priority},
          'todo',
          ${metric.department_id ?? null},
          ${assigneeId},
          ${body.dueDate ?? metric.due_date ?? null}
        )
        RETURNING id, title
      `;
    }
    const newTask = taskRows[0] as { id: string; title: string };

    if (mode === "move") {
      await sql`DELETE FROM metrics WHERE id = ${params.id}`;
    }

    return NextResponse.json({
      data: { task: newTask, mode },
    });
  } catch (e: unknown) {
    console.error("[metrics/convert] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
