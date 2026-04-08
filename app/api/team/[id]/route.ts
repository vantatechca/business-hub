import { NextRequest, NextResponse } from "next/server";
import { teamMembers } from "@/lib/seed";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const body = await req.json();
  const idx = teamMembers.findIndex(m => m.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });
  teamMembers[idx] = { ...teamMembers[idx], ...body };
  return NextResponse.json({ data: teamMembers[idx] });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const idx = teamMembers.findIndex(m => m.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });
  teamMembers.splice(idx, 1);
  return NextResponse.json({ message: "Deleted" });
}
