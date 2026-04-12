"use client";
import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";

/**
 * Hook that wires AI search into a list page.
 *
 * - Reads ?aiMatch=id1,id2&aiQuery=...&aiExplanation=... from the URL when
 *   the user arrives from the global AI search and auto-applies the filter.
 * - Exposes state/handlers for an in-page AI toggle search bar.
 *
 * Usage:
 *   const ai = useAiSearch("tasks");
 *   // ai.aiMode, ai.setAiMode, ai.q, ai.setQ, ai.runAiSearch(items),
 *   // ai.matchedIds, ai.explanation, ai.loading, ai.clear()
 *
 * Then in the filter step, include items whose id is in ai.matchedIds when
 * ai.matchedIds is non-null.
 */
export function useAiSearch(targetName: string) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [aiMode, setAiMode] = useState(false);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [matchedIds, setMatchedIds] = useState<Set<string> | null>(null);
  const [explanation, setExplanation] = useState("");

  // On mount / URL change, pick up AI match params
  useEffect(() => {
    const aiMatch = searchParams?.get("aiMatch");
    const aiQuery = searchParams?.get("aiQuery");
    const aiExp = searchParams?.get("aiExplanation");
    if (aiMatch) {
      setAiMode(true);
      setMatchedIds(new Set(aiMatch.split(",").filter(Boolean)));
      setQ(aiQuery || "");
      setExplanation(aiExp || "");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams?.toString()]);

  const runAiSearch = useCallback(async (items: Array<{ id: string; text: string }>) => {
    if (!q.trim()) { setMatchedIds(null); setExplanation(""); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/ai-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, items, targetName }),
      });
      const data = await res.json();
      if (res.ok) {
        setMatchedIds(new Set(data.data?.matchingIds ?? []));
        setExplanation(data.data?.explanation ?? "");
      }
    } catch {
      // ignore
    }
    setLoading(false);
  }, [q, targetName]);

  const clear = useCallback(() => {
    setMatchedIds(null);
    setExplanation("");
    setQ("");
    // Also clear URL params
    const url = new URL(window.location.href);
    url.searchParams.delete("aiMatch");
    url.searchParams.delete("aiQuery");
    url.searchParams.delete("aiExplanation");
    router.replace(url.pathname + url.search);
  }, [router]);

  return {
    aiMode,
    setAiMode,
    q,
    setQ,
    loading,
    matchedIds,
    explanation,
    runAiSearch,
    clear,
  };
}
