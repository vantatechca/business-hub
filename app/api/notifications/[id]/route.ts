import { NextRequest, NextResponse } from "next/server";
import { notifications } from "@/lib/seed";

export async function PATCH(_: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const n = notifications.find(n => n.id === id);
  if (!n) return NextResponse.json({ error: "Not found" }, { status: 404 });
  n.read = true;
  return NextResponse.json({ data: n });
}
