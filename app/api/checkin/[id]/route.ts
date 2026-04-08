import { NextRequest, NextResponse } from "next/server";
import { sql, toCamel } from "@/lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Apply confirmed metric updates after user reviews AI proposals
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  // Demo / in-memory checkin IDs are numeric timestamps, not UUIDs — the DB
  // path can't handle them, so acknowledge without writing to the DB.
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ data: { id: params.id, status: body.status ?? "reviewed" } });
  }
  try {
    // If confirmedMetrics provided, write each to metric_updates
    if (body.confirmedMetrics && Array.isArray(body.confirmedMetrics)) {
      for (const m of body.confirmedMetrics) {
        if (!m.confirmed || !m.metricId) continue;
        // Get current value
        const curr = await sql`SELECT current_value FROM metrics WHERE id = ${m.metricId}`;
        if (!curr.length) continue;
        const oldVal = Number(curr[0].current_value);
        const newVal = m.newValue ?? (oldVal + (m.delta ?? 0));

        await sql`
          INSERT INTO metric_updates (metric_id, user_id, checkin_id, source, old_value, new_value, notes)
          VALUES (${m.metricId}, ${body.userId ?? null}, ${params.id}, 'checkin', ${oldVal}, ${newVal}, ${m.metricName ?? null})
        `;
        await sql`
          UPDATE metrics SET
            previous_value = current_value,
            current_value  = ${newVal},
            updated_at     = NOW()
          WHERE id = ${m.metricId}
        `;
      }
    }

    // Update checkin status — always. Only overwrite ai_extracted_metrics
    // when the caller actually sent a confirmedMetrics array (otherwise the
    // previous bug was clobbering the AI data with jsonb null whenever a
    // "Mark as Reviewed" request came in).
    await sql`
      UPDATE daily_checkins SET
        status       = ${body.status ?? "reviewed"},
        processed_at = NOW()
      WHERE id = ${params.id}
    `;
    if (body.confirmedMetrics && Array.isArray(body.confirmedMetrics)) {
      await sql`
        UPDATE daily_checkins SET
          ai_extracted_metrics = ${JSON.stringify(body.confirmedMetrics)}::jsonb
        WHERE id = ${params.id}
      `;
    }
    const rows = await sql`SELECT * FROM daily_checkins WHERE id = ${params.id}`;
    return NextResponse.json({ data: toCamel(rows[0] as Record<string, unknown>) });
  } catch(e: unknown) {
    console.error("[checkin/[id]/PATCH] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
