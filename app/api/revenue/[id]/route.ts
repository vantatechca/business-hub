import { NextRequest, NextResponse } from "next/server";
import { revenueEntries } from "@/lib/seed";

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const idx = revenueEntries.findIndex(r => r.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });
  revenueEntries.splice(idx, 1);
  return NextResponse.json({ message: "Deleted" });
}
