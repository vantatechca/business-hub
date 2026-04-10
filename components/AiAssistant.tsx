"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { X, Send, Loader2, Brain, Sparkles, Bell } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ParsedAction {
  type: "NOTIFY";
  target: string;  // userId, ALL_MANAGERS, ALL_LEADS, ALL_ASSIGNED:metricName
  title: string;
  body: string;
}

/** Parse [ACTION:NOTIFY|target|title|body] from AI text. Returns the text without action lines + the actions. */
function parseActions(text: string): { cleanText: string; actions: ParsedAction[] } {
  const actions: ParsedAction[] = [];

  // Extract all [ACTION:NOTIFY|...|...|...] blocks anywhere in the text.
  // The body (3rd pipe segment) can contain any character including ] so we
  // use a greedy match up to the last ] on a line-like boundary.
  const actionRegex = /\[ACTION:NOTIFY\|([^|]+)\|([^|]+)\|(.+?)\]/g;
  let cleanText = text;
  let m;

  while ((m = actionRegex.exec(text)) !== null) {
    actions.push({ type: "NOTIFY", target: m[1].trim(), title: m[2].trim(), body: m[3].trim() });
    cleanText = cleanText.replace(m[0], "");
  }

  return { cleanText: cleanText.trim(), actions };
}

/** Human-readable label for the notification target. */
function targetLabel(target: string): string {
  if (target === "ALL_MANAGERS") return "All Managers & Admins";
  if (target === "ALL_LEADS") return "All Leads";
  if (target.startsWith("ALL_ASSIGNED:")) return `Everyone assigned to "${target.slice(13)}"`;
  return target.split("-")[0] === target ? target : "this person"; // UUID = specific user
}

/**
 * Floating AI assistant chat bubble. Only renders for manager+ roles.
 * Supports:
 *  - Free-text questions about operations
 *  - "AI Report" quick action that triggers operational analysis
 *  - Conversation history within the session
 */
export default function AiAssistant() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role ?? "member";
  const isManager = role === "admin" || role === "super_admin" || role === "manager" || role === "leader";

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [sentActions, setSentActions] = useState<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: "user", content: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text.trim(),
          history: messages.slice(-10),
        }),
      });
      const data = await res.json();
      if (data.data?.reply) {
        setMessages(prev => [...prev, { role: "assistant", content: data.data.reply }]);
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: data.error || "Something went wrong." }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Failed to connect. Please try again." }]);
    }
    setLoading(false);
  }, [loading, messages]);

  const runReport = async () => {
    if (reportLoading) return;
    setReportLoading(true);
    setMessages(prev => [...prev, { role: "user", content: "Run an AI operations report" }]);

    try {
      const res = await fetch("/api/analyze-operations", { method: "POST" });
      const data = await res.json();
      if (data.data) {
        const d = data.data;
        let reply = `**Operations Report** - ${d.findingsCount} issue${d.findingsCount !== 1 ? "s" : ""} found\n`;
        if (d.aiSummary) {
          reply += `\n${d.aiSummary}\n`;
        }
        if (d.findings?.length) {
          reply += "\n**Details:**\n";
          for (const f of d.findings.slice(0, 8)) {
            const icon = f.severity === "critical" ? "🔴" : f.severity === "warning" ? "🟡" : "🔵";
            reply += `${icon} ${f.message}\n`;
          }
          if (d.findings.length > 8) {
            reply += `\n...and ${d.findings.length - 8} more.`;
          }
        }
        reply += `\n${d.notificationsCreated} notification${d.notificationsCreated !== 1 ? "s" : ""} sent to leadership.`;
        setMessages(prev => [...prev, { role: "assistant", content: reply }]);
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: data.error || "Report failed." }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Failed to run report." }]);
    }
    setReportLoading(false);
  };

  const executeAction = async (action: ParsedAction, actionKey: string) => {
    try {
      const res = await fetch("/api/ai-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      });
      if (res.ok) {
        const data = await res.json();
        setSentActions(prev => new Set(prev).add(actionKey));
        setMessages(prev => [...prev, {
          role: "assistant",
          content: `Sent! ${data.data?.count ?? 1} notification${(data.data?.count ?? 1) !== 1 ? "s" : ""} delivered.`,
        }]);
      } else {
        const err = await res.json();
        setMessages(prev => [...prev, { role: "assistant", content: `Failed to send: ${err.error || "Unknown error"}` }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Failed to send notification." }]);
    }
  };

  if (!isManager) return null;

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{
            position: "fixed", bottom: 24, right: 24, zIndex: 500,
            width: 56, height: 56, borderRadius: "50%",
            background: "linear-gradient(135deg, var(--accent), var(--violet))",
            border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 20px rgba(91,142,248,.4)",
            transition: "transform .2s, box-shadow .2s",
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.08)"; e.currentTarget.style.boxShadow = "0 6px 28px rgba(91,142,248,.5)"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(91,142,248,.4)"; }}
          title="AI Assistant"
        >
          <Sparkles size={24} color="#fff" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 500,
          width: 400, maxWidth: "calc(100vw - 48px)",
          height: 560, maxHeight: "calc(100vh - 100px)",
          borderRadius: 16, overflow: "hidden",
          background: "var(--bg-card)", border: "1px solid var(--border-card)",
          boxShadow: "var(--shadow-modal)",
          display: "flex", flexDirection: "column",
          animation: "scalePop .25s cubic-bezier(.34,1.56,.64,1)",
        }}>
          {/* Header */}
          <div style={{
            padding: "14px 18px",
            borderBottom: "1px solid var(--border-divider)",
            display: "flex", alignItems: "center", gap: 10,
            background: "linear-gradient(135deg, rgba(91,142,248,.08), rgba(124,58,237,.08))",
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10,
              background: "linear-gradient(135deg, var(--accent), var(--violet))",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Brain size={18} color="#fff" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-primary)" }}>AI Assistant</div>
              <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Ask about your operations</div>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", display: "flex", padding: 4 }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1, overflowY: "auto", padding: "14px 16px",
            display: "flex", flexDirection: "column", gap: 10,
          }}>
            {messages.length === 0 && (
              <div style={{ textAlign: "center", padding: "30px 10px" }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🤖</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>
                  How can I help?
                </div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 18, lineHeight: 1.5 }}>
                  Ask me anything about your operations, metrics, team performance, or trends.
                </div>
                {/* Quick actions */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <QuickAction
                    label="Run AI Operations Report"
                    icon="📊"
                    onClick={runReport}
                    loading={reportLoading}
                  />
                  <QuickAction label="What needs attention today?" icon="⚠️" onClick={() => sendMessage("What needs my attention today? Any stagnant metrics, overdue tasks, or concerns?")} />
                  <QuickAction label="Give me a team performance summary" icon="👥" onClick={() => sendMessage("Give me a summary of team performance across all departments. Who's doing well and who needs support?")} />
                  <QuickAction label="What are our top priorities?" icon="🎯" onClick={() => sendMessage("What should be our top priorities right now based on current metrics and tasks?")} />
                </div>
              </div>
            )}

            {messages.map((msg, i) => {
              const isUser = msg.role === "user";
              const { cleanText, actions } = isUser ? { cleanText: msg.content, actions: [] } : parseActions(msg.content);

              return (
                <div key={i} style={{
                  alignSelf: isUser ? "flex-end" : "flex-start",
                  maxWidth: "85%",
                }}>
                  <div style={{
                    padding: "10px 14px", borderRadius: 12,
                    background: isUser ? "var(--accent)" : "var(--bg-input)",
                    color: isUser ? "#fff" : "var(--text-primary)",
                    fontSize: 12, lineHeight: 1.6,
                    borderBottomRightRadius: isUser ? 4 : 12,
                    borderBottomLeftRadius: !isUser ? 4 : 12,
                    whiteSpace: "pre-wrap",
                  }}>
                    {cleanText}
                  </div>
                  {/* Action buttons */}
                  {actions.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 6 }}>
                      {actions.map((action, ai) => {
                        const key = `${i}-${ai}-${action.target}-${action.title}`;
                        const sent = sentActions.has(key);
                        return (
                          <button
                            key={ai}
                            onClick={() => !sent && executeAction(action, key)}
                            disabled={sent}
                            style={{
                              display: "flex", alignItems: "center", gap: 7,
                              padding: "8px 12px", borderRadius: 9,
                              border: sent ? "1px solid var(--success)" : "1px solid var(--accent)",
                              background: sent ? "var(--success-bg)" : "var(--accent-bg)",
                              color: sent ? "var(--success)" : "var(--accent)",
                              fontSize: 11, fontWeight: 700, cursor: sent ? "default" : "pointer",
                              textAlign: "left", width: "100%",
                              transition: "all .15s",
                              opacity: sent ? 0.8 : 1,
                            }}
                          >
                            <Bell size={13} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div>{sent ? "Sent!" : `Send alert: ${action.title}`}</div>
                              <div style={{ fontSize: 10, fontWeight: 500, marginTop: 1, opacity: 0.8 }}>
                                To: {targetLabel(action.target)}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {loading && (
              <div style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 12, background: "var(--bg-input)" }}>
                <Loader2 size={14} style={{ animation: "spin 1s linear infinite", color: "var(--accent)" }} />
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Thinking...</span>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: "12px 14px",
            borderTop: "1px solid var(--border-divider)",
            display: "flex", gap: 8,
          }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
              placeholder="Ask about your operations..."
              style={{
                flex: 1, padding: "9px 12px", borderRadius: 10,
                border: "1px solid var(--border-card)", background: "var(--bg-input)",
                color: "var(--text-primary)", fontSize: 12, outline: "none",
              }}
              disabled={loading}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={loading || !input.trim()}
              style={{
                width: 38, height: 38, borderRadius: 10,
                background: input.trim() ? "var(--accent)" : "var(--bg-input)",
                border: "none", cursor: input.trim() ? "pointer" : "default",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "background .15s",
              }}
            >
              <Send size={16} color={input.trim() ? "#fff" : "var(--text-muted)"} />
            </button>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

function QuickAction({ label, icon, onClick, loading }: { label: string; icon: string; onClick: () => void; loading?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "9px 14px", borderRadius: 10,
        border: "1px solid var(--border-card)", background: "var(--bg-card)",
        color: "var(--text-primary)", fontSize: 12, fontWeight: 600,
        cursor: "pointer", textAlign: "left", width: "100%",
        transition: "border-color .15s, background .15s",
        opacity: loading ? 0.6 : 1,
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "var(--accent-bg)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border-card)"; e.currentTarget.style.background = "var(--bg-card)"; }}
    >
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span>{loading ? "Running..." : label}</span>
    </button>
  );
}
