"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { Currency } from "./currency";

interface CurrencyContextValue {
  /** The currently-active global display currency. */
  currency: Currency;
  /** Update the global currency. Persists to localStorage so it survives reloads. */
  setCurrency: (c: Currency) => void;
}

const CurrencyContext = createContext<CurrencyContextValue>({
  currency: "USD",
  setCurrency: () => {},
});

const STORAGE_KEY = "globalCurrency";

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>("USD");

  // Hydrate from localStorage on mount so the SSR render starts with USD
  // (no hydration mismatch) and the client upgrades once mounted.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "CAD" || stored === "USD") setCurrencyState(stored);
  }, []);

  const setCurrency = useCallback((c: Currency) => {
    setCurrencyState(c);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, c);
    }
  }, []);

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency(): CurrencyContextValue {
  return useContext(CurrencyContext);
}
