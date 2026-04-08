import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireAdminOrLeader } from "@/lib/authz";

export async function PATCH(req: NextRequest) {
  const forbidden = await requireAdminOrLeader();
  if (forbidden) return forbidden;

  const { ids } = await req.json();
  if (!Array.isArray(ids)) {
    return NextResponse.json({ error: "ids must be an array" }, { status: 400 });
  }
  try {
    for (let i = 0; i < ids.length; i++) {
      await sql`UPDATE goals SET sort_order = ${i}, updated_at = NOW() WHERE id = ${ids[i]}`;
    }
    return NextResponse.json({ message: "Reordered", count: ids.length });
  } catch (e: unknown) {
    console.error("[goals/reorder/PATCH] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
