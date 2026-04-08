import { NextResponse } from "next/server";
import { sql, rowsToCamel } from "@/lib/db";

// fallback to seed data when DB not configured
import { notifications as seedNotifs } from "@/lib/seed";

export async function GET() {
  try {
    const rows = await sql`
      SELECT id, type, title AS message, body, is_read AS read, action_url, created_at
      FROM notifications ORDER BY created_at DESC LIMIT 30
    `;
    return NextResponse.json({ data: rowsToCamel(rows as Record<string,unknown>[]) });
  } catch {
    // DB not configured — use seed data
    return NextResponse.json({ data: seedNotifs.map(n => ({ ...n, message: n.msg ?? n.message, read: n.read })).reverse() });
  }
}

export async function PATCH() {
  try {
    await sql`UPDATE notifications SET is_read = TRUE`;
  } catch {
    // seed fallback
    seedNotifs.forEach(n => { n.read = true; });
  }
  return NextResponse.json({ message: "All marked read" });
}
