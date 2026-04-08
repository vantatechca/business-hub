import { NextRequest, NextResponse } from "next/server";
import { sql, rowsToCamel } from "@/lib/db";

const memMessages: Record<string,unknown>[] = [];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  try {
    const rows = await sql`
      SELECT lm.*, u.name AS from_name
      FROM login_messages lm
      JOIN users u ON u.id = lm.from_user_id
      WHERE (lm.target_type = 'everyone'
         OR (lm.target_type = 'specific_user' AND lm.target_id = ${userId ?? ""})
         OR lm.target_type = 'leaders')
        AND (lm.expires_at IS NULL OR lm.expires_at > NOW())
      ORDER BY lm.created_at DESC LIMIT 5
    `;
    return NextResponse.json({ data: rowsToCamel(rows as Record<string,unknown>[]) });
  } catch {
    return NextResponse.json({ data: memMessages });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  try {
    const rows = await sql`
      INSERT INTO login_messages (from_user_id, body, target_type, target_id, expires_at)
      VALUES (${body.fromUserId}, ${body.body}, ${body.targetType ?? "everyone"}, ${body.targetId ?? null},
              ${body.expiresAt ?? null})
      RETURNING *
    `;
    return NextResponse.json({ data: rows[0] }, { status: 201 });
  } catch {
    const msg = { ...body, id: Date.now() };
    memMessages.push(msg);
    return NextResponse.json({ data: msg }, { status: 201 });
  }
}
