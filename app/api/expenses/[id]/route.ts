import { NextRequest, NextResponse } from "next/server";
import { expenseEntries } from "@/lib/seed";

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const idx = expenseEntries.findIndex(e => e.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });
  expenseEntries.splice(idx, 1);
  return NextResponse.json({ message: "Deleted" });
}
