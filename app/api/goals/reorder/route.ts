import { NextRequest, NextResponse } from "next/server";
import { goals } from "@/lib/seed";
import { requireAdminOrLeader } from "@/lib/authz";

export async function PATCH(req: NextRequest) {
  const forbidden = await requireAdminOrLeader();
  if (forbidden) return forbidden;

  const { ids } = await req.json();
  if (!Array.isArray(ids)) {
    return NextResponse.json({ error: "ids must be an array" }, { status: 400 });
  }
  const pos = new Map<number, number>(ids.map((id: number | string, i: number) => [Number(id), i]));
  goals.sort((a, b) => {
    const ai = pos.has(a.id) ? (pos.get(a.id) as number) : 9999;
    const bi = pos.has(b.id) ? (pos.get(b.id) as number) : 9999;
    return ai - bi;
  });
  return NextResponse.json({ message: "Reordered", count: ids.length });
}
