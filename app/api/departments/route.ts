import { NextRequest, NextResponse } from "next/server";
import { departments, nextId } from "@/lib/seed";

export async function GET() {
  return NextResponse.json({ data: departments });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const item = { ...body, id: nextId(), memberCount: body.memberCount ?? 1 };
  departments.push(item);
  return NextResponse.json({ data: item }, { status: 201 });
}
