import { NextResponse } from "next/server";
import { notifications } from "@/lib/seed";

export async function GET() {
  return NextResponse.json({ data: [...notifications].reverse() });
}

export async function PATCH() {
  notifications.forEach(n => { n.read = true; });
  return NextResponse.json({ message: "All marked read" });
}
