"use client";
import { useEffect, useState } from "react";
import { Modal, FormField, HubInput, HubSelect, HubTextarea, useToast, ToastList } from "@/components/ui/shared";

interface UserOption {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSent?: () => void;
}

// Send Alert modal — accessible to lead / manager / admin / super_admin from
// the notification panel header. The recipient picker fetches /api/team and
// adds an "Everyone" option at the top.
export default function SendAlertModal({ open, onClose, onSent }: Props) {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [target, setTarget] = useState<string>("all");
  const [title, setTitle]   = useState("");
  const [body, setBody]     = useState("");
  const [severity, setSeverity] = useState<"info" | "warning" | "critical">("info");
  const [sending, setSending] = useState(false);
  const { ts, toast } = useToast();

  useEffect(() => {
    if (!open) return;
    fetch("/api/team")
      .then(r => r.json())
      .then(d => setUsers((d.data ?? []) as UserOption[]))
      .catch(() => setUsers([]));
    // Reset the form on each open so a previous draft doesn't linger.
    setTitle(""); setBody(""); setSeverity("info"); setTarget("all");
  }, [open]);

  const send = async () => {
    if (!title.trim()) return toast("Title is required", "er");
    setSending(true);
    const res = await fetch("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target, title, body, severity }),
    });
    setSending(false);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      return toast(e.error || "Send failed", "er");
    }
    const d = await res.json();
    toast(`Alert sent to ${d.data?.recipients ?? 0} recipient${d.data?.recipients === 1 ? "" : "s"}`);
    onSent?.();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Send Alert" width={500}>
      <ToastList ts={ts} />
      <FormField label="Send To">
        <HubSelect value={target} onChange={e => setTarget(e.target.value)}>
          <option value="all">📢 Everyone (broadcast)</option>
          {users.map(u => (
            <option key={u.id} value={u.id}>
              {u.name} · {u.email}
            </option>
          ))}
        </HubSelect>
      </FormField>
      <FormField label="Title">
        <HubInput value={title} onChange={e => setTitle(e.target.value)} placeholder="Brief headline (shown in the bell)" />
      </FormField>
      <FormField label="Message (optional)">
        <HubTextarea rows={4} value={body} onChange={e => setBody(e.target.value)} placeholder="Add more detail…" />
      </FormField>
      <FormField label="Severity">
        <HubSelect value={severity} onChange={e => setSeverity(e.target.value as "info" | "warning" | "critical")}>
          <option value="info">Info — blue</option>
          <option value="warning">Warning — yellow</option>
          <option value="critical">Critical — red</option>
        </HubSelect>
      </FormField>
      <div style={{ display: "flex", gap: 9, justifyContent: "flex-end", marginTop: 4 }}>
        <button onClick={onClose} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
        <button
          onClick={send}
          disabled={sending}
          style={{ padding: "7px 14px", borderRadius: 8, background: "var(--accent)", color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: sending ? "not-allowed" : "pointer", opacity: sending ? 0.6 : 1 }}
        >
          {sending ? "Sending…" : "Send Alert"}
        </button>
      </div>
    </Modal>
  );
}
