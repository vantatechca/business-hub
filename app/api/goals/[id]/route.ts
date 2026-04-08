import { NextRequest, NextResponse } from "next/server";
import { goals } from "@/lib/seed";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const body = await req.json();
  const idx = goals.findIndex(g => g.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });
  goals[idx] = { ...goals[idx], ...body };
  return NextResponse.json({ data: goals[idx] });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const idx = goals.findIndex(g => g.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });
  goals.splice(idx, 1);
  return NextResponse.json({ message: "Deleted" });
}
