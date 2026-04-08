"use client";
import { useEffect, useState } from "react";
import { Modal, FormField, HubInput, HubSelect, HubTextarea, useToast, ToastList } from "@/components/ui/shared";
import type { IssueCategory } from "@/lib/types";

interface UserOption { id: string; name: string; email: string; role: string }

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

// Report Issue modal — accessible to everyone from the notification panel
// header. Two categories:
//   System  → routed to admins / super_admin (technical / bug)
//   Work    → routed to lead / manager / admin (work-related blocker)
//
// Optional explicit assignment: pick someone in the eligible role pool.
export default function ReportIssueModal({ open, onClose, onCreated }: Props) {
  const [category, setCategory] = useState<IssueCategory>("work");
  const [title, setTitle]       = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId]   = useState("");
  const [users, setUsers] = useState<UserOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const { ts, toast } = useToast();

  useEffect(() => {
    if (!open) return;
    fetch("/api/team")
      .then(r => r.json())
      .then(d => setUsers((d.data ?? []) as UserOption[]))
      .catch(() => setUsers([]));
    setCategory("work");
    setTitle("");
    setDescription("");
    setAssigneeId("");
  }, [open]);

  // Filter the assignee dropdown to roles that can actually act on this
  // category. system → admin only. work → lead+ (lead, manager, admin).
  const eligibleAssignees = users.filter(u => {
    if (category === "system") return u.role === "admin" || u.role === "super_admin";
    return u.role === "lead" || u.role === "manager" || u.role === "admin" || u.role === "super_admin" || u.role === "leader";
  });

  const submit = async () => {
    if (!title.trim()) return toast("Title is required", "er");
    setSubmitting(true);
    const res = await fetch("/api/issues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category,
        title,
        description,
        assigneeId: assigneeId || null,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      return toast(e.error || "Failed to report issue", "er");
    }
    toast("Issue reported");
    onCreated?.();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Report an Issue" width={500}>
      <ToastList ts={ts} />
      <FormField label="Category">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
          {(["system", "work"] as const).map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: category === c ? "2px solid var(--accent)" : "1px solid var(--border-card)",
                background: category === c ? "var(--accent-bg)" : "var(--bg-input)",
                color: category === c ? "var(--accent)" : "var(--text-secondary)",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div style={{ fontSize: 13, marginBottom: 2 }}>
                {c === "system" ? "🛠 System" : "💼 Work"}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 500 }}>
                {c === "system" ? "Bug, account, login, etc." : "Blocker, escalation, request"}
              </div>
            </button>
          ))}
        </div>
      </FormField>
      <FormField label="Title">
        <HubInput value={title} onChange={e => setTitle(e.target.value)} placeholder="One-line summary" />
      </FormField>
      <FormField label="Description (optional)">
        <HubTextarea rows={5} value={description} onChange={e => setDescription(e.target.value)} placeholder="Add more details, steps to reproduce, etc." />
      </FormField>
      <FormField label="Assign To (optional)">
        <HubSelect value={assigneeId} onChange={e => setAssigneeId(e.target.value)}>
          <option value="">— Anyone in the eligible role —</option>
          {eligibleAssignees.map(u => (
            <option key={u.id} value={u.id}>
              {u.name} · {u.role}
            </option>
          ))}
        </HubSelect>
      </FormField>
      <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 12 }}>
        {category === "system"
          ? "System issues are routed to admins and the super admin."
          : "Work issues are routed to leads, managers, and admins."}
      </div>
      <div style={{ display: "flex", gap: 9, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
        <button
          onClick={submit}
          disabled={submitting}
          style={{ padding: "7px 14px", borderRadius: 8, background: "var(--accent)", color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.6 : 1 }}
        >
          {submitting ? "Submitting…" : "Report"}
        </button>
      </div>
    </Modal>
  );
}
