import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";

// Mark a single notification read. Scoped to the caller — anyone trying to
// mark someone else's notification fails silently (we treat it as a no-op
// rather than 403 to avoid noisy errors when the dropdown races against
// other tabs).
export async function PATCH(_: NextRequest, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await sql`UPDATE notifications SET is_read = TRUE WHERE id = ${params.id} AND user_id = ${me.id}`;
    return NextResponse.json({ message: "Marked read" });
  } catch (e) {
    console.warn("[notifications/[id]/PATCH] DB update failed:", (e as Error).message);
    return NextResponse.json({ message: "Marked read" });
  }
}

// Delete (dismiss) a single notification — used by the X button on each
// notification card so the user can clean up their inbox.
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await sql`DELETE FROM notifications WHERE id = ${params.id} AND user_id = ${me.id}`;
    return NextResponse.json({ message: "Dismissed" });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
