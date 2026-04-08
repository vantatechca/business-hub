import { NextRequest, NextResponse } from "next/server";
import { sql, rowsToCamel, toCamel } from "@/lib/db";

// In-memory fallback when DB not set up
const memCheckins: Record<string, unknown>[] = [];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const date   = searchParams.get("date") ?? new Date().toISOString().slice(0, 10);

  try {
    const rows = userId
      ? await sql`
          SELECT dc.*, u.name AS user_name
          FROM daily_checkins dc
          JOIN users u ON u.id = dc.user_id
          WHERE dc.user_id = ${userId} AND dc.checkin_date = ${date}
          ORDER BY dc.created_at DESC LIMIT 1
        `
      : await sql`
          SELECT dc.*, u.name AS user_name
          FROM daily_checkins dc
          JOIN users u ON u.id = dc.user_id
          WHERE dc.checkin_date = ${date}
          ORDER BY dc.created_at DESC
        `;
    return NextResponse.json({ data: rowsToCamel(rows as Record<string,unknown>[]) });
  } catch {
    const filtered = userId
      ? memCheckins.filter(c => c.userId === userId && String(c.checkinDate).slice(0,10) === date)
      : memCheckins.filter(c => String(c.checkinDate).slice(0,10) === date);
    return NextResponse.json({ data: filtered });
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
  } catch {
    // Memory fallback
    const ci = { ...record, id: Date.now() };
    memCheckins.push(ci);
    return NextResponse.json({ data: ci }, { status: 201 });
  }
}
