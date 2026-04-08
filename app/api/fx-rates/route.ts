import { NextResponse } from "next/server";
import { getFxRates } from "@/lib/fxRates";

// Tells Next.js not to statically cache this route — we want each request to
// hit the in-process cache in lib/fxRates, which handles its own TTL.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const { rates, fetchedAt, source } = await getFxRates();
  return NextResponse.json({ data: { rates, fetchedAt, source } });
}
