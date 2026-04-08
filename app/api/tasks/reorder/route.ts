import { NextRequest, NextResponse } from "next/server";
import { tasks } from "@/lib/seed";
import { requireAdminOrLeader } from "@/lib/authz";

// Body: { items: [{ id, status, sortOrder }] } — reorders the in-memory tasks
// array and (optionally) updates each task's status. Used by both within-column
// reorder and cross-column drag on the tasks kanban.
export async function PATCH(req: NextRequest) {
  const forbidden = await requireAdminOrLeader();
  if (forbidden) return forbidden;

  const { items } = await req.json();
  if (!Array.isArray(items)) {
    return NextResponse.json({ error: "items must be an array" }, { status: 400 });
  }

  const orderIndex = new Map<number, number>();
  for (const it of items) {
    const id = Number(it.id);
    const idx = tasks.findIndex(t => t.id === id);
    if (idx === -1) continue;
    if (it.status) tasks[idx] = { ...tasks[idx], status: it.status };
    orderIndex.set(id, Number(it.sortOrder ?? 0));
  }
  tasks.sort((a, b) => {
    const ai = orderIndex.has(a.id) ? (orderIndex.get(a.id) as number) : 9999;
    const bi = orderIndex.has(b.id) ? (orderIndex.get(b.id) as number) : 9999;
    return ai - bi;
  });

  return NextResponse.json({ message: "Reordered", count: items.length });
}
