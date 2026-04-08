import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { sql } from "@/lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

// POST /api/users/[id]/reset-password
// Admin-only. Generates a new random temporary password, hashes it, stores
// the hash, and returns the plaintext ONCE in the response. The plaintext is
// never persisted and never retrievable again. No endpoint anywhere exposes
// the stored hash — this is the only way an admin can help a user regain
// access.
export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "admin") {
    return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
  }

  // New 10-char base36 password
  const tempPassword = Array.from({ length: 10 }, () => Math.random().toString(36).slice(2, 3)).join("");
  const hash = await bcrypt.hash(tempPassword, 10);

  try {
    const rows = await sql`
      UPDATE users SET password_hash = ${hash}, updated_at = NOW()
      WHERE id = ${params.id}
      RETURNING id, email, name
    `;
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({
      data: rows[0],
      tempPassword,
      message: "Password reset. Share this password with the user — it cannot be retrieved again.",
    });
  } catch (e: unknown) {
    console.error("[users/[id]/reset-password] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
