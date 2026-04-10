import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";

/**
 * POST /api/metrics/contribute
 *
 * Records a per-user, per-day contribution to a metric. When multiple
 * employees are assigned to the same metric, their contributions are
 * summed to produce the overall metric value.
 *
 * Body: { metricId, value, checkinId? }
 *   - value = the employee's individual contribution (delta for Total,
 *     absolute count for Daily metrics)
 */
export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { metricId: string; value: number; checkinId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { metricId, value, checkinId } = body;
  if (!metricId || value === undefined || value === null) {
    return NextResponse.json({ error: "metricId and value required" }, { status: 400 });
  }

  try {
    // 1. Look up the metric
    const metricRows = await sql`
      SELECT id, metric_type, current_value FROM metrics WHERE id = ${metricId}
    `;
    if (!metricRows.length) {
      return NextResponse.json({ error: "Metric not found" }, { status: 404 });
    }
    const metric = metricRows[0] as { id: string; metric_type: string; current_value: string };
    const metricType = metric.metric_type;
    const oldCurrentValue = Number(metric.current_value) || 0;

    // 2. Get old contribution for this user+metric+today (if any)
    const oldContribRows = await sql`
      SELECT value FROM metric_contributions
      WHERE metric_id = ${metricId}
        AND user_id = ${me.id}
        AND contribution_date = CURRENT_DATE
    `;
    const oldContribValue = oldContribRows.length
      ? Number((oldContribRows[0] as { value: string }).value)
      : 0;

    // 3. Check if this is the very first contribution today for this metric
    //    (across ALL users). If so, snapshot previous_value.
    if (!oldContribRows.length) {
      const anyTodayRows = await sql`
        SELECT COUNT(*)::int AS cnt FROM metric_contributions
        WHERE metric_id = ${metricId}
          AND contribution_date = CURRENT_DATE
      `;
      const isFirstToday = Number((anyTodayRows[0] as { cnt: number }).cnt) === 0;
      if (isFirstToday) {
        await sql`
          UPDATE metrics SET previous_value = current_value
          WHERE id = ${metricId}
        `;
      }
    }

    // 4. Upsert the contribution
    await sql`
      INSERT INTO metric_contributions (metric_id, user_id, checkin_id, contribution_date, value)
      VALUES (${metricId}, ${me.id}, ${checkinId || null}, CURRENT_DATE, ${value})
      ON CONFLICT (metric_id, user_id, contribution_date)
      DO UPDATE SET
        value = ${value},
        checkin_id = COALESCE(${checkinId || null}, metric_contributions.checkin_id),
        updated_at = NOW()
    `;

    // 5. Recalculate metric value
    let newCurrentValue: number;

    if (metricType === "daily") {
      // Daily: current_value = SUM of all today's contributions
      const sumRows = await sql`
        SELECT COALESCE(SUM(value), 0) AS total FROM metric_contributions
        WHERE metric_id = ${metricId} AND contribution_date = CURRENT_DATE
      `;
      newCurrentValue = Number((sumRows[0] as { total: string }).total);
      await sql`
        UPDATE metrics
        SET current_value = ${newCurrentValue}, updated_at = NOW()
        WHERE id = ${metricId}
      `;
    } else {
      // Total (value / value_and_daily): add delta to current
      const delta = value - oldContribValue;
      newCurrentValue = oldCurrentValue + delta;
      await sql`
        UPDATE metrics
        SET current_value = ${newCurrentValue}, updated_at = NOW()
        WHERE id = ${metricId}
      `;
    }

    // 6. Audit trail (non-fatal)
    try {
      await sql`
        INSERT INTO metric_updates (metric_id, user_id, checkin_id, source, old_value, new_value, notes)
        VALUES (${metricId}, ${me.id}, ${checkinId || null}, 'checkin', ${oldCurrentValue}, ${newCurrentValue}, 'contribution')
      `;
    } catch (auditErr) {
      console.warn("[contribute] audit insert failed (non-fatal):", auditErr);
    }

    return NextResponse.json({
      data: { metricId, oldValue: oldCurrentValue, newValue: newCurrentValue, contribution: value },
    });
  } catch (e: unknown) {
    console.error("[contribute] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
