import type { NextAuthOptions, User as NextAuthUser } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import type { UserRole } from "./types";

declare module "next-auth" {
  interface User { id: string; role: UserRole; }
  interface Session { user: { id: string; name: string; email: string; role: UserRole; } }
}
declare module "next-auth/jwt" {
  interface JWT { id: string; role: UserRole; }
}

async function findUser(email: string) {
  try {
    const { sql, toCamel } = await import("./db");
    const rows = await sql`SELECT id, email, name, password_hash, role, is_active FROM users WHERE email = ${email} LIMIT 1`;
    if (rows.length) return toCamel<{ id: string; email: string; name: string; passwordHash: string; role: UserRole; isActive: boolean }>(rows[0] as Record<string,unknown>);
  } catch {}
  // Demo fallback before DB is set up
  const DEMO: Record<string, { id: string; name: string; role: UserRole; pw: string }> = {
    "admin@hub.com":   { id: "demo-admin",   name: "Andrei",  role: "admin",  pw: "admin123"  },
    "mathieu@hub.com": { id: "demo-leader",  name: "Mathieu", role: "leader", pw: "leader123" },
    "renold@hub.com":  { id: "demo-member",  name: "Renold",  role: "member", pw: "member123" },
  };
  const d = DEMO[email];
  if (!d) return null;
  return { id: d.id, email, name: d.name, passwordHash: bcrypt.hashSync(d.pw, 10), role: d.role, isActive: true };
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
        if (!user || !user.isActive) return null;
        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;
        try { const { sql } = await import("./db"); await sql`UPDATE users SET last_login_at = NOW() WHERE id = ${user.id}`; } catch {}
        return { id: user.id, name: user.name, email: user.email, role: user.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) { token.id = user.id; token.role = user.role; }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id;
      session.user.role = token.role;
      return session;
    },
  },
};
