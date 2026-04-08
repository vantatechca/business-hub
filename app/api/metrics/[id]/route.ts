import { NextRequest, NextResponse } from "next/server";
import { sql, toCamel, toDateString } from "@/lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NUMERIC_FIELDS = ["currentValue", "previousValue", "thirtyDayTotal", "targetValue"] as const;
function coerceMetric(m: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...m };
  for (const f of NUMERIC_FIELDS) {
    if (out[f] != null) out[f] = Number(out[f]);
  }
  if (out.dueDate != null) out.dueDate = toDateString(out.dueDate);
  return out;
}

// Normalize helpers
const toNum = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const toInt = (v: unknown): number | null => {
  const n = toNum(v);
  return n == null ? null : Math.round(n);
};
const toStr = (v: unknown): string | null => (v == null ? null : String(v));

/**
 * The PATCH is intentionally written as a series of small conditional UPDATE
 * statements rather than a single COALESCE-based UPDATE. That avoids two
 * failure modes we hit before:
 *
 *   1. Postgres "could not determine data type of parameter" when a NULL
 *      parameter was inside COALESCE — fixed because we never pass NULL
 *      parameters any more.
 *
 *   2. `::uuid` casts failing for DBs where departments (or even metrics)
 *      have slug-shaped TEXT ids — fixed because there are no explicit
 *      casts; the driver coerces the string to whatever the column type is.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Only pull values that were actually present in the body. undefined = don't touch.
  const name          = "name"          in b ? toStr(b.name)          : undefined;
  const notes         = "notes"         in b ? toStr(b.notes)         : undefined;
  const metricType    = "metricType"    in b ? toStr(b.metricType)    : undefined;
  const direction     = "direction"     in b ? toStr(b.direction)     : undefined;
  const unit          = "unit"          in b ? toStr(b.unit)          : undefined;
  const currentValue  = "currentValue"  in b ? toNum(b.currentValue)  : undefined;
  const targetValue   = "targetValue"   in b ? toNum(b.targetValue)   : undefined;
  const priorityScore = "priorityScore" in b ? toInt(b.priorityScore) : undefined;
  const departmentId  = "departmentId"  in b ? toStr(b.departmentId)  : undefined;
  const sortOrder     = "sortOrder"     in b ? toInt(b.sortOrder)     : undefined;
  // dueDate: empty string / null means clear it. Anything else is YYYY-MM-DD.
  const dueDate       = "dueDate"       in b ? (b.dueDate || null)    : undefined;

  const auditUserId = toStr(b.userId);
  const auditSource = toStr(b.source) ?? "manual";
  const auditNotes  = toStr(b.notes);

  try {
    // Look up existing so we can audit current_value changes correctly
    const existingRows = await sql`SELECT current_value FROM metrics WHERE id = ${params.id}`;
    if (!existingRows.length) {
      return NextResponse.json({ error: "Metric not found" }, { status: 404 });
    }
    const oldCurrent = Number((existingRows[0] as Record<string, unknown>).current_value);

    // Only audit / bump previous_value when current_value actually changes
    const currentValueChanged =
      currentValue !== undefined && currentValue !== null && currentValue !== oldCurrent;

    if (currentValueChanged) {
      // previous_value gets bumped to the old current
      await sql`UPDATE metrics SET previous_value = current_value WHERE id = ${params.id}`;
      await sql`UPDATE metrics SET current_value = ${currentValue}, updated_at = NOW() WHERE id = ${params.id}`;
      // Audit record — wrapped so a metric_updates schema issue doesn't break the PATCH
      try {
        await sql`
          INSERT INTO metric_updates (metric_id, user_id, source, old_value, new_value, notes)
          VALUES (${params.id}, ${auditUserId}, ${auditSource}, ${oldCurrent}, ${currentValue}, ${auditNotes})
        `;
      } catch (auditErr) {
        console.warn("[metrics/PATCH] metric_updates insert failed (non-fatal):", auditErr);
      }
    }

    // Apply the rest — one simple UPDATE per field. Each query only runs when
    // the caller actually sent that field, so no NULL parameters inside the UPDATEs.
    if (name         != null) await sql`UPDATE metrics SET name = ${name}, updated_at = NOW() WHERE id = ${params.id}`;
    if (notes        != null) await sql`UPDATE metrics SET notes = ${notes}, updated_at = NOW() WHERE id = ${params.id}`;
    if (metricType   != null) await sql`UPDATE metrics SET metric_type = ${metricType}, updated_at = NOW() WHERE id = ${params.id}`;
    if (direction    != null) await sql`UPDATE metrics SET direction = ${direction}, updated_at = NOW() WHERE id = ${params.id}`;
    if (unit         != null) await sql`UPDATE metrics SET unit = ${unit}, updated_at = NOW() WHERE id = ${params.id}`;
    if (targetValue  != null) await sql`UPDATE metrics SET target_value = ${targetValue}, updated_at = NOW() WHERE id = ${params.id}`;
    if (priorityScore!= null) await sql`UPDATE metrics SET priority_score = ${priorityScore}, updated_at = NOW() WHERE id = ${params.id}`;
    if (departmentId != null) await sql`UPDATE metrics SET department_id = ${departmentId}, updated_at = NOW() WHERE id = ${params.id}`;
    if (sortOrder    != null) await sql`UPDATE metrics SET sort_order = ${sortOrder}, updated_at = NOW() WHERE id = ${params.id}`;
    if (dueDate      !== undefined) await sql`UPDATE metrics SET due_date = ${dueDate}, updated_at = NOW() WHERE id = ${params.id}`;

    // Return the final state
    const finalRows = await sql`
      SELECT m.*, d.name AS department_name, d.color AS department_color
      FROM metrics m
      LEFT JOIN departments d ON d.id = m.department_id
      WHERE m.id = ${params.id}
    `;
    if (!finalRows.length) {
      return NextResponse.json({ error: "Metric disappeared during update" }, { status: 404 });
    }
    return NextResponse.json({
      data: coerceMetric(toCamel(finalRows[0] as Record<string, unknown>)),
    });
  } catch (e: unknown) {
    // Log to server (Render Logs) so future errors are debuggable
    console.error("[metrics/PATCH] error:", e);
    return NextResponse.json(
      { error: (e as Error).message ?? "Update failed" },
      { status: 400 },
    );
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await sql`DELETE FROM metrics WHERE id = ${params.id}`;
    return NextResponse.json({ message: "Deleted" });
  } catch (e: unknown) {
    console.error("[metrics/DELETE] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

// Silence unused-var warnings if the regex isn't referenced.
void UUID_RE;
