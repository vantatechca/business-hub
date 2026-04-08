"use client";
import { useEffect, useState } from "react";
import { X, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import type { DailyCheckin } from "@/lib/types";
import { CheckinDetail } from "./CheckinViewer";
import { Avatar } from "./ui/shared";

export default function MemberCheckinDrawer({
  member,
  open,
  onClose,
}: {
  member: { id: string; name: string; initials?: string } | null;
  open: boolean;
  onClose: () => void;
}) {
  const [checkins, setCheckins] = useState<DailyCheckin[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open || !member) return;
    setLoading(true);
    setCheckins([]);
    setExpanded(new Set());
    const today = new Date();
    const past = new Date(today);
    past.setMonth(past.getMonth() - 3);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    fetch(`/api/checkin?userId=${member.id}&from=${fmt(past)}&to=${fmt(today)}`)
      .then(r => r.json())
      .then(d => { setCheckins(d.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [open, member]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !member) return null;

  const toggle = (id: string) => {
    setExpanded(p => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 500, display: "flex", justifyContent: "flex-end" }}
    >
      <div style={{
        width: 560, maxWidth: "100vw", height: "100%", overflowY: "auto",
        background: "var(--bg-card)", borderLeft: "1px solid var(--border-card)",
        boxShadow: "var(--shadow-modal)", animation: "slideRight .2s ease",
      }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--border-divider)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <Avatar s={member.initials ?? "?"} size={40} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text-muted)", letterSpacing: ".1em" }}>CHECK-IN HISTORY</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{member.name}</div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Last 3 months</div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", padding: 4, display: "flex" }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: "16px 22px 22px" }}>
          {loading && (
            <div style={{ padding: 36, textAlign: "center", color: "var(--text-secondary)", fontSize: 12 }}>
              <Loader2 size={18} style={{ animation: "spin 1s linear infinite", display: "inline-block", marginBottom: 8 }} />
              <div>Loading check-ins…</div>
            </div>
          )}
          {!loading && checkins.length === 0 && (
            <div style={{ padding: "32px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
              No check-ins in the last 3 months.
            </div>
          )}
          {!loading && checkins.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {checkins.map(c => {
                const isOpen = expanded.has(c.id);
                return (
                  <div key={c.id} style={{ border: "1px solid var(--border-card)", borderRadius: 10, background: "var(--bg-input)" }}>
                    <button
                      onClick={() => toggle(c.id)}
                      style={{
                        width: "100%", padding: "12px 14px", display: "flex", alignItems: "center", gap: 10,
                        background: "transparent", border: "none", cursor: "pointer", textAlign: "left",
                      }}
                    >
                      {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      {c.moodEmoji && <span style={{ fontSize: 16 }}>{c.moodEmoji}</span>}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                          {new Date(c.checkinDate).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                        </div>
                        {c.aiSummary && (
                          <div style={{ fontSize: 11, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {c.aiSummary}
                          </div>
                        )}
                      </div>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 5, background: "var(--bg-card)", color: "var(--text-muted)", textTransform: "uppercase" }}>
                        {c.status.replace(/_/g, " ")}
                      </span>
                    </button>
                    {isOpen && (
                      <div style={{ padding: "0 14px 14px", borderTop: "1px solid var(--border-card)" }}>
                        <CheckinDetail checkin={c} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <style>{`
        @keyframes slideRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
