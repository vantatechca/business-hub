import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSessionUser, isManagerOrHigher } from "@/lib/authz";

/**
 * POST /api/tasks/[id]/convert
 *
 * Converts a task into a metric. Optionally deletes the original task
 * (move) or keeps it (copy / create similar).
 *
 * Body: { mode: "move" | "copy", metricType?: "value" | "daily", unit?: string, targetValue?: number }
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!isManagerOrHigher(me?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as {
    mode?: "move" | "copy";
    metricType?: string;
    unit?: string;
    targetValue?: number;
  };
  const mode = body.mode ?? "copy";

  try {
    // Fetch the source task
    const taskRows = await sql`SELECT * FROM tasks WHERE id = ${params.id}`;
    if (!taskRows.length) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    const task = taskRows[0] as Record<string, unknown>;

    // Build the metric from the task
    const metricType = body.metricType ?? "value";
    const unit = body.unit ?? "count";
    const priorityMap: Record<string, number> = { urgent: 90, high: 65, medium: 25, low: 10 };
    const priorityScore = priorityMap[String(task.priority)] ?? 25;

    // Insert the new metric
    const metricRows = await sql`
      INSERT INTO metrics (department_id, name, metric_type, direction, current_value, target_value, unit, priority_score, notes, due_date)
      VALUES (
        ${task.department_id ?? null},
        ${task.title},
        ${metricType},
        'higher_better',
        0,
        ${body.targetValue ?? null},
        ${unit},
        ${priorityScore},
        ${task.notes ?? null},
        ${task.due_date ?? null}
      )
      RETURNING id, name
    `;
    const newMetric = metricRows[0] as { id: string; name: string };

    // If there was an assignee on the task, create a metric assignment
    if (task.assignee_id) {
      try {
        await sql`
          INSERT INTO metric_assignments (metric_id, user_id, role_in_metric, assigned_by)
          VALUES (${newMetric.id}, ${task.assignee_id}, 'owner', ${me?.id ?? null})
          ON CONFLICT (metric_id, user_id) DO NOTHING
        `;
      } catch {}
    }

    // If move, delete the original task
    if (mode === "move") {
      await sql`DELETE FROM tasks WHERE id = ${params.id}`;
    }

    return NextResponse.json({
      data: { metric: newMetric, mode },
    });
  } catch (e: unknown) {
    console.error("[tasks/convert] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
