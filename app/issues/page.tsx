"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import AppLayout from "@/components/Layout";
import { useToast, ToastList, EmptyState, ConfirmModal, FormField, HubTextarea, Modal } from "@/components/ui/shared";
import ReportIssueModal from "@/components/ReportIssueModal";
import type { Issue, IssueStatus } from "@/lib/types";

type Tab = "mine" | "assigned" | "archived";

const STATUS_LABEL: Record<IssueStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
};
const STATUS_COLOR: Record<IssueStatus, string> = {
  open: "var(--warning)",
  in_progress: "var(--accent)",
  resolved: "var(--success)",
};
const CATEGORY_LABEL: Record<string, string> = {
  system: "🛠 System",
  work: "💼 Work",
};

export default function IssuesPage() {
  const { data: session } = useSession();
  const myRole = (session?.user as { role?: string })?.role ?? "member";
  const isSuperAdmin = myRole === "super_admin";
  const canSeeAssigned = ["lead", "manager", "leader", "admin", "super_admin"].includes(myRole);

  const [tab, setTab] = useState<Tab>("mine");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [showReport, setShowReport] = useState(false);
  const [resolving, setResolving] = useState<Issue | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [deleting, setDeleting] = useState<Issue | null>(null);
  const { ts, toast } = useToast();

  const load = () => {
    setLoading(true);
    fetch(`/api/issues?tab=${tab}`)
      .then(r => r.json())
      .then(d => { setIssues(d.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tab]);

  const setStatus = async (i: Issue, status: IssueStatus) => {
    if (status === "resolved") {
      setResolving(i);
      setResolutionNotes("");
      return;
    }
    const res = await fetch(`/api/issues/${i.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) return toast("Update failed", "er");
    toast(`Marked ${STATUS_LABEL[status]}`);
    load();
  };

  const confirmResolve = async () => {
    if (!resolving) return;
    const res = await fetch(`/api/issues/${resolving.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "resolved", resolutionNotes: resolutionNotes || null }),
    });
    if (!res.ok) return toast("Update failed", "er");
    toast("Resolved — reporter notified");
    setResolving(null);
    load();
  };

  const remove = async () => {
    if (!deleting) return;
    const res = await fetch(`/api/issues/${deleting.id}`, { method: "DELETE" });
    if (!res.ok) return toast("Delete failed", "er");
    toast("Issue deleted");
    setDeleting(null);
    load();
  };

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: "mine",     label: "My Issues",      show: true },
    { id: "assigned", label: "Assigned to Me", show: canSeeAssigned },
    { id: "archived", label: "Archived",       show: isSuperAdmin },
  ];

  return (
    <AppLayout title="Issues" onNew={() => setShowReport(true)} newLabel="Report Issue">
      <ToastList ts={ts} />

      <div style={{ display: "flex", gap: 6, marginBottom: 14, borderBottom: "1px solid var(--border-divider)" }}>
        {tabs.filter(t => t.show).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "9px 16px",
              background: "transparent",
              border: "none",
              borderBottom: tab === t.id ? "2px solid var(--accent)" : "2px solid transparent",
              color: tab === t.id ? "var(--text-primary)" : "var(--text-secondary)",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="skeleton" style={{ height: 300, borderRadius: 12 }} />
      ) : issues.length === 0 ? (
        <EmptyState
          icon="📝"
          title={tab === "mine" ? "You haven't reported any issues" : tab === "assigned" ? "Nothing assigned to you" : "No archived issues"}
          desc={tab === "mine" ? "Click \"Report Issue\" to flag a problem or work blocker." : undefined}
        />
      ) : (
        <div style={{ display: "grid", gap: 11 }}>
          {issues.map(i => (
            <div key={i.id} className="hub-card" style={{ padding: 16 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 5, background: "var(--bg-input)", border: "1px solid var(--border-card)", color: "var(--text-secondary)", fontWeight: 700 }}>
                      {CATEGORY_LABEL[i.category]}
                    </span>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 5, background: STATUS_COLOR[i.status] + "22", color: STATUS_COLOR[i.status], fontWeight: 700, textTransform: "uppercase" }}>
                      {STATUS_LABEL[i.status]}
                    </span>
                    {i.archived && (
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 5, background: "var(--text-muted)" + "22", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>
                        Archived
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)", marginBottom: 4 }}>{i.title}</div>
                  {i.description && (
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{i.description}</div>
                  )}
                  {i.resolutionNotes && (
                    <div style={{ marginTop: 8, padding: "8px 11px", borderRadius: 8, background: "var(--success-bg)", border: "1px solid var(--success)33", fontSize: 11, color: "var(--text-primary)", lineHeight: 1.5 }}>
                      <div style={{ fontWeight: 700, color: "var(--success)", marginBottom: 3, fontSize: 10, letterSpacing: ".05em" }}>RESOLUTION</div>
                      {i.resolutionNotes}
                    </div>
                  )}
                  <div style={{ marginTop: 8, fontSize: 10, color: "var(--text-muted)", display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <span>Reported by <strong style={{ color: "var(--text-secondary)" }}>{i.reporterName ?? "—"}</strong></span>
                    {i.assigneeName && <span>Assigned to <strong style={{ color: "var(--text-secondary)" }}>{i.assigneeName}</strong></span>}
                    {i.resolverName && <span>Resolved by <strong style={{ color: "var(--text-secondary)" }}>{i.resolverName}</strong></span>}
                    <span>{new Date(i.createdAt).toLocaleString()}</span>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                  {tab === "assigned" && i.status !== "resolved" && (
                    <>
                      {i.status === "open" && (
                        <button onClick={() => setStatus(i, "in_progress")} style={{ padding: "5px 11px", borderRadius: 7, background: "var(--accent-bg)", color: "var(--accent)", border: "1px solid var(--accent)33", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Take it</button>
                      )}
                      <button onClick={() => setStatus(i, "resolved")} style={{ padding: "5px 11px", borderRadius: 7, background: "var(--success-bg)", color: "var(--success)", border: "1px solid var(--success)33", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Resolve</button>
                    </>
                  )}
                  {isSuperAdmin && tab === "archived" && (
                    <button onClick={() => setDeleting(i)} style={{ padding: "5px 11px", borderRadius: 7, background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid var(--danger)33", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Delete</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ReportIssueModal open={showReport} onClose={() => setShowReport(false)} onCreated={load} />

      {/* Resolve modal — collect optional resolution notes before flipping
          status. The notification fired to the reporter includes these notes
          if any were provided. */}
      <Modal open={!!resolving} onClose={() => setResolving(null)} title="Resolve Issue">
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12, lineHeight: 1.5 }}>
          Marking <strong style={{ color: "var(--text-primary)" }}>{resolving?.title}</strong> as resolved. The reporter will be notified.
        </div>
        <FormField label="Resolution Notes (optional)">
          <HubTextarea rows={4} value={resolutionNotes} onChange={e => setResolutionNotes(e.target.value)} placeholder="What was the fix? Any follow-up?" />
        </FormField>
        <div style={{ display: "flex", gap: 9, justifyContent: "flex-end", marginTop: 4 }}>
          <button onClick={() => setResolving(null)} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
          <button onClick={confirmResolve} style={{ padding: "7px 14px", borderRadius: 8, background: "var(--success)", color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Resolve & Notify</button>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        name={deleting?.title ?? ""}
        entity="issue (cannot be undone)"
      />
    </AppLayout>
  );
}
