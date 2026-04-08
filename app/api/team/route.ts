import { NextRequest, NextResponse } from "next/server";
import { teamMembers, nextId } from "@/lib/seed";

export async function GET() {
  return NextResponse.json({ data: teamMembers });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const name: string = body.name ?? "";
  const initials = name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2) || "??";
  const item = { ...body, id: nextId(), initials, checkedInToday: false };
  teamMembers.push(item);
  return NextResponse.json({ data: item }, { status: 201 });
}
