"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { X, Loader2, CheckCircle2 } from "lucide-react";
import type { DailyCheckin } from "@/lib/types";

interface Props {
  checkin: DailyCheckin | null;
  open: boolean;
  onClose: () => void;
  /** Called after a successful "Mark as Reviewed" action so the caller can refresh state */
  onReviewed?: (checkinId: string) => void;
}

// Renders one checkin's full AI-analyzed content (used both stand-alone in a
// modal, and inside the member history drawer as an expanded card).
export function CheckinDetail({ checkin }: { checkin: DailyCheckin | null }) {
  if (!checkin) return null;
  const extracted = (checkin.aiExtractedMetrics ?? []) as Array<{
    metricName: string; newValue?: number; delta?: number; confidence: number; confirmed?: boolean;
  }>;
  const flags = (checkin.aiFlags ?? []) as Array<{ description: string; severity: "low" | "medium" | "high" }>;

  return (
    <div>
      {/* Mood + date */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        {checkin.moodEmoji && <span style={{ fontSize: 28 }}>{checkin.moodEmoji}</span>}
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
            {checkin.mood ?? "—"}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
            {new Date(checkin.checkinDate).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            {checkin.submittedAt && ` · submitted at ${new Date(checkin.submittedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ padding: "2px 8px", borderRadius: 5, fontSize: 10, fontWeight: 700, background: "var(--accent-bg)", color: "var(--accent)", textTransform: "uppercase" }}>
          {checkin.status.replace(/_/g, " ")}
        </span>
      </div>

      {/* AI Summary */}
      {checkin.aiSummary && (
        <div style={{ padding: "12px 14px", borderRadius: 10, background: "var(--accent-bg)", border: "1px solid var(--accent)30", marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "var(--accent)", letterSpacing: ".07em", marginBottom: 5 }}>AI SUMMARY</div>
          <div style={{ fontSize: 12, color: "var(--text-primary)", lineHeight: 1.5 }}>{checkin.aiSummary}</div>
          {checkin.aiConfidenceScore != null && (
            <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 6 }}>
              Overall confidence: <strong style={{ color: checkin.aiConfidenceScore >= 0.7 ? "var(--success)" : "var(--warning)" }}>
                {Math.round(checkin.aiConfidenceScore * 100)}%
              </strong>
            </div>
          )}
        </div>
      )}

      {/* Extracted metrics */}
      {extracted.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text-muted)", letterSpacing: ".07em", marginBottom: 8 }}>EXTRACTED METRICS ({extracted.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {extracted.map((m, i) => (
              <div key={i} style={{ padding: "9px 12px", borderRadius: 8, background: "var(--bg-input)", border: "1px solid var(--border-card)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{m.metricName}</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {m.delta != null && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: m.delta >= 0 ? "var(--success)" : "var(--danger)" }}>
                        {m.delta >= 0 ? "+" : ""}{m.delta}
                      </span>
                    )}
                    {m.newValue != null && (
                      <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>→ {m.newValue}</span>
                    )}
                    <span style={{ fontSize: 9, fontWeight: 700, color: m.confidence >= 0.7 ? "var(--success)" : "var(--warning)" }}>
                      {Math.round(m.confidence * 100)}%
                    </span>
                    {m.confirmed && <span style={{ fontSize: 11 }}>✓</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Flags / blockers */}
      {flags.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text-muted)", letterSpacing: ".07em", marginBottom: 8 }}>FLAGS / BLOCKERS</div>
          {flags.map((f, i) => (
            <div key={i} style={{
              padding: "9px 12px", borderRadius: 8, marginBottom: 6,
              background: f.severity === "high" ? "var(--danger-bg)" : f.severity === "medium" ? "var(--warning-bg)" : "var(--bg-input)",
              border: `1px solid ${f.severity === "high" ? "var(--danger)44" : f.severity === "medium" ? "var(--warning)44" : "var(--border-card)"}`,
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <span style={{ fontSize: 13 }}>{f.severity === "high" ? "🔴" : f.severity === "medium" ? "🟡" : "🟢"}</span>
              <div>
                <div style={{ fontSize: 12, color: "var(--text-primary)" }}>{f.description}</div>
                <div style={{ fontSize: 9, color: "var(--text-secondary)", marginTop: 2, textTransform: "capitalize" }}>{f.severity} severity</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Wins / blockers free-text */}
      {checkin.wins && (
        <Section title="WINS" body={checkin.wins} />
      )}
      {checkin.blockers && (
        <Section title="BLOCKERS" body={checkin.blockers} />
      )}

      {/* Raw response */}
      {checkin.rawResponse && checkin.rawResponse !== checkin.wins && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ fontSize: 10, fontWeight: 800, color: "var(--text-muted)", letterSpacing: ".07em", cursor: "pointer", padding: "4px 0" }}>
            RAW RESPONSE
          </summary>
          <div style={{ padding: "10px 12px", background: "var(--bg-input)", borderRadius: 8, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5, whiteSpace: "pre-wrap", marginTop: 6 }}>
            {checkin.rawResponse}
          </div>
        </details>
      )}
    </div>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text-muted)", letterSpacing: ".07em", marginBottom: 6 }}>{title}</div>
      <div style={{ padding: "10px 12px", background: "var(--bg-input)", borderRadius: 8, fontSize: 12, color: "var(--text-primary)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
        {body}
      </div>
    </div>
  );
}

// Standalone modal viewer for a single check-in (loads by id)
export default function CheckinViewer({ checkin, open, onClose, onReviewed }: Props) {
  const { data: session } = useSession();
  const userId = (session?.user as { id?: string })?.id;
  const role = (session?.user as { role?: string } | undefined)?.role ?? "member";
  const canReview = role === "admin" || role === "super_admin" || role === "manager" || role === "leader";

  const [hydrated, setHydrated] = useState<DailyCheckin | null>(checkin);
  const [loading, setLoading] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");

  useEffect(() => {
    if (!open) return;
    if (checkin && checkin.aiSummary != null) {
      setHydrated(checkin);
      return;
    }
    if (checkin?.userId && checkin?.checkinDate) {
      setLoading(true);
      fetch(`/api/checkin?userId=${checkin.userId}&date=${checkin.checkinDate.slice(0, 10)}`)
        .then(r => r.json())
        .then(d => { setHydrated(d.data?.[0] ?? checkin); setLoading(false); })
        .catch(() => setLoading(false));
    } else {
      setHydrated(checkin);
    }
  }, [open, checkin]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const markReviewed = async () => {
    if (!hydrated?.id) return;
    setReviewing(true);
    try {
      const res = await fetch(`/api/checkin/${hydrated.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "reviewed" }),
      });
      if (res.ok) {
        setHydrated(p => (p ? { ...p, status: "reviewed" } : p));
        onReviewed?.(hydrated.id);
      }
    } finally {
      setReviewing(false);
    }
  };

  // Can the current user edit/delete this check-in?
  const isOwner = userId && hydrated?.userId === userId;
  const isReviewed = hydrated?.status === "reviewed";
  const submissionTime = hydrated?.submittedAt
    ? new Date(hydrated.submittedAt).getTime()
    : hydrated?.createdAt ? new Date(hydrated.createdAt).getTime() : 0;
  const within24h = submissionTime > 0 && (Date.now() - submissionTime) < 24 * 60 * 60 * 1000;
  const canOwnerEdit = isOwner && !isReviewed && within24h;

  const handleDelete = async () => {
    if (!hydrated?.id) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/checkin/${hydrated.id}`, { method: "DELETE" });
      if (res.ok) {
        // Clear the "checked in today" localStorage flag so the system
        // knows the user hasn't checked in (prevents logout bypass).
        if (isOwner && userId) {
          const todayKey = new Date().toISOString().slice(0, 10);
          localStorage.removeItem(`ci_done_${userId}_${todayKey}`);
        }
        onReviewed?.(hydrated.id);
        onClose();
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!hydrated?.id || !editText.trim()) return;
    try {
      await fetch(`/api/checkin/${hydrated.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawResponse: editText, wins: editText }),
      });
      setHydrated(p => p ? { ...p, rawResponse: editText, wins: editText } : p);
      setEditing(false);
      onReviewed?.(hydrated.id);
    } catch { /* ignore */ }
  };

  if (!open) return null;

  const alreadyReviewed = hydrated?.status === "reviewed";

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 600, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
    >
      <div style={{
        background: "var(--bg-card)", border: "1px solid var(--border-card)",
        borderRadius: 16, width: 560, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto",
        boxShadow: "var(--shadow-modal)",
      }}>
        <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--border-divider)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)" }}>
            Check-in {checkin?.userName ? `· ${checkin.userName}` : ""}
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", display: "flex" }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: "18px 22px" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: 24, color: "var(--text-secondary)", fontSize: 12 }}>
              <Loader2 size={18} style={{ animation: "spin 1s linear infinite", display: "inline-block", marginBottom: 8 }} />
              <div>Loading…</div>
            </div>
          ) : (
            <>
              {/* Inline edit mode */}
              {editing ? (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text-muted)", letterSpacing: ".07em", marginBottom: 8 }}>EDIT CHECK-IN</div>
                  <textarea
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    rows={6}
                    style={{
                      width: "100%", padding: "10px 12px", borderRadius: 8, fontSize: 12,
                      background: "var(--bg-input)", border: "1px solid var(--border-card)",
                      color: "var(--text-primary)", outline: "none", resize: "vertical",
                      fontFamily: "inherit", lineHeight: 1.5,
                    }}
                  />
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
                    <button onClick={() => setEditing(false)} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                    <button onClick={handleSaveEdit} style={{ padding: "7px 14px", borderRadius: 8, background: "var(--accent)", color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Save Changes</button>
                  </div>
                </div>
              ) : (
                <CheckinDetail checkin={hydrated} />
              )}

              {/* Action buttons */}
              {hydrated && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border-divider)", gap: 8 }}>
                  {/* Owner edit/delete (within 24h, not reviewed) */}
                  <div style={{ display: "flex", gap: 6 }}>
                    {canOwnerEdit && !editing && (
                      <>
                        <button
                          onClick={() => { setEditText(hydrated.rawResponse ?? hydrated.wins ?? ""); setEditing(true); }}
                          style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={handleDelete}
                          disabled={deleting}
                          style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid rgba(220,38,38,.3)", background: "var(--danger-bg)", color: "var(--danger)", fontSize: 11, fontWeight: 700, cursor: "pointer", opacity: deleting ? 0.5 : 1 }}
                        >
                          {deleting ? "Deleting…" : "Delete"}
                        </button>
                      </>
                    )}
                    {isOwner && !canOwnerEdit && !canReview && (
                      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                        {isReviewed ? "Reviewed — no longer editable" : "Edit window expired"}
                      </span>
                    )}
                  </div>

                  {/* Reviewer action */}
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {canReview && !isOwner && (
                      <button
                        onClick={() => { if (confirm(`Delete this check-in? This cannot be undone.`)) handleDelete(); }}
                        disabled={deleting}
                        style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid rgba(220,38,38,.3)", background: "var(--danger-bg)", color: "var(--danger)", fontSize: 11, fontWeight: 700, cursor: "pointer", opacity: deleting ? 0.5 : 1 }}
                      >
                        {deleting ? "Deleting…" : "Delete"}
                      </button>
                    )}
                    {canReview && (
                      alreadyReviewed ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--success)", fontWeight: 700 }}>
                          <CheckCircle2 size={14} /> Reviewed
                        </div>
                      ) : (
                        <button
                          onClick={markReviewed}
                          disabled={reviewing}
                          style={{
                            padding: "8px 16px", borderRadius: 8,
                            background: "var(--success)", color: "#fff",
                            border: "none", fontSize: 12, fontWeight: 700,
                            cursor: reviewing ? "not-allowed" : "pointer",
                            display: "inline-flex", alignItems: "center", gap: 6,
                            opacity: reviewing ? 0.6 : 1,
                          }}
                        >
                          <CheckCircle2 size={14} /> {reviewing ? "Marking…" : "Mark as Reviewed"}
                        </button>
                      )
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
