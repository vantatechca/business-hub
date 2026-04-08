"use client";
import { useEffect, useState } from "react";
import AppLayout from "@/components/Layout";
import { HubInput, HubSelect, FormField, useToast, ToastList, EmptyState } from "@/components/ui/shared";
import type { AuditLogEntry } from "@/lib/types";

// Actions we know about — populated in the filter dropdown. Free-text is
// still allowed in the URL.
const KNOWN_ACTIONS = [
  "auth.login",
  "auth.login_failed",
  "auth.logout",
  "auth.password_change",
  "auth.password_change_failed",
  "auth.password_reset",
  "user.create",
  "user.update",
  "user.deactivate",
  "profile.update",
  "profile.update_other",
  "checkin.create",
  "checkin.update",
  "checkin.review",
  "audit.delete",
];

function actionColor(action: string): string {
  if (action.startsWith("auth.login_failed") || action.includes("failed")) return "var(--danger)";
  if (action.startsWith("auth")) return "var(--accent)";
  if (action.startsWith("checkin.review")) return "var(--success)";
  if (action.startsWith("profile")) return "var(--violet)";
  if (action.startsWith("user.")) return "var(--warning)";
  if (action.startsWith("audit.delete")) return "var(--danger)";
  return "var(--text-secondary)";
}

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState("");
  const [actor, setActor]   = useState("");
  const [from, setFrom]     = useState("");
  const [to, setTo]         = useState("");
  const [showDelete, setShowDelete] = useState(false);
  const [deleteFrom, setDeleteFrom] = useState("");
  const [deleteTo, setDeleteTo]     = useState("");
  const { ts, toast } = useToast();

  const load = () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (action) qs.set("action", action);
    if (actor)  qs.set("actor", actor);
    if (from)   qs.set("from", from);
    if (to)     qs.set("to", to);
    fetch(`/api/audit?${qs.toString()}`)
      .then(r => r.json())
      .then(d => { setEntries(d.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const prune = async () => {
    if (!deleteFrom || !deleteTo) return toast("Both dates are required", "er");
    const qs = new URLSearchParams({ from: deleteFrom, to: deleteTo });
    const res = await fetch(`/api/audit?${qs.toString()}`, { method: "DELETE" });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      return toast(e.error || "Delete failed", "er");
    }
    const d = await res.json();
    toast(`Deleted ${d.deleted} audit rows`);
    setShowDelete(false);
    setDeleteFrom(""); setDeleteTo("");
    load();
  };

  return (
    <AppLayout title="Audit Log" onNew={() => setShowDelete(true)} newLabel="Delete by Date">
      <ToastList ts={ts} />

      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ minWidth: 180 }}>
          <FormField label="Action">
            <HubSelect value={action} onChange={e => setAction(e.target.value)}>
              <option value="">All actions</option>
              {KNOWN_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
            </HubSelect>
          </FormField>
        </div>
        <div style={{ minWidth: 180 }}>
          <FormField label="Actor email contains">
            <HubInput value={actor} onChange={e => setActor(e.target.value)} placeholder="andrei@hub.com" />
          </FormField>
        </div>
        <div>
          <FormField label="From">
            <HubInput type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </FormField>
        </div>
        <div>
          <FormField label="To">
            <HubInput type="date" value={to} onChange={e => setTo(e.target.value)} />
          </FormField>
        </div>
        <button
          onClick={load}
          style={{ padding: "8px 16px", borderRadius: 8, background: "var(--accent)", color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", marginBottom: 13 }}
        >
          Apply
        </button>
        <span style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 18 }}>{entries.length} entries</span>
      </div>

      {loading ? (
        <div className="skeleton" style={{ height: 500, borderRadius: 12 }} />
      ) : entries.length === 0 ? (
        <EmptyState icon="📜" title="No audit entries" desc="Try loosening the filters." />
      ) : (
        <div className="hub-card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="hub-table">
            <thead>
              <tr>{["When", "Actor", "Action", "Entity", "IP", "Metadata"].map(h => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id}>
                  <td style={{ fontSize: 11, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                    {new Date(e.occurredAt).toLocaleString()}
                  </td>
                  <td style={{ fontSize: 11 }}>
                    <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>{e.actorEmail ?? "—"}</div>
                    <div style={{ color: "var(--text-muted)", textTransform: "capitalize" }}>{(e.actorRole ?? "").replace("_", " ")}</div>
                  </td>
                  <td>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 5, background: actionColor(e.action) + "22", color: actionColor(e.action) }}>
                      {e.action}
                    </span>
                  </td>
                  <td style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                    {e.entityType ? `${e.entityType}${e.entityId ? ` · ${String(e.entityId).slice(0, 8)}` : ""}` : "—"}
                  </td>
                  <td style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace" }}>{e.ip ?? "—"}</td>
                  <td style={{ fontSize: 10, color: "var(--text-secondary)", maxWidth: 260 }}>
                    {e.metadata ? (
                      <code style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>
                        {JSON.stringify(e.metadata)}
                      </code>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete by date range modal */}
      {showDelete && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setShowDelete(false); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 600, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
        >
          <div className="hub-card" style={{ width: 440, padding: 22 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "var(--danger)", marginBottom: 6 }}>Delete Audit Logs</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 14, lineHeight: 1.5 }}>
              Permanently deletes all audit entries in the selected date range (inclusive). This cannot be undone.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <FormField label="From"><HubInput type="date" value={deleteFrom} onChange={e => setDeleteFrom(e.target.value)} /></FormField>
              <FormField label="To"><HubInput type="date" value={deleteTo} onChange={e => setDeleteTo(e.target.value)} /></FormField>
            </div>
            <div style={{ display: "flex", gap: 9, justifyContent: "flex-end", marginTop: 6 }}>
              <button onClick={() => setShowDelete(false)} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
              <button onClick={prune} style={{ padding: "7px 14px", borderRadius: 8, background: "var(--danger)", color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
