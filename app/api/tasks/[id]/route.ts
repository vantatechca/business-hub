import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json();
  try {
    if (b.title        !== undefined) await sql`UPDATE tasks SET title = ${b.title}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.priority     !== undefined) await sql`UPDATE tasks SET priority = ${b.priority}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.status       !== undefined) await sql`UPDATE tasks SET status = ${b.status}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.departmentId !== undefined) await sql`UPDATE tasks SET department_id = ${b.departmentId || null}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.assigneeId   !== undefined) await sql`UPDATE tasks SET assignee_id = ${b.assigneeId || null}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.dueDate      !== undefined) await sql`UPDATE tasks SET due_date = ${b.dueDate || null}, updated_at = NOW() WHERE id = ${params.id}`;
    if (b.sortOrder    !== undefined) await sql`UPDATE tasks SET sort_order = ${Number(b.sortOrder) || 0}, updated_at = NOW() WHERE id = ${params.id}`;
    return NextResponse.json({ message: "Updated" });
  } catch (e: unknown) {
    console.error("[tasks/[id]/PATCH] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await sql`DELETE FROM tasks WHERE id = ${params.id}`;
    return NextResponse.json({ message: "Deleted" });
  } catch (e: unknown) {
    console.error("[tasks/[id]/DELETE] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
