import { NextRequest, NextResponse } from "next/server";
import { goals, nextId } from "@/lib/seed";

export async function GET() {
  return NextResponse.json({ data: goals });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const item = { ...body, id: nextId() };
  goals.push(item);
  return NextResponse.json({ data: item }, { status: 201 });
}
