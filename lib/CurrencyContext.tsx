"use client";
import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { RATES as FALLBACK_RATES, type Currency } from "./currency";

interface CurrencyContextValue {
  /** The currently-active global display currency. */
  currency: Currency;
  /** Update the global currency. Persists to localStorage so it survives reloads. */
  setCurrency: (c: Currency) => void;
  /** Live USD-base rates (1 USD = rates[X] of X). Falls back to hardcoded until /api/fx-rates returns. */
  rates: Record<string, number>;
  /** "api" once live rates have been fetched, "fallback" before that or on error. */
  ratesSource: "api" | "fallback";
  /** Convert between currencies using the current rates. Safe to call before fetch — uses fallback then. */
  convert: (amount: number, from: Currency, to: Currency) => number;
}

const defaultConvert = (amount: number, from: Currency, to: Currency): number => {
  if (!Number.isFinite(amount)) return 0;
  if (from === to) return amount;
  const usd = amount / FALLBACK_RATES[from];
  return usd * FALLBACK_RATES[to];
};

const CurrencyContext = createContext<CurrencyContextValue>({
  currency: "USD",
  setCurrency: () => {},
  rates: FALLBACK_RATES,
  ratesSource: "fallback",
  convert: defaultConvert,
});

const STORAGE_KEY = "globalCurrency";

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>("USD");
  const [rates, setRates] = useState<Record<string, number>>(FALLBACK_RATES);
  const [ratesSource, setRatesSource] = useState<"api" | "fallback">("fallback");

  // Hydrate from localStorage on mount so the SSR render starts with USD
  // (no hydration mismatch) and the client upgrades once mounted.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "CAD" || stored === "USD") setCurrencyState(stored);
  }, []);

  // Fetch live FX rates once on mount. Failures are silent — we keep the
  // hardcoded fallback so the UI keeps working offline.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/fx-rates")
      .then(r => r.json())
      .then(d => {
        if (cancelled || !d?.data?.rates) return;
        setRates(d.data.rates);
        setRatesSource(d.data.source === "api" ? "api" : "fallback");
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const setCurrency = useCallback((c: Currency) => {
    setCurrencyState(c);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, c);
    }
  }, []);

  const convert = useCallback((amount: number, from: Currency, to: Currency): number => {
    if (!Number.isFinite(amount)) return 0;
    if (from === to) return amount;
    const fromRate = rates[from] ?? FALLBACK_RATES[from];
    const toRate = rates[to] ?? FALLBACK_RATES[to];
    if (!fromRate || !toRate) return amount;
    const usd = amount / fromRate;
    return usd * toRate;
  }, [rates]);

  const value = useMemo<CurrencyContextValue>(() => ({
    currency, setCurrency, rates, ratesSource, convert,
  }), [currency, setCurrency, rates, ratesSource, convert]);

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency(): CurrencyContextValue {
  return useContext(CurrencyContext);
}
