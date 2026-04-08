import { NextRequest, NextResponse } from "next/server";
import { revenueEntries, nextId } from "@/lib/seed";

export async function GET() {
  return NextResponse.json({ data: revenueEntries });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const item = { ...body, id: nextId(), year: body.year ?? new Date().getFullYear() };
  revenueEntries.push(item);
  return NextResponse.json({ data: item }, { status: 201 });
}
