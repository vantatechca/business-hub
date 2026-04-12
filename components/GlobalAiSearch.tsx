"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, X, Loader2 } from "lucide-react";

/**
 * Animated AI search button for the main header. Collapsed state shows
 * a sparkle icon; click to expand into a wide input. Submitting a query
 * calls /api/ai-global-search which classifies the target page and
 * returns matching IDs. The component then routes to that page with
 * ?aiMatch=id1,id2&aiQuery=... so the destination page can filter.
 */
export default function GlobalAiSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setError("");
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const submit = async () => {
    if (!q.trim() || loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ai-global-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Search failed");
        setLoading(false);
        return;
      }
      const { target, route, matchingIds, explanation } = data.data || {};
      setLoading(false);

      if (target === "none" || !matchingIds?.length) {
        setError(explanation || "No matches found. Try rephrasing.");
        return;
      }

      // Route to the target page with URL params
      const params = new URLSearchParams();
      params.set("aiMatch", (matchingIds as string[]).join(","));
      params.set("aiQuery", q.trim());
      if (explanation) params.set("aiExplanation", explanation);
      router.push(`${route}?${params.toString()}`);
      setOpen(false);
      setQ("");
    } catch {
      setError("Search failed");
      setLoading(false);
    }
  };

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          title="AI search"
          className="ai-search-pulse"
          style={{
            width: 36, height: 36, borderRadius: 10,
            background: "linear-gradient(135deg, var(--accent), var(--violet))",
            border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 2px 10px -2px rgba(91,142,248,.5)",
            transition: "transform .2s, box-shadow .2s",
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.08)"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = ""; }}
        >
          <Sparkles size={16} color="#fff" className="ai-search-icon" />
        </button>
      ) : (
        <div style={{
          position: "absolute", top: 0, right: 0, zIndex: 50,
          display: "flex", flexDirection: "column", alignItems: "flex-end",
          minWidth: 360, maxWidth: "90vw",
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            width: 360, maxWidth: "90vw",
            padding: "8px 10px",
            background: "var(--bg-card)",
            border: "2px solid var(--accent)",
            borderRadius: 10,
            boxShadow: "0 8px 32px -8px rgba(91,142,248,.35)",
            animation: "aiSearchSlide .2s ease",
          }}>
            <Sparkles size={16} color="var(--accent)" style={{ flexShrink: 0 }} />
            <input
              ref={inputRef}
              value={q}
              onChange={e => { setQ(e.target.value); setError(""); }}
              onKeyDown={e => {
                if (e.key === "Enter") submit();
                if (e.key === "Escape") { setOpen(false); setError(""); }
              }}
              placeholder="Ask anything... e.g. 'find all tasks related to shopify'"
              style={{
                flex: 1, border: "none", background: "transparent",
                outline: "none", fontSize: 12, color: "var(--text-primary)",
              }}
              disabled={loading}
            />
            {loading && <Loader2 size={14} style={{ animation: "spin 1s linear infinite", color: "var(--accent)" }} />}
            {!loading && q && (
              <button
                onClick={submit}
                style={{ padding: "4px 10px", borderRadius: 6, background: "var(--accent)", color: "#fff", border: "none", fontSize: 10, fontWeight: 700, cursor: "pointer" }}
              >
                Search
              </button>
            )}
            <button
              onClick={() => { setOpen(false); setQ(""); setError(""); }}
              style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex", padding: 2 }}
            >
              <X size={14} />
            </button>
          </div>
          {error && (
            <div style={{
              marginTop: 6,
              padding: "8px 12px",
              background: "var(--bg-card)",
              border: "1px solid var(--border-card)",
              borderRadius: 8,
              fontSize: 11,
              color: "var(--danger)",
              maxWidth: 360,
              boxShadow: "var(--shadow-card)",
            }}>
              {error}
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes aiSearchSlide {
          from { opacity: 0; transform: translateY(-4px) scale(.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes aiPulse {
          0%, 100% { box-shadow: 0 2px 10px -2px rgba(91,142,248,.5), 0 0 0 0 rgba(91,142,248,.4); }
          50%      { box-shadow: 0 2px 10px -2px rgba(91,142,248,.5), 0 0 0 6px rgba(91,142,248,0); }
        }
        @keyframes aiSparkle {
          0%, 100% { transform: rotate(0deg) scale(1); }
          25%      { transform: rotate(-5deg) scale(1.1); }
          75%      { transform: rotate(5deg) scale(1.1); }
        }
        .ai-search-pulse {
          animation: aiPulse 2.5s ease-in-out infinite;
        }
        .ai-search-pulse :global(.ai-search-icon) {
          animation: aiSparkle 2.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
