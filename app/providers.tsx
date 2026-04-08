"use client";
import { ThemeProvider } from "next-themes";
import { SessionProvider } from "next-auth/react";
import { CurrencyProvider } from "@/lib/CurrencyContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <CurrencyProvider>
          {children}
        </CurrencyProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
