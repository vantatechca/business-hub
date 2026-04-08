import { NextRequest, NextResponse } from "next/server";
import { departments } from "@/lib/seed";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const body = await req.json();
  const idx = departments.findIndex(d => d.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });
  departments[idx] = { ...departments[idx], ...body };
  return NextResponse.json({ data: departments[idx] });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const idx = departments.findIndex(d => d.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });
  departments.splice(idx, 1);
  return NextResponse.json({ message: "Deleted" });
}
