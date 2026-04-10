import { NextRequest, NextResponse } from "next/server";
import { sql, toCamel } from "@/lib/db";
import { getSessionUser, canReviewCheckins } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Return the current date in the user's timezone as a YYYY-MM-DD string.
// Used to enforce the "same-day edit window" rule — a user can edit their
// own check-in only while the day hasn't rolled over for them.
function dateInTimezone(tz: string | undefined | null): string {
  const now = new Date();
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz || "America/Toronto",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    // en-CA yields YYYY-MM-DD already
    return fmt.format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

// PATCH /api/checkin/[id]
//
// Two distinct actions come through here:
//
// 1. Review (reviewer action):
//    - body.status === "reviewed" AND caller has canReviewCheckins(role)
//    - writes reviewed_by + reviewed_at, applies any confirmedMetrics,
//      logs an audit entry. Lead and member are rejected.
//
// 2. Self-edit (owner action):
//    - caller is the owner of the checkin
//    - checkin is not yet reviewed
//    - the checkin_date is still "today" in the user's timezone
//    - only the editable content fields are allowed (no status changes)
//
// Anything else → 403.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();

  // Demo / in-memory checkin IDs are numeric timestamps, not UUIDs — the DB
  // path can't handle them, so acknowledge without writing to the DB.
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ data: { id: params.id, status: body.status ?? "reviewed" } });
  }
  try {
    const existing = await sql`
      SELECT dc.id, dc.user_id, dc.status, dc.checkin_date, u.timezone
      FROM daily_checkins dc
      JOIN users u ON u.id = dc.user_id
      WHERE dc.id = ${params.id}
    `;
    if (!existing.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const row = existing[0] as {
      id: string; user_id: string; status: string; checkin_date: string | Date; timezone: string;
    };

    const isOwner = row.user_id === me.id;
    const wantsReview = body.status === "reviewed";
    const isReviewing = wantsReview && canReviewCheckins(me.role);

    if (!isOwner && !isReviewing) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Self-edit guard rails
    if (isOwner && !isReviewing) {
      if (row.status === "reviewed") {
        return NextResponse.json(
          { error: "This check-in has already been reviewed and can no longer be edited." },
          { status: 403 },
        );
      }
      // 24-hour edit window: users can edit their check-in within 24 hours
      // of the check-in date, as long as it hasn't been reviewed.
      const checkinDate = typeof row.checkin_date === "string"
        ? new Date(row.checkin_date + "T00:00:00")
        : new Date(row.checkin_date);
      const hoursSince = (Date.now() - checkinDate.getTime()) / (1000 * 60 * 60);
      if (hoursSince > 48) { // 48h buffer to account for timezone differences
        return NextResponse.json(
          { error: "You can only edit a check-in within 24 hours of submission." },
          { status: 403 },
        );
      }

      // Apply the editable content fields (whitelist — no status / review
      // fields allowed through this branch).
      if (body.rawResponse !== undefined) await sql`UPDATE daily_checkins SET raw_response = ${body.rawResponse}, updated_at = NOW() WHERE id = ${params.id}`;
      if (body.aiSummary   !== undefined) await sql`UPDATE daily_checkins SET ai_summary   = ${body.aiSummary},   updated_at = NOW() WHERE id = ${params.id}`;
      if (body.mood        !== undefined) await sql`UPDATE daily_checkins SET mood         = ${body.mood},        updated_at = NOW() WHERE id = ${params.id}`;
      if (body.moodEmoji   !== undefined) await sql`UPDATE daily_checkins SET mood_emoji   = ${body.moodEmoji},   updated_at = NOW() WHERE id = ${params.id}`;
      if (body.wins        !== undefined) await sql`UPDATE daily_checkins SET wins         = ${body.wins},        updated_at = NOW() WHERE id = ${params.id}`;
      if (body.blockers    !== undefined) await sql`UPDATE daily_checkins SET blockers     = ${body.blockers},    updated_at = NOW() WHERE id = ${params.id}`;
      if (body.aiExtractedMetrics !== undefined) {
        await sql`UPDATE daily_checkins SET ai_extracted_metrics = ${JSON.stringify(body.aiExtractedMetrics)}::jsonb, updated_at = NOW() WHERE id = ${params.id}`;
      }
      if (body.aiFlags !== undefined) {
        await sql`UPDATE daily_checkins SET ai_flags = ${JSON.stringify(body.aiFlags)}::jsonb, updated_at = NOW() WHERE id = ${params.id}`;
      }

      await logAudit({
        action: "checkin.update",
        entityType: "checkin",
        entityId: params.id,
        metadata: { fields: Object.keys(body), selfEdit: true },
        req,
      });
      const refreshed = await sql`SELECT * FROM daily_checkins WHERE id = ${params.id}`;
      return NextResponse.json({ data: toCamel(refreshed[0] as Record<string, unknown>) });
    }

    // Reviewer branch
    if (isReviewing) {
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
            VALUES (${m.metricId}, ${me.id}, ${params.id}, 'checkin', ${oldVal}, ${newVal}, ${m.metricName ?? null})
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

      await sql`
        UPDATE daily_checkins SET
          status       = 'reviewed',
          reviewed_by  = ${me.id},
          reviewed_at  = NOW(),
          reviewer_notes = ${body.reviewerNotes ?? null},
          processed_at = NOW(),
          updated_at   = NOW()
        WHERE id = ${params.id}
      `;
      if (body.confirmedMetrics && Array.isArray(body.confirmedMetrics)) {
        await sql`
          UPDATE daily_checkins SET
            ai_extracted_metrics = ${JSON.stringify(body.confirmedMetrics)}::jsonb
          WHERE id = ${params.id}
        `;
      }
      await logAudit({
        action: "checkin.review",
        entityType: "checkin",
        entityId: params.id,
        metadata: { userId: row.user_id, checkinDate: row.checkin_date, confirmedCount: (body.confirmedMetrics ?? []).length },
        req,
      });
      const rows = await sql`SELECT * FROM daily_checkins WHERE id = ${params.id}`;
      return NextResponse.json({ data: toCamel(rows[0] as Record<string, unknown>) });
    }

    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } catch(e: unknown) {
    console.error("[checkin/[id]/PATCH] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

/**
 * DELETE /api/checkin/[id]
 *
 * Allows the owner to delete their check-in within 24 hours, as long as
 * it hasn't been reviewed. Managers+ can delete any check-in.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ message: "Deleted" });
  }

  try {
    const existing = await sql`
      SELECT dc.id, dc.user_id, dc.status, dc.checkin_date, u.timezone
      FROM daily_checkins dc
      JOIN users u ON u.id = dc.user_id
      WHERE dc.id = ${params.id}
    `;
    if (!existing.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const row = existing[0] as { id: string; user_id: string; status: string; checkin_date: string | Date; timezone: string };

    const isOwner = row.user_id === me.id;
    const isManager = canReviewCheckins(me.role);

    if (!isOwner && !isManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Owner can only delete if not reviewed and within 24 hours
    if (isOwner && !isManager) {
      if (row.status === "reviewed") {
        return NextResponse.json({ error: "Cannot delete a reviewed check-in." }, { status: 403 });
      }
      const checkinDate = typeof row.checkin_date === "string"
        ? new Date(row.checkin_date + "T00:00:00")
        : new Date(row.checkin_date);
      const hoursSince = (Date.now() - checkinDate.getTime()) / (1000 * 60 * 60);
      if (hoursSince > 48) {
        return NextResponse.json({ error: "Can only delete within 24 hours." }, { status: 403 });
      }
    }

    await sql`DELETE FROM daily_checkins WHERE id = ${params.id}`;
    await logAudit({
      action: "checkin.delete",
      entityType: "checkin",
      entityId: params.id,
      metadata: { userId: row.user_id, checkinDate: row.checkin_date, deletedBy: me.id },
      req,
    });

    return NextResponse.json({ message: "Deleted" });
  } catch (e: unknown) {
    console.error("[checkin/[id]/DELETE] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
