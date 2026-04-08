import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth";
import { NextResponse } from "next/server";

/** Returns a 403 NextResponse if the current session isn't admin or leader. */
export async function requireAdminOrLeader(): Promise<NextResponse | null> {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "admin" && role !== "leader") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
