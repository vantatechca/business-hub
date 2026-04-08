import type { NextAuthOptions, User as NextAuthUser } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import type { UserRole } from "./types";

declare module "next-auth" {
  interface User {
    id: string;
    role: UserRole;
    mustChangePassword?: boolean;
  }
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      role: UserRole;
      mustChangePassword?: boolean;
    };
  }
}
declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    mustChangePassword?: boolean;
  }
}

async function findUser(email: string) {
  try {
    const { sql, toCamel } = await import("./db");
    const rows = await sql`SELECT id, email, name, password_hash, role, is_active, must_change_password FROM users WHERE email = ${email} LIMIT 1`;
    if (rows.length) return toCamel<{ id: string; email: string; name: string; passwordHash: string; role: UserRole; isActive: boolean; mustChangePassword: boolean }>(rows[0] as Record<string,unknown>);
  } catch {}
  // Demo fallback before DB is set up
  const DEMO: Record<string, { id: string; name: string; role: UserRole; pw: string }> = {
    "admin@hub.com":   { id: "demo-admin",   name: "Andrei",  role: "admin",   pw: "admin123"  },
    "mathieu@hub.com": { id: "demo-manager", name: "Mathieu", role: "manager", pw: "leader123" },
    "renold@hub.com":  { id: "demo-member",  name: "Renold",  role: "member",  pw: "member123" },
  };
  const d = DEMO[email];
  if (!d) return null;
  return { id: d.id, email, name: d.name, passwordHash: bcrypt.hashSync(d.pw, 10), role: d.role, isActive: true, mustChangePassword: false };
}

// Best-effort audit write from within NextAuth. Can't use lib/audit.ts here
// because that calls getSessionUser which would recurse. Inline SQL instead.
async function writeAuthAudit(args: {
  action: string;
  actorId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    const { sql } = await import("./db");
    await sql`
      INSERT INTO audit_logs (actor_id, actor_email, actor_role, action, entity_type, metadata)
      VALUES (${args.actorId ?? null}, ${args.actorEmail ?? null}, ${args.actorRole ?? null},
              ${args.action}, ${"auth"}, ${args.metadata ? JSON.stringify(args.metadata) : null}::jsonb)
    `;
  } catch {}
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET ?? "dev-secret-change-me",
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email:    { label: "Email",    type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials): Promise<NextAuthUser | null> {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await findUser(credentials.email);
        if (!user || !user.isActive) {
          await writeAuthAudit({
            action: "auth.login_failed",
            actorEmail: credentials.email,
            metadata: { reason: user ? "inactive" : "not_found" },
          });
          return null;
        }
        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) {
          await writeAuthAudit({
            action: "auth.login_failed",
            actorId: user.id,
            actorEmail: user.email,
            actorRole: user.role,
            metadata: { reason: "bad_password" },
          });
          return null;
        }
        try { const { sql } = await import("./db"); await sql`UPDATE users SET last_login_at = NOW() WHERE id = ${user.id}`; } catch {}
        await writeAuthAudit({
          action: "auth.login",
          actorId: user.id,
          actorEmail: user.email,
          actorRole: user.role,
        });
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          mustChangePassword: !!user.mustChangePassword,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.mustChangePassword = !!user.mustChangePassword;
      }
      // When the client calls useSession().update() after a successful
      // password change, re-read the DB flag so the redirect clears.
      if (trigger === "update" && token.id) {
        try {
          const { sql } = await import("./db");
          const rows = await sql`SELECT must_change_password, role FROM users WHERE id = ${token.id}`;
          if (rows.length) {
            token.mustChangePassword = !!rows[0].must_change_password;
            token.role = rows[0].role as UserRole;
          }
        } catch {}
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id;
      session.user.role = token.role;
      session.user.mustChangePassword = !!token.mustChangePassword;
      return session;
    },
  },
  events: {
    async signOut({ token }) {
      await writeAuthAudit({
        action: "auth.logout",
        actorId: (token?.id as string) ?? null,
        actorEmail: (token?.email as string) ?? null,
        actorRole: (token?.role as string) ?? null,
      });
    },
  },
};
