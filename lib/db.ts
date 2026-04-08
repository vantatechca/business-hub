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

/**
 * Convert a Postgres DATE column's returned value into a plain "YYYY-MM-DD"
 * string. The neon serverless driver hands us a Date object for DATE columns
 * and `String(d)` returns the long human form ("Wed Apr 08 2025 …"), so we
 * need to extract Y-M-D manually. Uses UTC getters because the driver
 * converts a DATE '2025-04-08' into a UTC-midnight Date on the wire, and
 * toISOString() on servers in a non-UTC timezone can shift the day by one.
 * Handles strings, Date objects, and null.
 */
export function toDateString(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "string") return v.slice(0, 10);
  if (v instanceof Date) {
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, "0");
    const d = String(v.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  // Fallback: try to construct a Date
  const d = new Date(v as string);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}
