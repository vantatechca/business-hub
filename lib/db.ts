import { neon, NeonQueryFunction } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set. Add it to .env.local");
}

export const sql: NeonQueryFunction<false, false> = neon(process.env.DATABASE_URL);

export function toCamel<T = Record<string, unknown>>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = v;
  }
  return out as T;
}

export function rowsToCamel<T = Record<string, unknown>>(rows: Record<string, unknown>[]): T[] {
  return rows.map(r => toCamel<T>(r));
}
