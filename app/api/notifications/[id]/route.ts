import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { notifications as seedNotifs } from "@/lib/seed";

export async function PATCH(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await sql`UPDATE notifications SET is_read = TRUE WHERE id = ${params.id}`;
    return NextResponse.json({ message: "Marked read" });
  } catch {
    // seed fallback
    const n = seedNotifs.find(n => String(n.id) === params.id);
    if (n) n.read = true;
    return NextResponse.json({ message: "Marked read" });
  }
}
