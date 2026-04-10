"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import AppLayout from "@/components/Layout";
import { Avatar, Modal, FormField, HubInput, HubSelect, HubTextarea, ConfirmModal, useToast, ToastList, EmptyState } from "@/components/ui/shared";
import { getInitials } from "@/lib/types";

interface Investor {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  investmentAmount: number;
  currency: string;
  notes: string | null;
  avatarUrl: string | null;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const CURRENCIES = ["USD", "CAD", "EUR", "GBP"];
const blank = {
  name: "",
  email: "",
  phone: "",
  company: "",
  investmentAmount: 0,
  currency: "USD",
  notes: "",
  birthday: "",
  birthdayNotifications: false,
  createAccount: false,
};

function fmtMoney(v: number, currency: string): string {
  if (v >= 1e6) return `${currency} ${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${currency} ${(v / 1e3).toFixed(1)}K`;
  return `${currency} ${v.toLocaleString()}`;
}

export default function InvestorsPage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role ?? "member";
  const isMgr = role === "manager" || role === "leader" || role === "admin" || role === "super_admin";

  const [investors, setInvestors] = useState<Investor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Investor | null>(null);
  const [deleting, setDeleting] = useState<Investor | null>(null);
  const [form, setForm] = useState<typeof blank>({ ...blank });
  const [hov, setHov] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [credentials, setCredentials] = useState<{ email: string; password: string; name: string } | null>(null);
  const { ts, toast } = useToast();

  const load = () =>
    fetch("/api/investors")
      .then(r => r.json())
      .then(d => {
        setInvestors(d.data ?? []);
        setLoading(false);
      });
  useEffect(() => { load(); }, []);

  const totalInvestment = investors.reduce((a, i) => a + i.investmentAmount, 0);
  const activeCount = investors.filter(i => i.isActive).length;

  const rows = investors.filter(i =>
    i.name.toLowerCase().includes(q.toLowerCase()) ||
    (i.company ?? "").toLowerCase().includes(q.toLowerCase()) ||
    (i.email ?? "").toLowerCase().includes(q.toLowerCase()),
  );

  const openAdd = () => {
    setForm({ ...blank });
    setShowAdd(true);
  };

  const openEdit = (inv: Investor) => {
    setEditing(inv);
    setForm({
      name: inv.name,
      email: inv.email ?? "",
      phone: inv.phone ?? "",
      company: inv.company ?? "",
      investmentAmount: inv.investmentAmount,
      currency: inv.currency,
      notes: inv.notes ?? "",
      birthday: (inv as unknown as { birthday?: string }).birthday ?? "",
      birthdayNotifications: !!(inv as unknown as { birthdayNotifications?: boolean }).birthdayNotifications,
      createAccount: false,
    });
  };

  const save = async () => {
    if (!form.name) return toast("Name is required", "er");
    if (form.createAccount && !form.email) return toast("Email is required to create an account", "er");
    const res = await fetch("/api/investors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const e = await res.json();
      return toast(e.error || "Failed", "er");
    }
    const d = await res.json();
    await load();
    setShowAdd(false);
    toast("Investor added");
    if (d.accountCreated) {
      setCredentials({ name: form.name, email: form.email, password: d.tempPassword });
    }
  };

  const update = async () => {
    if (!editing) return;
    if (!form.name) return toast("Name is required", "er");
    const res = await fetch(`/api/investors/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        email: form.email,
        phone: form.phone,
        company: form.company,
        investmentAmount: form.investmentAmount,
        currency: form.currency,
        notes: form.notes,
      }),
    });
    if (!res.ok) return toast("Update failed", "er");
    await load();
    setEditing(null);
    toast("Investor updated");
  };

  const toggleActive = async (inv: Investor) => {
    await fetch(`/api/investors/${inv.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !inv.isActive }),
    });
    await load();
    toast(inv.isActive ? "Investor deactivated" : "Investor activated");
  };

  const del = async () => {
    if (!deleting) return;
    await fetch(`/api/investors/${deleting.id}`, { method: "DELETE" });
    await load();
    toast("Investor deleted", "er");
  };

  const investorForm = (
    <>
      <FormField label="Name">
        <HubInput value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Full name" />
      </FormField>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <FormField label="Email">
          <HubInput type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="email@example.com" />
        </FormField>
        <FormField label="Phone">
          <HubInput value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="+1 555-0100" />
        </FormField>
      </div>
      <FormField label="Company">
        <HubInput value={form.company} onChange={e => setForm(p => ({ ...p, company: e.target.value }))} placeholder="Company or fund name" />
      </FormField>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
        <FormField label="Investment Amount">
          <HubInput type="number" value={form.investmentAmount || ""} onChange={e => setForm(p => ({ ...p, investmentAmount: +e.target.value }))} placeholder="100000" />
        </FormField>
        <FormField label="Currency">
          <HubSelect value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value }))}>
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </HubSelect>
        </FormField>
      </div>
      <FormField label="Notes">
        <HubTextarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Additional notes..." rows={3} />
      </FormField>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <FormField label="Birthday (optional)">
          <HubInput
            type="date"
            value={form.birthday}
            onChange={e => setForm(p => ({ ...p, birthday: e.target.value }))}
          />
        </FormField>
        <FormField label="Birthday Notifications">
          <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: "var(--bg-input)", border: "1px solid var(--border-card)", borderRadius: 8, cursor: "pointer", fontSize: 12, color: "var(--text-primary)" }}>
            <input
              type="checkbox"
              checked={form.birthdayNotifications}
              onChange={e => setForm(p => ({ ...p, birthdayNotifications: e.target.checked }))}
              style={{ accentColor: "var(--accent)" }}
            />
            Notify team on their birthday
          </label>
        </FormField>
      </div>
    </>
  );

  return (
    <AppLayout title="Investors" onNew={isMgr ? openAdd : undefined} newLabel="Add Investor">
      <ToastList ts={ts} />

      {/* Search */}
      <div style={{ marginBottom: 14 }}>
        <HubInput value={q} onChange={e => setQ(e.target.value)} placeholder="Search investors..." style={{ maxWidth: 320 }} />
      </div>

      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, marginBottom: 14 }}>
        {[
          { l: "Total Investors", v: String(investors.length), c: "#5b8ef8", sub: "All time" },
          { l: "Total Investment", v: fmtMoney(totalInvestment, "USD"), c: "#34d399", sub: "Combined amount" },
          { l: "Active Investors", v: String(activeCount), c: "#a78bfa", sub: `${investors.length ? Math.round((activeCount / investors.length) * 100) : 0}% active` },
        ].map((s, i) => (
          <div key={i} className="hub-card" style={{ position: "relative", overflow: "hidden", padding: 20, borderTop: `3px solid ${s.c}` }}>
            <div aria-hidden style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 100% 0%, ${s.c}14, transparent 60%)`, pointerEvents: "none" }} />
            <div style={{ position: "relative" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: ".06em" }}>{s.l}</div>
              <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em", color: s.c, lineHeight: 1 }}>{s.v}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>{s.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="skeleton" style={{ height: 200, borderRadius: 12 }} />
      ) : rows.length === 0 ? (
        <EmptyState icon="💼" title="No investors yet" desc="Start tracking investors by adding one." action={isMgr ? <button onClick={openAdd} style={{ padding: "8px 18px", borderRadius: 8, background: "var(--accent)", color: "#fff", border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Add Investor</button> : undefined} />
      ) : (
        <div className="hub-card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="hub-table">
            <thead>
              <tr>
                {["Name", "Company", "Investment", "Email", "Phone", "Status", ""].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(inv => (
                <tr key={inv.id} onMouseEnter={() => setHov(inv.id)} onMouseLeave={() => setHov(null)} style={{ background: hov === inv.id ? "var(--bg-card-hover)" : "transparent" }}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Avatar s={getInitials(inv.name)} size={30} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{inv.name}</div>
                        {inv.userId && (
                          <div style={{ fontSize: 10, color: "var(--accent)", fontWeight: 600 }}>Has account</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>{inv.company || "---"}</td>
                  <td>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--success)" }}>
                      {fmtMoney(inv.investmentAmount, inv.currency)}
                    </div>
                  </td>
                  <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>{inv.email || "---"}</td>
                  <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>{inv.phone || "---"}</td>
                  <td>
                    <span
                      onClick={() => isMgr && toggleActive(inv)}
                      style={{
                        padding: "2px 8px",
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: isMgr ? "pointer" : "default",
                        background: inv.isActive ? "rgba(52,211,153,.15)" : "rgba(248,113,113,.12)",
                        color: inv.isActive ? "var(--success)" : "var(--danger)",
                      }}
                    >
                      {inv.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    {isMgr && (
                      <div style={{ display: "flex", gap: 5 }}>
                        <button onClick={() => openEdit(inv)} style={{ padding: "4px 9px", borderRadius: 7, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-secondary)", fontSize: 11, cursor: "pointer" }}>Edit</button>
                        <button onClick={() => setDeleting(inv)} style={{ padding: "4px 7px", borderRadius: 7, border: "1px solid rgba(220,38,38,.3)", background: "var(--danger-bg)", color: "var(--danger)", fontSize: 11, cursor: "pointer" }}>✕</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Investor" width={520}>
        {investorForm}
        <div style={{ marginTop: 4, marginBottom: 13 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={form.createAccount}
              onChange={e => setForm(p => ({ ...p, createAccount: e.target.checked }))}
              style={{ accentColor: "var(--accent)" }}
            />
            <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>Create login account for this investor</span>
          </label>
          {form.createAccount && (
            <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: "var(--accent-bg)", fontSize: 11, color: "var(--accent)", lineHeight: 1.5 }}>
              A user account with role &quot;member&quot; will be created using the investor&apos;s email. A temporary password will be shown after creation.
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 9, justifyContent: "flex-end", marginTop: 4 }}>
          <button onClick={() => setShowAdd(false)} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
          <button onClick={save} style={{ padding: "7px 14px", borderRadius: 8, background: "var(--accent)", color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Add Investor</button>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Edit Investor · ${editing?.name ?? ""}`} width={520}>
        {investorForm}
        <div style={{ display: "flex", gap: 9, justifyContent: "flex-end", marginTop: 4 }}>
          <button onClick={() => setEditing(null)} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
          <button onClick={update} style={{ padding: "7px 14px", borderRadius: 8, background: "var(--accent)", color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Save Changes</button>
        </div>
      </Modal>

      {/* Delete Modal */}
      <ConfirmModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={del}
        name={deleting?.name ?? ""}
        entity="investor"
      />

      {/* Credentials Modal — shown after creating an investor with a user account */}
      <Modal open={!!credentials} onClose={() => setCredentials(null)} title="Account Created" width={420}>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.6 }}>
          A login account has been created for <strong style={{ color: "var(--text-primary)" }}>{credentials?.name}</strong>. Share these credentials securely:
        </div>
        <div style={{ background: "var(--bg-input)", borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".06em" }}>Email</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{credentials?.email}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".06em" }}>Temp Password</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--warning)", fontFamily: "monospace" }}>{credentials?.password}</span>
          </div>
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.5 }}>
          The user will be prompted to change their password on first login.
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={() => setCredentials(null)} style={{ padding: "7px 14px", borderRadius: 8, background: "var(--accent)", color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Done</button>
        </div>
      </Modal>
    </AppLayout>
  );
}
