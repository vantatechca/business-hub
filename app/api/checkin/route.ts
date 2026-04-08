import { NextRequest, NextResponse } from "next/server";
import { teamMembers, nextId } from "@/lib/seed";

// Simple in-memory check-in log
const checkIns: Array<{ id: number; memberId: number; mood: string; wins: string; blockers: string; date: string }> = [];

export async function GET() {
  return NextResponse.json({ data: checkIns });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const today = new Date().toISOString().slice(0, 10);
  const ci = { ...body, id: nextId(), date: today };
  checkIns.push(ci);
  // Mark member as checked in
  if (body.memberId) {
    const m = teamMembers.find(m => m.id === body.memberId);
    if (m) m.checkedInToday = true;
  }
  return NextResponse.json({ data: ci }, { status: 201 });
}
