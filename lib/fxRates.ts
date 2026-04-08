import type { Currency } from "./currency";
import { RATES as FALLBACK_RATES } from "./currency";

// Server-side FX rate fetcher with a simple in-memory cache.
//
// Hits https://v6.exchangerate-api.com/v6/<API_KEY>/latest/USD at most once
// every TTL_MS and returns the cached result in between. If the API key is
// missing, the fetch fails, or the response shape is unexpected, falls back
// to the hardcoded rates in lib/currency.ts so the UI keeps working.
//
// The free plan of exchangerate-api.com is ~1,500 requests/month, so with a
// 12h TTL we use ~60 requests/month per Render instance — well within budget.
//
// API key is read from process.env.EXCHANGE_RATE_API_KEY. Never hardcoded.

const TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export interface CachedRates {
  /** Rates with USD as base: 1 USD = rates[X] of X. */
  rates: Record<string, number>;
  fetchedAt: number;
  source: "api" | "fallback";
}

let cached: CachedRates | null = null;

export async function getFxRates(): Promise<CachedRates> {
  // Serve cached if fresh
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return cached;
  }

  const apiKey = process.env.EXCHANGE_RATE_API_KEY;
  if (!apiKey) {
    // No key configured — return hardcoded fallback.
    if (cached && cached.source === "fallback") return cached;
    cached = {
      rates: { ...FALLBACK_RATES },
      fetchedAt: Date.now(),
      source: "fallback",
    };
    return cached;
  }

  try {
    const url = `https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`exchangerate-api HTTP ${res.status}`);
    const data = await res.json();
    if (data?.result !== "success" || !data?.conversion_rates) {
      throw new Error(`exchangerate-api error: ${data?.["error-type"] ?? "unknown"}`);
    }
    // Store ONLY the currencies we support plus USD (base). Keeping the map
    // small keeps the /api/fx-rates payload tiny.
    const wanted: Currency[] = ["USD", "CAD"];
    const rates: Record<string, number> = {};
    for (const c of wanted) {
      if (typeof data.conversion_rates[c] === "number") {
        rates[c] = data.conversion_rates[c];
      }
    }
    if (!rates.USD) rates.USD = 1;
    cached = { rates, fetchedAt: Date.now(), source: "api" };
    return cached;
  } catch (e) {
    console.warn("[fxRates] fetch failed, using fallback:", (e as Error).message);
    // Keep the previous cache if it was an API response — a stale live rate
    // beats the hardcoded fallback. Otherwise seed with fallback.
    if (cached && cached.source === "api") return cached;
    cached = {
      rates: { ...FALLBACK_RATES },
      fetchedAt: Date.now(),
      source: "fallback",
    };
    return cached;
  }
}
