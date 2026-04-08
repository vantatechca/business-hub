import { NextRequest, NextResponse } from "next/server";
import { sql, rowsToCamel, toCamel } from "@/lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/checkin
//   ?date=YYYY-MM-DD                         → all checkins for that single day
//   ?userId=UUID&date=YYYY-MM-DD             → that user's checkin for that day (1)
//   ?userId=UUID&from=YYYY-MM-DD&to=YYYY-MM-DD → that user's checkins in range
//   ?from=YYYY-MM-DD&to=YYYY-MM-DD           → all checkins in range
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const date   = searchParams.get("date");
  const from   = searchParams.get("from");
  const to     = searchParams.get("to");

  // Demo / non-UUID users have no DB rows.
  if (userId && !UUID_RE.test(userId)) return NextResponse.json({ data: [] });

  try {
    let rows;
    if (userId && from && to) {
      rows = await sql`
        SELECT dc.*, u.name AS user_name
        FROM daily_checkins dc
        JOIN users u ON u.id = dc.user_id
        WHERE dc.user_id = ${userId} AND dc.checkin_date BETWEEN ${from} AND ${to}
        ORDER BY dc.checkin_date DESC
      `;
    } else if (from && to) {
      rows = await sql`
        SELECT dc.*, u.name AS user_name
        FROM daily_checkins dc
        JOIN users u ON u.id = dc.user_id
        WHERE dc.checkin_date BETWEEN ${from} AND ${to}
        ORDER BY dc.checkin_date DESC, dc.created_at DESC
      `;
    } else if (userId) {
      const targetDate = date ?? new Date().toISOString().slice(0, 10);
      rows = await sql`
        SELECT dc.*, u.name AS user_name
        FROM daily_checkins dc
        JOIN users u ON u.id = dc.user_id
        WHERE dc.user_id = ${userId} AND dc.checkin_date = ${targetDate}
        ORDER BY dc.created_at DESC LIMIT 1
      `;
    } else {
      const targetDate = date ?? new Date().toISOString().slice(0, 10);
      rows = await sql`
        SELECT dc.*, u.name AS user_name
        FROM daily_checkins dc
        JOIN users u ON u.id = dc.user_id
        WHERE dc.checkin_date = ${targetDate}
        ORDER BY dc.created_at DESC
      `;
    }
    return NextResponse.json({ data: rowsToCamel(rows as Record<string,unknown>[]) });
  } catch (e) {
    console.error("[checkin/GET] error:", e);
    return NextResponse.json({ data: [] });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const today = new Date().toISOString().slice(0, 10);

  const record = {
    userId:              body.userId,
    checkinDate:         today,
    rawResponse:         body.rawResponse ?? null,
    aiSummary:           body.aiSummary ?? null,
    aiExtractedMetrics:  JSON.stringify(body.aiExtractedMetrics ?? []),
    aiConfidenceScore:   body.aiConfidenceScore ?? 0,
    aiFlags:             JSON.stringify(body.aiFlags ?? []),
    mood:                body.mood ?? null,
    moodEmoji:           body.moodEmoji ?? null,
    wins:                body.wins ?? null,
    blockers:            body.blockers ?? null,
    status:              body.status ?? "submitted",
    submittedAt:         new Date().toISOString(),
  };

  try {
    const rows = await sql`
      INSERT INTO daily_checkins
        (user_id, checkin_date, raw_response, ai_summary, ai_extracted_metrics,
         ai_confidence_score, ai_flags, mood, mood_emoji, wins, blockers, status, submitted_at)
      VALUES
        (${record.userId}, ${record.checkinDate}, ${record.rawResponse},
         ${record.aiSummary}, ${record.aiExtractedMetrics}::jsonb,
         ${record.aiConfidenceScore}, ${record.aiFlags}::jsonb,
         ${record.mood}, ${record.moodEmoji}, ${record.wins}, ${record.blockers},
         ${record.status}, NOW())
      ON CONFLICT (user_id, checkin_date) DO UPDATE SET
        raw_response          = EXCLUDED.raw_response,
        ai_summary            = EXCLUDED.ai_summary,
        ai_extracted_metrics  = EXCLUDED.ai_extracted_metrics,
        ai_confidence_score   = EXCLUDED.ai_confidence_score,
        ai_flags              = EXCLUDED.ai_flags,
        mood                  = EXCLUDED.mood,
        mood_emoji            = EXCLUDED.mood_emoji,
        wins                  = EXCLUDED.wins,
        blockers              = EXCLUDED.blockers,
        status                = EXCLUDED.status,
        submitted_at          = NOW()
      RETURNING *
    `;

    // Update user's last_checkin_at
    await sql`UPDATE users SET last_checkin_at = NOW() WHERE id = ${record.userId}`;

    return NextResponse.json({ data: toCamel(rows[0] as Record<string,unknown>) }, { status: 201 });
  } catch (e) {
    console.error("[checkin/POST] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
