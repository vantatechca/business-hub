import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireAdminOrLeader } from "@/lib/authz";

// Body: { items: [{ id, status, sortOrder }] } — reorders tasks and (optionally)
// updates each task's status. Used by both within-column reorder and cross-column
// drag on the tasks kanban.
export async function PATCH(req: NextRequest) {
  const forbidden = await requireAdminOrLeader();
  if (forbidden) return forbidden;

  const { items } = await req.json();
  if (!Array.isArray(items)) {
    return NextResponse.json({ error: "items must be an array" }, { status: 400 });
  }

  try {
    for (const it of items) {
      if (!it.id) continue;
      await sql`
        UPDATE tasks SET
          sort_order = ${Number(it.sortOrder) || 0},
          status     = COALESCE(${it.status ?? null}, status),
          updated_at = NOW()
        WHERE id = ${it.id}
      `;
    }
    return NextResponse.json({ message: "Reordered", count: items.length });
  } catch (e: unknown) {
    console.error("[tasks/reorder/PATCH] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
