import { NextRequest, NextResponse } from "next/server";
import { sql, toCamel } from "@/lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NUMERIC_FIELDS = ["currentValue", "previousValue", "thirtyDayTotal", "targetValue"] as const;
function coerceMetric(m: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...m };
  for (const f of NUMERIC_FIELDS) {
    if (out[f] != null) out[f] = Number(out[f]);
  }
  return out;
}

// Normalize incoming body values — absent / empty / invalid becomes null.
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
const toUuid = (v: unknown): string | null => {
  if (v == null || v === "") return null;
  const s = String(v);
  return UUID_RE.test(s) ? s : null;
};

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: "Invalid metric id (must be UUID)" }, { status: 400 });
  }

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Normalized values. undefined = field not in body → preserve existing.
  //                    null      = field present but empty → preserve existing.
  const name         = "name"          in b ? toStr(b.name)          : undefined;
  const notes        = "notes"         in b ? toStr(b.notes)         : undefined;
  const metricType   = "metricType"    in b ? toStr(b.metricType)    : undefined;
  const direction    = "direction"     in b ? toStr(b.direction)     : undefined;
  const unit         = "unit"          in b ? toStr(b.unit)          : undefined;
  const currentValue = "currentValue"  in b ? toNum(b.currentValue)  : undefined;
  const targetValue  = "targetValue"   in b ? toNum(b.targetValue)   : undefined;
  const priorityScore = "priorityScore" in b ? toInt(b.priorityScore) : undefined;
  const departmentId = "departmentId"  in b ? toUuid(b.departmentId) : undefined;
  const sortOrder    = "sortOrder"     in b ? toInt(b.sortOrder)     : undefined;

  // Audit columns
  const auditUserId = toUuid(b.userId);
  const auditSource = toStr(b.source) ?? "manual";
  const auditNotes  = toStr(b.notes);

  try {
    // Fetch existing so we can decide whether current_value actually changed
    const existing = await sql`SELECT current_value FROM metrics WHERE id = ${params.id}::uuid`;
    if (!existing.length) {
      return NextResponse.json({ error: "Metric not found" }, { status: 404 });
    }
    const oldCurrent = Number((existing[0] as Record<string, unknown>).current_value);

    const currentValueChanged =
      currentValue !== undefined && currentValue !== null && currentValue !== oldCurrent;

    // Audit trail: insert metric_updates only when current_value actually changed
    if (currentValueChanged) {
      try {
        await sql`
          INSERT INTO metric_updates (metric_id, user_id, source, old_value, new_value, notes)
          VALUES (
            ${params.id}::uuid,
            ${auditUserId}::uuid,
            ${auditSource}::text,
            ${oldCurrent}::numeric,
            ${currentValue}::numeric,
            ${auditNotes}::text
          )
        `;
      } catch (auditErr) {
        // Don't fail the whole PATCH if the audit insert has an issue
        console.warn("[metrics/PATCH] metric_updates insert failed:", auditErr);
      }
    }

    // When current_value changes, bump previous_value to the old current.
    // Otherwise leave previous_value alone.
    const newPreviousValue = currentValueChanged ? oldCurrent : null;

    // Single UPDATE with explicit type casts on every parameter. The casts are
    // critical: without them, an untyped NULL inside COALESCE can cause
    // Postgres "could not determine data type of parameter" errors.
    const rows = await sql`
      UPDATE metrics SET
        name           = COALESCE(${name ?? null}::text,       name),
        notes          = COALESCE(${notes ?? null}::text,      notes),
        metric_type    = COALESCE(${metricType ?? null}::text, metric_type),
        direction      = COALESCE(${direction ?? null}::text,  direction),
        unit           = COALESCE(${unit ?? null}::text,       unit),
        current_value  = COALESCE(${currentValue ?? null}::numeric, current_value),
        previous_value = COALESCE(${newPreviousValue}::numeric,     previous_value),
        target_value   = COALESCE(${targetValue ?? null}::numeric,  target_value),
        priority_score = COALESCE(${priorityScore ?? null}::integer, priority_score),
        department_id  = COALESCE(${departmentId ?? null}::uuid,     department_id),
        sort_order     = COALESCE(${sortOrder ?? null}::integer,     sort_order),
        updated_at     = NOW()
      WHERE id = ${params.id}::uuid
      RETURNING *
    `;

    if (!rows.length) {
      return NextResponse.json({ error: "Metric not found after update" }, { status: 404 });
    }
    return NextResponse.json({ data: coerceMetric(toCamel(rows[0] as Record<string, unknown>)) });
  } catch (e: unknown) {
    // Log to server (Render Logs) so we can diagnose the next time
    console.error("[metrics/PATCH] error:", e);
    return NextResponse.json(
      { error: (e as Error).message ?? "Update failed" },
      { status: 400 },
    );
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: "Invalid metric id (must be UUID)" }, { status: 400 });
  }
  try {
    await sql`DELETE FROM metrics WHERE id = ${params.id}::uuid`;
    return NextResponse.json({ message: "Deleted" });
  } catch (e: unknown) {
    console.error("[metrics/DELETE] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
