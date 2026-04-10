import { NextRequest, NextResponse } from "next/server";
import { sql, rowsToCamel, toCamel, toDateString } from "@/lib/db";
import { getSessionUser, isManagerOrHigher } from "@/lib/authz";
import bcrypt from "bcryptjs";

function shape(r: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...r, investmentAmount: Number(r.investmentAmount) };
  if (out.birthday != null) out.birthday = toDateString(out.birthday);
  return out;
}

export async function GET() {
  const me = await getSessionUser();
  if (!isManagerOrHigher(me?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const rows = await sql`
      SELECT i.*, u.name AS user_name, u.email AS user_email
      FROM investors i
      LEFT JOIN users u ON u.id = i.user_id
      ORDER BY i.created_at DESC
    `;
    return NextResponse.json({
      data: rowsToCamel<Record<string, unknown>>(rows as Record<string, unknown>[]).map(shape),
    });
  } catch (e: unknown) {
    console.error("[investors/GET] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!isManagerOrHigher(me?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const b = await req.json();
  if (!b.name) return NextResponse.json({ error: "name required" }, { status: 400 });

  let userId: string | null = null;
  const tempPassword = "TempPass123!";
  let accountCreated = false;

  try {
    // Optionally create a user account for this investor
    if (b.createAccount && b.email) {
      const hash = await bcrypt.hash(tempPassword, 10);
      const userRows = await sql`
        INSERT INTO users (email, name, password_hash, role, must_change_password)
        VALUES (${b.email}, ${b.name}, ${hash}, 'member', TRUE)
        RETURNING id
      `;
      userId = (userRows[0] as Record<string, unknown>).id as string;
      accountCreated = true;
    }

    // Try with birthday columns first; fall back if they don't exist
    let rows;
    try {
      rows = await sql`
        INSERT INTO investors (name, email, phone, company, investment_amount, currency, notes, user_id, birthday, birthday_notifications)
        VALUES (
          ${b.name},
          ${b.email || null},
          ${b.phone || null},
          ${b.company || null},
          ${Number(b.investmentAmount) || 0},
          ${b.currency || "USD"},
          ${b.notes || null},
          ${userId},
          ${b.birthday || null},
          ${!!b.birthdayNotifications}
        )
        RETURNING id
      `;
    } catch {
      rows = await sql`
        INSERT INTO investors (name, email, phone, company, investment_amount, currency, notes, user_id)
        VALUES (
          ${b.name},
          ${b.email || null},
          ${b.phone || null},
          ${b.company || null},
          ${Number(b.investmentAmount) || 0},
          ${b.currency || "USD"},
          ${b.notes || null},
          ${userId}
        )
        RETURNING id
      `;
    }
    const id = (rows[0] as Record<string, unknown>).id as string;
    const full = await sql`
      SELECT i.*, u.name AS user_name, u.email AS user_email
      FROM investors i
      LEFT JOIN users u ON u.id = i.user_id
      WHERE i.id = ${id}
    `;
    return NextResponse.json(
      {
        data: shape(toCamel(full[0] as Record<string, unknown>)),
        accountCreated,
        tempPassword: accountCreated ? tempPassword : undefined,
      },
      { status: 201 },
    );
  } catch (e: unknown) {
    console.error("[investors/POST] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
