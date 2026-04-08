import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth";
import { NextResponse } from "next/server";
import type { UserRole } from "./types";

// ── ROLE PREDICATES ────────────────────────────────────────────
// The 5-tier hierarchy is:
//   super_admin > admin > manager > lead > member
// "leader" is a deprecated alias still accepted in the type so mixed-state
// deployments (where the DB migration hasn't run yet) don't crash. Treat it
// as equivalent to "manager" in every predicate below.
export function isSuperAdmin(role: string | undefined | null): boolean {
  return role === "super_admin";
}
export function isAdmin(role: string | undefined | null): boolean {
  return role === "admin" || role === "super_admin";
}
export function isManagerOrHigher(role: string | undefined | null): boolean {
  return role === "manager" || role === "leader" || role === "admin" || role === "super_admin";
}
export function isLeadOrHigher(role: string | undefined | null): boolean {
  return role === "lead" || isManagerOrHigher(role);
}

// Who can review (approve) a daily check-in?
export function canReviewCheckins(role: string | undefined | null): boolean {
  return isManagerOrHigher(role);
}

// Who can VIEW another user's profile drawer?
// super_admin + admin + manager  → yes
// lead + member                   → only their own profile
export function canViewOthersProfile(role: string | undefined | null): boolean {
  return isManagerOrHigher(role);
}

// Who can EDIT another user's profile? Super admin only.
export function canEditOthersProfile(role: string | undefined | null): boolean {
  return isSuperAdmin(role);
}

// Who can create, edit, deactivate users, reset passwords?
export function canManageUsers(role: string | undefined | null): boolean {
  return isAdmin(role);
}

// Who can reorder lists (drag-and-drop on departments/tasks/metrics/goals)?
export function canReorder(role: string | undefined | null): boolean {
  return isManagerOrHigher(role);
}

// Who can view the audit log? Super admin only.
export function canViewAuditLog(role: string | undefined | null): boolean {
  return isSuperAdmin(role);
}

// ── SESSION HELPERS ────────────────────────────────────────────
export async function getSessionUser() {
  const session = await getServerSession(authOptions);
  const u = session?.user as
    | { id?: string; name?: string; email?: string; role?: UserRole }
    | undefined;
  if (!u?.id) return null;
  return { id: u.id, name: u.name ?? "", email: u.email ?? "", role: (u.role ?? "member") as UserRole };
}

/** Returns a 403 NextResponse if the current session isn't admin/manager (old name kept for call-site compat). */
export async function requireAdminOrLeader(): Promise<NextResponse | null> {
  const user = await getSessionUser();
  if (!isManagerOrHigher(user?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function requireSuperAdmin(): Promise<NextResponse | null> {
  const user = await getSessionUser();
  if (!isSuperAdmin(user?.role)) {
    // 404 instead of 403 so the route's existence isn't leaked to non-SA.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return null;
}

// ── SUPER ADMIN STEALTH ────────────────────────────────────────
// The super admin must be completely invisible to anyone who isn't the SA
// themselves. Every query that returns users (or joins on users) has to
// filter out role='super_admin' for non-SA viewers.
//
// Usage:
//   const user = await getSessionUser();
//   const rows = canSeeSuperAdmin(user?.role)
//     ? await sql`SELECT ... FROM users u`
//     : await sql`SELECT ... FROM users u WHERE u.role != 'super_admin'`;
//
// Some endpoints use a WHERE clause already; wherever possible we append the
// role filter there. This helper exists so the rule is centralized.
export function canSeeSuperAdmin(role: string | undefined | null): boolean {
  return isSuperAdmin(role);
}
