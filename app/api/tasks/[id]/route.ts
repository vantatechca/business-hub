import { NextRequest, NextResponse } from "next/server";
import { tasks } from "@/lib/seed";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const body = await req.json();
  const idx = tasks.findIndex(t => t.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });
  tasks[idx] = { ...tasks[idx], ...body };
  return NextResponse.json({ data: tasks[idx] });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const idx = tasks.findIndex(t => t.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });
  tasks.splice(idx, 1);
  return NextResponse.json({ message: "Deleted" });
}
