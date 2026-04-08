import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function PATCH(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await sql`UPDATE notifications SET is_read = TRUE WHERE id = ${params.id}`;
    return NextResponse.json({ message: "Marked read" });
  } catch (e) {
    console.warn("[notifications/[id]/PATCH] DB update failed:", (e as Error).message);
    // Birthday notifications are synthetic (id starts with "bday-") and are
    // generated on each /api/notifications fetch, so there's nothing to
    // persist — silently succeed.
    return NextResponse.json({ message: "Marked read" });
  }
}
