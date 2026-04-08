import { NextRequest, NextResponse } from "next/server";
import { expenseEntries, nextId } from "@/lib/seed";

export async function GET() {
  return NextResponse.json({ data: expenseEntries });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const item = { ...body, id: nextId(), year: body.year ?? new Date().getFullYear() };
  expenseEntries.push(item);
  return NextResponse.json({ data: item }, { status: 201 });
}
