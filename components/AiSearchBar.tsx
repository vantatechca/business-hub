"use client";
import { Sparkles, Loader2 } from "lucide-react";

/**
 * Reusable AI search bar. Pages pass state from useAiSearch() and an
 * onRun callback that calls ai.runAiSearch(items) with the page's items.
 *
 * Drop it above the list/table with an optional plain-search input as
 * sibling. When aiMode is on, the plain search is replaced with this
 * smarter version.
 */
export default function AiSearchBar({
  aiMode,
  setAiMode,
  q,
  setQ,
  loading,
  onRun,
  clear,
  placeholder = "Ask anything...",
  plainPlaceholder = "Search...",
  matchCount,
  hasMatches,
  explanation,
}: {
  aiMode: boolean;
  setAiMode: (v: boolean) => void;
  q: string;
  setQ: (v: string) => void;
  loading: boolean;
  onRun: () => void;
  clear: () => void;
  placeholder?: string;
  plainPlaceholder?: string;
  matchCount?: number;
  hasMatches?: boolean;
  explanation?: string;
}) {
  return (
    <>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{
          flex: 1, minWidth: 220, display: "flex", alignItems: "center", gap: 8,
          background: aiMode ? "linear-gradient(135deg, rgba(91,142,248,.08), rgba(124,58,237,.08))" : "var(--bg-card)",
          border: `1px solid ${aiMode ? "var(--accent)" : "var(--border-card)"}`,
          borderRadius: 8, padding: "7px 11px",
        }}>
          <span style={{ color: aiMode ? "var(--accent)" : "var(--text-muted)", fontSize: aiMode ? 14 : 13 }}>
            {aiMode ? "✨" : "⌕"}
          </span>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (aiMode && e.key === "Enter") onRun(); }}
            placeholder={aiMode ? placeholder : plainPlaceholder}
            style={{ border: "none", background: "transparent", outline: "none", fontSize: 12, color: "var(--text-primary)", width: "100%" }}
          />
          {aiMode && q && (
            <button
              onClick={onRun}
              disabled={loading}
              style={{ padding: "4px 10px", borderRadius: 6, background: "var(--accent)", color: "#fff", border: "none", fontSize: 10, fontWeight: 700, cursor: "pointer" }}
            >
              {loading ? <Loader2 size={10} style={{ animation: "spin 1s linear infinite" }} /> : "Search"}
            </button>
          )}
        </div>
        <button
          onClick={() => { setAiMode(!aiMode); if (aiMode) clear(); }}
          title="Toggle AI search"
          style={{
            padding: "7px 12px", borderRadius: 8,
            border: `1px solid ${aiMode ? "var(--accent)" : "var(--border-card)"}`,
            background: aiMode ? "var(--accent-bg)" : "var(--bg-card)",
            color: aiMode ? "var(--accent)" : "var(--text-secondary)",
            fontSize: 11, fontWeight: 700, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6,
          }}
        >
          <Sparkles size={12} /> AI {aiMode ? "ON" : "OFF"}
        </button>
      </div>

      {aiMode && explanation && (
        <div style={{
          marginTop: 10, padding: "10px 14px", borderRadius: 10,
          background: "var(--accent-bg)", border: "1px solid var(--accent)44",
          fontSize: 12, color: "var(--text-primary)",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <Sparkles size={14} color="var(--accent)" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <strong style={{ color: "var(--accent)" }}>AI:</strong> {explanation}
            {hasMatches && matchCount != null && (
              <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>· {matchCount} match{matchCount === 1 ? "" : "es"}</span>
            )}
          </div>
          <button
            onClick={clear}
            style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border-card)", background: "var(--bg-card)", color: "var(--text-secondary)", fontSize: 10, fontWeight: 700, cursor: "pointer" }}
          >
            Clear
          </button>
        </div>
      )}
      <style jsx>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
