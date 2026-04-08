import { NextRequest, NextResponse } from "next/server";
import { tasks, nextId } from "@/lib/seed";

export async function GET() {
  return NextResponse.json({ data: tasks });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const item = { ...body, id: nextId() };
  tasks.push(item);
  return NextResponse.json({ data: item }, { status: 201 });
}
