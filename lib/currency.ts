// Global currency support.
//
// The base currency for storage is USD. Every revenue / expense entry
// records the currency it was entered in (e.g. a CA$50,000 sale stays
// CAD on the row) and the UI converts between display currencies at
// render time. Conversion rates are hardcoded for simplicity; a real
// deployment would fetch them from an FX API on a cron.

export type Currency = "USD" | "CAD";

export const CURRENCIES: Currency[] = ["USD", "CAD"];

// Rates vs the base (USD = 1). 1 USD = RATES[x] of currency x.
// Update these when you integrate a live rate source.
export const RATES: Record<Currency, number> = {
  USD: 1,
  CAD: 1.37,
};

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  USD: "$",
  CAD: "CA$",
};

export const CURRENCY_LABELS: Record<Currency, string> = {
  USD: "USD",
  CAD: "CAD",
};

/** Convert an amount from one currency to another. */
export function convert(amount: number, from: Currency, to: Currency): number {
  if (!Number.isFinite(amount)) return 0;
  if (from === to) return amount;
  // from → USD, USD → to
  const usd = amount / RATES[from];
  return usd * RATES[to];
}

/**
 * Format a money amount in the given currency with compact K/M suffixes.
 * The input amount is assumed to already be in `currency`. If you need to
 * convert first, pass the result of convert() in.
 */
export function formatMoney(amount: number, currency: Currency = "USD", compact = true): string {
  if (!Number.isFinite(amount)) return `${CURRENCY_SYMBOLS[currency]}0`;
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  const symbol = CURRENCY_SYMBOLS[currency];
  if (compact && abs >= 1e6) return `${sign}${symbol}${(abs / 1e6).toFixed(2)}M`;
  if (compact && abs >= 1e3) return `${sign}${symbol}${(abs / 1e3).toFixed(0)}K`;
  return `${sign}${symbol}${Math.round(abs).toLocaleString()}`;
}

/** Full format with explicit currency code appended (e.g. "$50,000 USD"). */
export function formatMoneyWithCode(amount: number, currency: Currency = "USD"): string {
  return `${formatMoney(amount, currency, false)} ${CURRENCY_LABELS[currency]}`;
}
