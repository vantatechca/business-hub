import { sql } from "./db";
import type { NextRequest } from "next/server";
import { getSessionUser } from "./authz";

// Logs a single audit_logs row. Best-effort: any DB failure is swallowed so
// a broken audit log never breaks the user's actual request. The caller
// passes a NextRequest (to grab IP / user agent) when possible.
//
// Actions are free-text dot-namespaced strings:
//   auth.login               — successful login
//   auth.login_failed        — failed login attempt (no session yet)
//   auth.logout              — user signed out
//   auth.password_change     — user changed their own password
//   auth.password_reset      — admin reset another user's password
//   user.create / update / deactivate / role_change
//   checkin.create / update / review
//   profile.update           — self-edit of profile
//   profile.update_other     — super admin edits another's profile
//   audit.delete             — super admin bulk-deleted audit rows
//
// entityType / entityId pin the row to a specific thing (e.g. entityType
// 'user', entityId the user's uuid). metadata is a free-form JSONB blob.
export interface AuditEntry {
  action: string;
  entityType?: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  actorId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  req?: NextRequest;
}

function getIp(req: NextRequest | undefined): string | null {
  if (!req) return null;
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim();
  const xr = req.headers.get("x-real-ip");
  if (xr) return xr;
  return null;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    // Resolve actor from the session if the caller didn't specify it.
    let actorId = entry.actorId ?? null;
    let actorEmail = entry.actorEmail ?? null;
    let actorRole = entry.actorRole ?? null;
    if (!actorId) {
      const user = await getSessionUser().catch(() => null);
      if (user) {
        actorId = user.id;
        actorEmail = user.email;
        actorRole = user.role;
      }
    }
    const ip = getIp(entry.req);
    const ua = entry.req?.headers.get("user-agent") ?? null;
    const meta = entry.metadata ? JSON.stringify(entry.metadata) : null;

    await sql`
      INSERT INTO audit_logs
        (actor_id, actor_email, actor_role, action, entity_type, entity_id, ip, user_agent, metadata)
      VALUES
        (${actorId}, ${actorEmail}, ${actorRole}, ${entry.action},
         ${entry.entityType ?? null}, ${entry.entityId ?? null},
         ${ip}, ${ua}, ${meta}::jsonb)
    `;
  } catch (e) {
    // Never let audit failures propagate — the user's action should succeed
    // even if the audit log table is unreachable or mis-migrated.
    console.error("[audit] logAudit failed:", (e as Error).message);
  }
}
