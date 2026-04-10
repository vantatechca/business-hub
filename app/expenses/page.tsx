"use client";
import { useState, useEffect, useRef } from "react";
import AppLayout from "@/components/Layout";
import { Modal, FormField, HubInput, HubSelect, useToast, ToastList, EmptyState } from "@/components/ui/shared";
import type { ExpenseEntry, Department } from "@/lib/types";
import { formatMoney, CURRENCIES, type Currency } from "@/lib/currency";
import { useCurrency } from "@/lib/CurrencyContext";
import { Camera, Loader2 } from "lucide-react";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const blank = {
  amount: 0,
  currency: "USD" as Currency,
  departmentId: "" as string | number,
  departmentName: "",
  description: "",
  entryDate: new Date().toISOString().slice(0, 10),
  month: MONTHS[new Date().getMonth()],
  year: new Date().getFullYear(),
};

export default function ExpensesPage() {
  const { currency: globalCurrency, convert } = useCurrency();
  // Page-level override. null = follow global.
  const [pageCurrency, setPageCurrency] = useState<Currency | null>(null);
  const displayCurrency: Currency = pageCurrency ?? globalCurrency;

  const [entries, setEntries] = useState<ExpenseEntry[]>([]);
  const [depts, setDepts]     = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<ExpenseEntry | null>(null);
  const [form, setForm]       = useState<typeof blank>({ ...blank });
  const [hov, setHov]         = useState<string | null>(null);
  // Filter & sort state
  const [fMonth, setFMonth] = useState<string>("");
  const [fYear, setFYear]   = useState<string>("");
  const [fDept, setFDept]   = useState<string>("");
  const [fMinAmt, setFMinAmt] = useState<string>("");
  const [fMaxAmt, setFMaxAmt] = useState<string>("");
  const [fQ, setFQ]         = useState<string>("");
  const [sortBy, setSortBy] = useState<"date" | "month" | "department" | "amount_desc" | "amount_asc">("date");
  const [collapsedMonths, setCollapsedMonths] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem("expenses_collapsed") ?? "{}"); } catch { return {}; }
  });
  const toggleMonth = (key: string) => setCollapsedMonths(p => {
    const next = { ...p, [key]: !p[key] };
    try { localStorage.setItem("expenses_collapsed", JSON.stringify(next)); } catch {}
    return next;
  });
  // Receipt scanner state
  const [showScanner, setShowScanner] = useState(false);
  const [scanning, setScanning]       = useState(false);
  const [scanPreview, setScanPreview] = useState<string | null>(null);
  const [scanResult, setScanResult]   = useState<Record<string, unknown> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { ts, toast }         = useToast();

  const load = () => Promise.all([
    fetch("/api/expenses").then(r => r.json()),
    fetch("/api/departments").then(r => r.json()),
  ]).then(([e, d]) => { setEntries(e.data ?? []); setDepts(d.data ?? []); setLoading(false); });
  useEffect(() => { load(); }, []);

  const amountIn = (e: ExpenseEntry) => convert(e.amount, (e.currency as Currency) || "USD", displayCurrency);

  const total = entries.reduce((a, e) => a + amountIn(e), 0);
  const thisM = entries.filter(e => e.month === MONTHS[new Date().getMonth()]).reduce((a, e) => a + amountIn(e), 0);

  // Years present in the data, for the year filter dropdown
  const years = Array.from(new Set(entries.map(e => String(e.year)))).sort((a, b) => Number(b) - Number(a));

  // Apply filters
  const filteredEntries = entries.filter(e => {
    if (fMonth && e.month !== fMonth) return false;
    if (fYear && String(e.year) !== fYear) return false;
    if (fDept) {
      if (fDept === "__none__") {
        if (e.departmentId) return false;
      } else if (String(e.departmentId ?? "") !== fDept) return false;
    }
    const amt = amountIn(e);
    if (fMinAmt && amt < Number(fMinAmt)) return false;
    if (fMaxAmt && amt > Number(fMaxAmt)) return false;
    if (fQ) {
      const q = fQ.toLowerCase();
      if (!e.description.toLowerCase().includes(q) && !(e.departmentName ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Apply sort
  const sortedEntries = [...filteredEntries].sort((a, b) => {
    switch (sortBy) {
      case "amount_desc": return amountIn(b) - amountIn(a);
      case "amount_asc":  return amountIn(a) - amountIn(b);
      case "department":  return (a.departmentName ?? "").localeCompare(b.departmentName ?? "");
      case "month": {
        const ay = Number(a.year) || 0, by = Number(b.year) || 0;
        if (ay !== by) return by - ay;
        return MONTHS.indexOf(b.month ?? "") - MONTHS.indexOf(a.month ?? "");
      }
      case "date":
      default: {
        const ad = (a as unknown as { entryDate?: string }).entryDate ?? `${a.year}-${String(MONTHS.indexOf(a.month ?? "") + 1).padStart(2, "0")}-01`;
        const bd = (b as unknown as { entryDate?: string }).entryDate ?? `${b.year}-${String(MONTHS.indexOf(b.month ?? "") + 1).padStart(2, "0")}-01`;
        return bd.localeCompare(ad);
      }
    }
  });

  const filteredTotal = sortedEntries.reduce((a, e) => a + amountIn(e), 0);

  const selectDept = (id: string | number) => {
    const d = depts.find(x => String(x.id) === String(id));
    setForm(p => ({ ...p, departmentId: id as number | string, departmentName: d?.name ?? "" }));
  };

  const save = async () => {
    if (!form.amount || !form.description) return toast("Amount and description required", "er");
    await fetch("/api/expenses", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(form) });
    await load(); setShowAdd(false); toast("Expense entry added");
  };

  const update = async () => {
    if (!editing) return;
    if (!form.amount || !form.description) return toast("Amount and description required", "er");
    const res = await fetch(`/api/expenses/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) return toast("Update failed", "er");
    await load(); setEditing(null); toast("Expense updated");
  };

  const del = async (id: string | number) => {
    await fetch(`/api/expenses/${id}`, { method:"DELETE" });
    setEntries(p => p.filter(e => String(e.id) !== String(id)));
    toast("Entry deleted", "er");
  };

  const openAdd = () => {
    setForm({
      ...blank,
      currency: displayCurrency,
      departmentId: String(depts[0]?.id ?? ""),
      departmentName: depts[0]?.name ?? "",
    });
    setShowAdd(true);
  };

  const openEdit = (e: ExpenseEntry) => {
    setEditing(e);
    setForm({
      amount: e.amount,
      currency: ((e.currency as Currency) || "USD"),
      departmentId: e.departmentId ?? "",
      departmentName: e.departmentName ?? "",
      description: e.description,
      entryDate: (e as unknown as { entryDate?: string }).entryDate ?? "",
      month: e.month,
      year: e.year,
    });
  };

  // ── RECEIPT SCANNER ────────────────────────────────────────
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Convert to base64
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUri = reader.result as string;
      setScanPreview(dataUri);
      setScanResult(null);
      setScanning(true);
      try {
        const res = await fetch("/api/scan-receipt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: dataUri }),
        });
        const data = await res.json();
        if (data.data?.error) {
          toast(data.data.error, "er");
          setScanResult(null);
        } else if (data.data) {
          setScanResult(data.data);
        } else {
          toast(data.error || "Scan failed", "er");
        }
      } catch {
        toast("Scan failed", "er");
      }
      setScanning(false);
    };
    reader.readAsDataURL(file);
    // Reset input so the same file can be selected again
    e.target.value = "";
  };

  // Track which scanned line items the user wants to add
  const [selectedItems, setSelectedItems] = useState<Record<number, boolean>>({});

  const toggleItem = (idx: number) =>
    setSelectedItems(p => ({ ...p, [idx]: !p[idx] }));

  const selectAllItems = (items: unknown[]) => {
    const all: Record<number, boolean> = {};
    items.forEach((_, i) => { all[i] = true; });
    setSelectedItems(all);
  };

  const addSelectedItems = async () => {
    if (!scanResult?.items) return;
    const items = scanResult.items as { description: string; amount: number }[];
    const currency = (CURRENCIES.includes(scanResult.currency as Currency) ? scanResult.currency : "USD") as Currency;
    const vendor = String(scanResult.vendor || "");
    const scannedDate = scanResult.date ? new Date(String(scanResult.date)) : null;
    const month = scannedDate ? MONTHS[scannedDate.getMonth()] : MONTHS[new Date().getMonth()];
    const year = scannedDate ? scannedDate.getFullYear() : new Date().getFullYear();

    let added = 0;
    for (let i = 0; i < items.length; i++) {
      if (!selectedItems[i]) continue;
      const item = items[i];
      await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(item.amount) || 0,
          currency,
          departmentId: depts[0]?.id || null,
          description: vendor ? `${vendor} — ${item.description}` : item.description,
          month,
          year,
        }),
      });
      added++;
    }

    await load();
    setShowScanner(false);
    setScanPreview(null);
    setScanResult(null);
    setSelectedItems({});
    toast(`${added} expense${added !== 1 ? "s" : ""} added from receipt`);
  };

  const expenseForm = (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
        <FormField label="Amount">
          <HubInput type="number" value={form.amount || ""} onChange={e => setForm(p => ({ ...p, amount: +e.target.value }))} placeholder="50000" />
        </FormField>
        <FormField label="Currency">
          <HubSelect value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value as Currency }))}>
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </HubSelect>
        </FormField>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <FormField label="Date">
          <HubInput
            type="date"
            value={form.entryDate}
            onChange={e => {
              const d = e.target.value;
              const dt = d ? new Date(d + "T00:00:00") : new Date();
              setForm(p => ({
                ...p,
                entryDate: d,
                month: MONTHS[dt.getMonth()],
                year: dt.getFullYear(),
              }));
            }}
          />
        </FormField>
        <FormField label="Month">
          <HubSelect value={form.month} onChange={e => setForm(p => ({ ...p, month: e.target.value }))}>
            {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
          </HubSelect>
        </FormField>
        <FormField label="Department">
          <HubSelect value={form.departmentId} onChange={e => selectDept(e.target.value)}>
            <option value="">General</option>
            {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </HubSelect>
        </FormField>
      </div>
      <FormField label="Description">
        <HubInput value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Brief description…" />
      </FormField>
    </>
  );

  const byMonth = MONTHS.map(m =>
    entries.filter(e => e.month === m).reduce((a, e) => a + amountIn(e), 0),
  );
  const maxM = Math.max(...byMonth, 1);
  const activeIdxs = byMonth.map((v, i) => v > 0 ? i : -1).filter(i => i >= 0);

  return (
    <AppLayout title="Expenses" onNew={openAdd} newLabel="Add Entry">
      {/* Hidden file input for receipt scanner */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        style={{ display: "none" }}
      />
      <ToastList ts={ts} />

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, fontSize: 11, color: "var(--text-secondary)", flexWrap: "wrap" }}>
        <button
          onClick={() => setShowScanner(true)}
          style={{
            padding: "6px 14px", borderRadius: 8,
            background: "linear-gradient(135deg, var(--accent), var(--violet))",
            color: "#fff", border: "none", fontSize: 11, fontWeight: 700,
            cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
            marginRight: 8,
          }}
        >
          <Camera size={14} /> Scan Receipt
        </button>
        <span style={{ color: "var(--border-card)" }}>|</span>
        <span style={{ marginLeft: 4 }}>Display in:</span>
        {CURRENCIES.map(c => (
          <button
            key={c}
            onClick={() => setPageCurrency(c)}
            style={{
              padding: "4px 10px", borderRadius: 7, border: "1px solid var(--border-card)",
              background: displayCurrency === c ? "var(--accent-bg)" : "var(--bg-input)",
              color: displayCurrency === c ? "var(--accent)" : "var(--text-secondary)",
              fontSize: 11, fontWeight: 700, cursor: "pointer",
            }}
          >
            {c}
          </button>
        ))}
        {pageCurrency && pageCurrency !== globalCurrency && (
          <button
            onClick={() => setPageCurrency(null)}
            style={{ padding: "4px 10px", borderRadius: 7, border: "1px solid var(--border-card)", background: "transparent", color: "var(--text-muted)", fontSize: 10, cursor: "pointer" }}
          >
            Reset to global ({globalCurrency})
          </button>
        )}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:12, marginBottom:14 }}>
        {[
          { l: "Total Expenses", v: formatMoney(total, displayCurrency), c: "#f87171", sub: `${entries.length} entries · all-time` },
          { l: "This Month",     v: formatMoney(thisM, displayCurrency), c: "#fbbf24", sub: `${MONTHS[new Date().getMonth()]} ${new Date().getFullYear()}` },
          { l: "Avg / Entry",    v: formatMoney(entries.length ? total / entries.length : 0, displayCurrency), c: "#a78bfa", sub: "Average per entry" },
        ].map((s,i) => (
          <div key={i} className="hub-card" style={{ position:"relative", overflow:"hidden", padding:20, borderTop:`3px solid ${s.c}` }}>
            <div aria-hidden style={{ position:"absolute", inset:0, background:`radial-gradient(circle at 100% 0%, ${s.c}14, transparent 60%)`, pointerEvents:"none" }} />
            <div style={{ position:"relative" }}>
              <div style={{ fontSize:11, fontWeight:700, color:"var(--text-secondary)", marginBottom:8, textTransform:"uppercase", letterSpacing:".06em" }}>{s.l}</div>
              <div style={{ fontSize:28, fontWeight:800, letterSpacing:"-0.03em", color:s.c, lineHeight:1 }}>{s.v}</div>
              <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:6 }}>{s.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {activeIdxs.length > 0 && (
        <div className="hub-card" style={{ padding:20, marginBottom:14 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
            <div>
              <div style={{ fontSize:13, fontWeight:800, color:"var(--text-primary)" }}>Monthly Expenses</div>
              <div style={{ fontSize:11, color:"var(--text-secondary)", marginTop:2 }}>Values in {displayCurrency}</div>
            </div>
            <div style={{ fontSize:10, color:"var(--text-muted)", fontWeight:700, letterSpacing:".05em", textTransform:"uppercase" }}>
              Peak: {formatMoney(maxM, displayCurrency)}
            </div>
          </div>
          <svg width="100%" viewBox="0 0 540 150" preserveAspectRatio="xMidYMid meet" style={{ display:"block" }}>
            <defs>
              <linearGradient id="expBar" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f87171" stopOpacity="0.95"/>
                <stop offset="100%" stopColor="#f87171" stopOpacity="0.55"/>
              </linearGradient>
            </defs>
            {/* horizontal grid */}
            {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
              <line key={i} x1="0" y1={130 - p * 110} x2="540" y2={130 - p * 110} stroke="var(--border-divider)" strokeWidth="0.5" strokeDasharray="2 3" />
            ))}
            {activeIdxs.map((mi, i) => {
              const cw = 540 / activeIdxs.length;
              const cx = i * cw + cw / 2;
              const bw = Math.min(48, cw * 0.55);
              const bh = Math.max(6, Math.round((byMonth[mi] / maxM) * 110));
              return (
                <g key={mi}>
                  <rect x={cx-bw/2} y={130-bh} width={bw} height={bh} fill="url(#expBar)" rx={6} />
                  <text x={cx} y={144} textAnchor="middle" fontSize={10} fill="var(--text-secondary)" fontFamily="inherit" fontWeight={600}>{MONTHS[mi]}</text>
                  <text x={cx} y={130-bh-5} textAnchor="middle" fontSize={10} fill="#f87171" fontFamily="inherit" fontWeight={800}>{formatMoney(byMonth[mi], displayCurrency)}</text>
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {/* Filters + sort */}
      {entries.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12, padding: "10px 12px", background: "var(--bg-card)", border: "1px solid var(--border-card)", borderRadius: 10 }}>
          <input
            value={fQ}
            onChange={e => setFQ(e.target.value)}
            placeholder="Search description…"
            style={{ flex: 1, minWidth: 140, padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 11, outline: "none" }}
          />
          <select value={fMonth} onChange={e => setFMonth(e.target.value)} style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 11, outline: "none" }}>
            <option value="">All Months</option>
            {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={fYear} onChange={e => setFYear(e.target.value)} style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 11, outline: "none" }}>
            <option value="">All Years</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={fDept} onChange={e => setFDept(e.target.value)} style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 11, outline: "none" }}>
            <option value="">All Departments</option>
            <option value="__none__">General (no dept)</option>
            {depts.map(d => <option key={d.id} value={String(d.id)}>{d.name}</option>)}
          </select>
          <input
            type="number"
            value={fMinAmt}
            onChange={e => setFMinAmt(e.target.value)}
            placeholder="Min $"
            style={{ width: 80, padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 11, outline: "none" }}
          />
          <input
            type="number"
            value={fMaxAmt}
            onChange={e => setFMaxAmt(e.target.value)}
            placeholder="Max $"
            style={{ width: 80, padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 11, outline: "none" }}
          />
          <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 11, outline: "none" }}>
            <option value="date">Sort: Newest</option>
            <option value="month">Sort: Month</option>
            <option value="department">Sort: Department</option>
            <option value="amount_desc">Sort: Amount (high → low)</option>
            <option value="amount_asc">Sort: Amount (low → high)</option>
          </select>
          {(fMonth || fYear || fDept || fMinAmt || fMaxAmt || fQ) && (
            <button
              onClick={() => { setFMonth(""); setFYear(""); setFDept(""); setFMinAmt(""); setFMaxAmt(""); setFQ(""); }}
              style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border-card)", background: "transparent", color: "var(--text-muted)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
            >
              Clear
            </button>
          )}
          <span style={{ fontSize: 11, color: "var(--text-secondary)", marginLeft: "auto" }}>
            {sortedEntries.length} of {entries.length} · {formatMoney(filteredTotal, displayCurrency)}
          </span>
        </div>
      )}

      {loading ? (
        <div className="skeleton" style={{ height:200, borderRadius:12 }} />
      ) : entries.length === 0 ? (
        <EmptyState icon="◈" title="No expense entries yet" desc="Start tracking expenses by adding an entry." action={<button onClick={openAdd} style={{ padding:"8px 18px", borderRadius:8, background:"var(--accent)", color:"#fff", border:"none", fontWeight:700, fontSize:13, cursor:"pointer" }}>Add Entry</button>} />
      ) : sortedEntries.length === 0 ? (
        <EmptyState icon="🔎" title="No matches" desc="Try adjusting your filters." />
      ) : (() => {
        // Group entries by month+year, preserving the sortedEntries order
        // for the group sequence. Each group is collapsible with a header
        // showing the month and total.
        const groups = new Map<string, { label: string; items: typeof sortedEntries; total: number }>();
        for (const e of sortedEntries) {
          const key = `${e.year}-${e.month}`;
          if (!groups.has(key)) {
            groups.set(key, { label: `${e.month} ${e.year}`, items: [], total: 0 });
          }
          const g = groups.get(key)!;
          g.items.push(e);
          g.total += amountIn(e);
        }
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {Array.from(groups.entries()).map(([key, group]) => {
              const isCollapsed = !!collapsedMonths[key];
              return (
                <div key={key} className="hub-card" style={{ padding: 0, overflow: "hidden" }}>
                  <div
                    onClick={() => toggleMonth(key)}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "12px 16px", cursor: "pointer",
                      background: "var(--bg-input)",
                      borderBottom: isCollapsed ? "none" : "1px solid var(--border-divider)",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-primary)" }}>{group.label}</div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                        {group.items.length} {group.items.length === 1 ? "entry" : "entries"}
                      </div>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "var(--danger)" }}>
                      {formatMoney(group.total, displayCurrency)}
                    </div>
                    <span style={{ fontSize: 14, color: "var(--text-muted)", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform .2s" }}>▾</span>
                  </div>
                  {!isCollapsed && (
                    <table className="hub-table">
                      <thead><tr>{["Date","Department","Description","Amount",""].map(h => <th key={h}>{h}</th>)}</tr></thead>
                      <tbody>
                        {group.items.map(e => {
                const entryCurrency = (e.currency as Currency) || "USD";
                const converted = amountIn(e);
                const showConversion = entryCurrency !== displayCurrency;
                return (
                  <tr key={e.id} onMouseEnter={() => setHov(String(e.id))} onMouseLeave={() => setHov(null)} style={{ background: hov === String(e.id) ? "var(--bg-card-hover)" : "transparent" }}>
                    <td style={{ fontSize:12, color:"var(--text-secondary)" }}>
                      {(e as unknown as { entryDate?: string }).entryDate
                        ? new Date((e as unknown as { entryDate: string }).entryDate + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
                        : "—"}
                    </td>
                    <td style={{ fontSize:12, color:"var(--text-secondary)" }}>{e.departmentName || <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>General</span>}</td>
                    <td style={{ fontSize:12, color:"var(--text-secondary)" }}>{e.description}</td>
                    <td>
                      <div style={{ fontSize:13, fontWeight:700, color:"var(--danger)" }}>
                        {formatMoney(converted, displayCurrency)}
                      </div>
                      {showConversion && (
                        <div style={{ fontSize:10, color:"var(--text-muted)", marginTop:2 }}>
                          {formatMoney(e.amount, entryCurrency)} {entryCurrency}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ display:"flex", gap:5 }}>
                        <button onClick={() => openEdit(e)} style={{ padding:"4px 9px", borderRadius:7, border:"1px solid var(--border-card)", background:"var(--bg-input)", color:"var(--text-secondary)", fontSize:11, cursor:"pointer" }}>Edit</button>
                        <button onClick={() => del(e.id)} style={{ padding:"4px 7px", borderRadius:7, border:"1px solid rgba(220,38,38,.3)", background:"var(--danger-bg)", color:"var(--danger)", fontSize:11, cursor:"pointer" }}>✕</button>
                      </div>
                    </td>
                  </tr>
                );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Expense Entry">
        {expenseForm}
        <div style={{ display:"flex", gap:9, justifyContent:"flex-end", marginTop:4 }}>
          <button onClick={() => setShowAdd(false)} style={{ padding:"7px 14px", borderRadius:8, border:"1px solid var(--border-card)", background:"var(--bg-input)", color:"var(--text-primary)", fontSize:12, fontWeight:600, cursor:"pointer" }}>Cancel</button>
          <button onClick={save} style={{ padding:"7px 14px", borderRadius:8, background:"var(--accent)", color:"#fff", border:"none", fontSize:12, fontWeight:700, cursor:"pointer" }}>Add Expense</button>
        </div>
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Edit Expense · ${editing?.month ?? ""} ${editing?.year ?? ""}`}>
        {expenseForm}
        <div style={{ display:"flex", gap:9, justifyContent:"flex-end", marginTop:4 }}>
          <button onClick={() => setEditing(null)} style={{ padding:"7px 14px", borderRadius:8, border:"1px solid var(--border-card)", background:"var(--bg-input)", color:"var(--text-primary)", fontSize:12, fontWeight:600, cursor:"pointer" }}>Cancel</button>
          <button onClick={update} style={{ padding:"7px 14px", borderRadius:8, background:"var(--accent)", color:"#fff", border:"none", fontSize:12, fontWeight:700, cursor:"pointer" }}>Save Changes</button>
        </div>
      </Modal>
      {/* Receipt Scanner Modal */}
      <Modal open={showScanner} onClose={() => { setShowScanner(false); setScanPreview(null); setScanResult(null); }} title="Scan Receipt / Document" width={480}>
        {!scanPreview ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📸</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>
              Upload a receipt or invoice
            </div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 20, lineHeight: 1.5 }}>
              AI will extract the vendor, amount, currency, and description automatically.
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                padding: "12px 28px", borderRadius: 10,
                background: "var(--accent)", color: "#fff", border: "none",
                fontSize: 13, fontWeight: 700, cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 8,
              }}
            >
              <Camera size={16} /> Choose Photo
            </button>
          </div>
        ) : (
          <div>
            {/* Preview */}
            <div style={{
              marginBottom: 14, borderRadius: 10, overflow: "hidden",
              border: "1px solid var(--border-card)", maxHeight: 200,
              display: "flex", justifyContent: "center", background: "var(--bg-input)",
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={scanPreview} alt="Receipt" style={{ maxWidth: "100%", maxHeight: 200, objectFit: "contain" }} />
            </div>

            {scanning ? (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <Loader2 size={24} style={{ animation: "spin 1s linear infinite", color: "var(--accent)", display: "inline-block", marginBottom: 10 }} />
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Analyzing receipt with AI...</div>
              </div>
            ) : scanResult ? (
              <div>
                {/* Header info */}
                <div style={{ display: "flex", gap: 16, marginBottom: 12, fontSize: 12 }}>
                  {scanResult.vendor ? (
                    <div><span style={{ color: "var(--text-muted)", fontWeight: 700 }}>Vendor:</span> <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{String(scanResult.vendor)}</span></div>
                  ) : null}
                  {scanResult.date ? (
                    <div><span style={{ color: "var(--text-muted)", fontWeight: 700 }}>Date:</span> <span style={{ color: "var(--text-primary)" }}>{String(scanResult.date)}</span></div>
                  ) : null}
                  <div><span style={{ color: "var(--text-muted)", fontWeight: 700 }}>Currency:</span> <span style={{ color: "var(--text-primary)" }}>{String(scanResult.currency || "USD")}</span></div>
                </div>

                {/* Line items with checkboxes */}
                {Array.isArray(scanResult.items) && scanResult.items.length > 0 ? (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".07em", color: "var(--text-muted)", textTransform: "uppercase" }}>
                        {(scanResult.items as unknown[]).length} Line Items
                      </div>
                      <button
                        onClick={() => selectAllItems(scanResult.items as unknown[])}
                        style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", background: "transparent", border: "none", cursor: "pointer" }}
                      >
                        Select All
                      </button>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12, maxHeight: 220, overflowY: "auto" }}>
                      {(scanResult.items as { description: string; qty?: number; unitPrice?: number; amount: number }[]).map((item, i) => (
                        <label
                          key={i}
                          style={{
                            display: "flex", alignItems: "center", gap: 10,
                            padding: "8px 12px", borderRadius: 8,
                            border: `1.5px solid ${selectedItems[i] ? "var(--accent)" : "var(--border-card)"}`,
                            background: selectedItems[i] ? "var(--accent-bg)" : "var(--bg-input)",
                            cursor: "pointer", transition: "all .12s",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={!!selectedItems[i]}
                            onChange={() => toggleItem(i)}
                            style={{ accentColor: "var(--accent)", width: 15, height: 15, flexShrink: 0, cursor: "pointer" }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {item.description}
                            </div>
                            {(item.qty || item.unitPrice) && (
                              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                                {item.qty ? `Qty: ${item.qty}` : ""}{item.qty && item.unitPrice ? " × " : ""}{item.unitPrice ? `${String(scanResult.currency || "$")}${Number(item.unitPrice).toFixed(2)}` : ""}
                              </div>
                            )}
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-primary)", flexShrink: 0 }}>
                            {String(scanResult.currency || "$")}{Number(item.amount).toFixed(2)}
                          </div>
                        </label>
                      ))}
                    </div>

                    {/* Summary */}
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-secondary)", padding: "6px 0", borderTop: "1px solid var(--border-divider)" }}>
                      <span>{Object.values(selectedItems).filter(Boolean).length} of {(scanResult.items as unknown[]).length} selected</span>
                      <span>
                        {scanResult.tax != null && <span style={{ marginRight: 12 }}>Tax: {String(scanResult.currency || "$")}{Number(scanResult.tax).toFixed(2)}</span>}
                        Total: <strong style={{ color: "var(--text-primary)" }}>{String(scanResult.currency || "$")}{Number(scanResult.total).toFixed(2)}</strong>
                      </span>
                    </div>

                    {scanResult.confidence != null && (
                      <div style={{ fontSize: 10, color: Number(scanResult.confidence) >= 0.7 ? "var(--success)" : "var(--warning)", fontWeight: 700, marginTop: 6 }}>
                        Confidence: {Math.round(Number(scanResult.confidence) * 100)}%
                      </div>
                    )}

                    <div style={{ display: "flex", gap: 9, justifyContent: "flex-end", marginTop: 12 }}>
                      <button onClick={() => { setScanPreview(null); setScanResult(null); setSelectedItems({}); }} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                        Try Another
                      </button>
                      <button
                        onClick={addSelectedItems}
                        disabled={Object.values(selectedItems).filter(Boolean).length === 0}
                        style={{
                          padding: "7px 14px", borderRadius: 8, background: "var(--accent)", color: "#fff",
                          border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer",
                          opacity: Object.values(selectedItems).filter(Boolean).length === 0 ? 0.5 : 1,
                        }}
                      >
                        Add {Object.values(selectedItems).filter(Boolean).length} Expense{Object.values(selectedItems).filter(Boolean).length !== 1 ? "s" : ""}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: "center", padding: "10px 0", color: "var(--text-muted)", fontSize: 12 }}>
                    No line items detected.
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "10px 0", color: "var(--text-muted)", fontSize: 12 }}>
                Scan complete. No results.
              </div>
            )}
          </div>
        )}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </Modal>
    </AppLayout>
  );
}
