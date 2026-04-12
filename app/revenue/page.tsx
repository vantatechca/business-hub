"use client";
import { useState, useEffect } from "react";
import AppLayout from "@/components/Layout";
import { Modal, FormField, HubInput, HubSelect, useToast, ToastList, EmptyState } from "@/components/ui/shared";
import AiSearchBar from "@/components/AiSearchBar";
import { useAiSearch } from "@/lib/useAiSearch";
import type { RevenueEntry, Department } from "@/lib/types";
import { formatMoney, CURRENCIES, type Currency } from "@/lib/currency";
import { useCurrency } from "@/lib/CurrencyContext";

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

export default function RevenuePage() {
  const { currency: globalCurrency, convert } = useCurrency();
  // Page-level override. Starts at null (== follow global), user can switch
  // without affecting other pages.
  const [pageCurrency, setPageCurrency] = useState<Currency | null>(null);
  const displayCurrency: Currency = pageCurrency ?? globalCurrency;

  const [entries, setEntries] = useState<RevenueEntry[]>([]);
  const [depts, setDepts]     = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<RevenueEntry | null>(null);
  const [form, setForm]       = useState<typeof blank>({ ...blank });
  const [hov, setHov]         = useState<string | null>(null);
  const ai = useAiSearch("revenue");
  const runRevenueAi = () => {
    const items = entries.map(e => ({
      id: String(e.id),
      text: [e.description, e.departmentName, `${e.currency} ${e.amount}`, `${e.month} ${e.year}`].filter(Boolean).join(" | "),
    }));
    ai.runAiSearch(items);
  };
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
    try { return JSON.parse(localStorage.getItem("revenue_collapsed") ?? "{}"); } catch { return {}; }
  });
  const toggleMonth = (key: string) => setCollapsedMonths(p => {
    const next = { ...p, [key]: !p[key] };
    try { localStorage.setItem("revenue_collapsed", JSON.stringify(next)); } catch {}
    return next;
  });
  const { ts, toast }         = useToast();

  const load = () => Promise.all([
    fetch("/api/revenue").then(r => r.json()),
    fetch("/api/departments").then(r => r.json()),
  ]).then(([e, d]) => { setEntries(e.data ?? []); setDepts(d.data ?? []); setLoading(false); });
  useEffect(() => { load(); }, []);

  // Convert each entry to the display currency so totals/chart/table all agree.
  const amountIn = (e: RevenueEntry) => convert(e.amount, (e.currency as Currency) || "USD", displayCurrency);

  const total = entries.reduce((a, e) => a + amountIn(e), 0);
  const thisM = entries.filter(e => e.month === MONTHS[new Date().getMonth()]).reduce((a, e) => a + amountIn(e), 0);

  const years = Array.from(new Set(entries.map(e => String(e.year)))).sort((a, b) => Number(b) - Number(a));

  const filteredEntries = entries.filter(e => {
    if (ai.aiMode && ai.matchedIds && !ai.matchedIds.has(String(e.id))) return false;
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
    await fetch("/api/revenue", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(form) });
    await load(); setShowAdd(false); toast("Revenue entry added");
  };

  const update = async () => {
    if (!editing) return;
    if (!form.amount || !form.description) return toast("Amount and description required", "er");
    const res = await fetch(`/api/revenue/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) return toast("Update failed", "er");
    await load(); setEditing(null); toast("Entry updated");
  };

  const openEdit = (e: RevenueEntry) => {
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

  const del = async (id: string | number) => {
    await fetch(`/api/revenue/${id}`, { method:"DELETE" });
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

  // Monthly chart (values in display currency)
  const byMonth = MONTHS.map(m =>
    entries.filter(e => e.month === m).reduce((a, e) => a + amountIn(e), 0),
  );
  const maxM = Math.max(...byMonth, 1);
  const activeIdxs = byMonth.map((v, i) => v > 0 ? i : -1).filter(i => i >= 0);

  // Reusable form (focus-safe JSX value, shared between Add and Edit modals)
  const entryForm = (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
        <FormField label="Amount">
          <HubInput type="number" value={form.amount || ""} onChange={e => setForm(p => ({ ...p, amount: +e.target.value }))} placeholder="150000" />
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

  return (
    <AppLayout title="Revenue" onNew={openAdd} newLabel="Add Entry">
      <ToastList ts={ts} />

      {/* Page-level currency switcher. Does NOT touch the global currency. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, fontSize: 11, color: "var(--text-secondary)" }}>
        <span>Display in:</span>
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

      {/* Summary */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:12, marginBottom:14 }}>
        {[
          { l: "Total Revenue", v: formatMoney(total, displayCurrency), c: "#34d399", sub: `${entries.length} entries · all-time` },
          { l: "This Month",    v: formatMoney(thisM, displayCurrency), c: "#5b8ef8", sub: `${MONTHS[new Date().getMonth()]} ${new Date().getFullYear()}` },
          { l: "Avg / Entry",   v: formatMoney(entries.length ? total / entries.length : 0, displayCurrency), c: "#a78bfa", sub: "Average per entry" },
        ].map((s, i) => (
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

      {/* Chart */}
      {activeIdxs.length > 0 && (
        <div className="hub-card" style={{ padding:20, marginBottom:14 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
            <div>
              <div style={{ fontSize:13, fontWeight:800, color:"var(--text-primary)" }}>Monthly Revenue</div>
              <div style={{ fontSize:11, color:"var(--text-secondary)", marginTop:2 }}>Values in {displayCurrency}</div>
            </div>
            <div style={{ fontSize:10, color:"var(--text-muted)", fontWeight:700, letterSpacing:".05em", textTransform:"uppercase" }}>
              Peak: {formatMoney(maxM, displayCurrency)}
            </div>
          </div>
          <svg width="100%" viewBox="0 0 540 150" preserveAspectRatio="xMidYMid meet" style={{ display:"block" }}>
            <defs>
              <linearGradient id="revBar" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity="0.95"/>
                <stop offset="100%" stopColor="#34d399" stopOpacity="0.55"/>
              </linearGradient>
            </defs>
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
                  <rect x={cx-bw/2} y={130-bh} width={bw} height={bh} fill="url(#revBar)" rx={6} />
                  <text x={cx} y={144} textAnchor="middle" fontSize={10} fill="var(--text-secondary)" fontFamily="inherit" fontWeight={600}>{MONTHS[mi]}</text>
                  <text x={cx} y={130-bh-5} textAnchor="middle" fontSize={10} fill="#34d399" fontFamily="inherit" fontWeight={800}>{formatMoney(byMonth[mi], displayCurrency)}</text>
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {/* AI search */}
      {entries.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <AiSearchBar
            aiMode={ai.aiMode}
            setAiMode={ai.setAiMode}
            q={ai.q}
            setQ={ai.setQ}
            loading={ai.loading}
            onRun={runRevenueAi}
            clear={ai.clear}
            placeholder="Ask anything... e.g. 'shopify revenue this quarter'"
            plainPlaceholder="Use the filters below"
            matchCount={filteredEntries.length}
            hasMatches={!!ai.matchedIds}
            explanation={ai.explanation}
          />
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
          <input type="number" value={fMinAmt} onChange={e => setFMinAmt(e.target.value)} placeholder="Min $" style={{ width: 80, padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 11, outline: "none" }} />
          <input type="number" value={fMaxAmt} onChange={e => setFMaxAmt(e.target.value)} placeholder="Max $" style={{ width: 80, padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 11, outline: "none" }} />
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
        <EmptyState icon="$" title="No revenue entries yet" desc="Start tracking your revenue by adding an entry." action={<button onClick={openAdd} style={{ padding:"8px 18px", borderRadius:8, background:"var(--accent)", color:"#fff", border:"none", fontWeight:700, fontSize:13, cursor:"pointer" }}>Add Entry</button>} />
      ) : sortedEntries.length === 0 ? (
        <EmptyState icon="🔎" title="No matches" desc="Try adjusting your filters." />
      ) : (() => {
        const groups = new Map<string, { label: string; items: typeof sortedEntries; total: number }>();
        for (const e of sortedEntries) {
          const key = `${e.year}-${e.month}`;
          if (!groups.has(key)) groups.set(key, { label: `${e.month} ${e.year}`, items: [], total: 0 });
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
                    <div style={{ fontSize: 14, fontWeight: 800, color: "var(--success)" }}>
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
                              <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                                {(e as unknown as { entryDate?: string }).entryDate
                                  ? new Date((e as unknown as { entryDate: string }).entryDate + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
                                  : "—"}
                              </td>
                              <td style={{ fontSize:12, color:"var(--text-secondary)" }}>{e.departmentName || <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>General</span>}</td>
                              <td style={{ fontSize:12, color:"var(--text-secondary)" }}>{e.description}</td>
                              <td>
                                <div style={{ fontSize:13, fontWeight:700, color:"var(--success)" }}>
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
                                  <button onClick={() => openEdit(e)} style={{ padding:"3px 8px", borderRadius:6, border:"1px solid var(--border-card)", background:"var(--bg-input)", color:"var(--text-secondary)", fontSize:11, cursor:"pointer" }}>Edit</button>
                                  <button onClick={() => del(e.id)} style={{ padding:"3px 8px", borderRadius:6, border:"none", background:"var(--danger-bg)", color:"var(--danger)", fontSize:11, cursor:"pointer" }}>✕</button>
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

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Revenue Entry">
        {entryForm}
        <div style={{ display:"flex", gap:9, justifyContent:"flex-end", marginTop:4 }}>
          <button onClick={() => setShowAdd(false)} style={{ padding:"7px 14px", borderRadius:8, border:"1px solid var(--border-card)", background:"var(--bg-input)", color:"var(--text-primary)", fontSize:12, fontWeight:600, cursor:"pointer" }}>Cancel</button>
          <button onClick={save} style={{ padding:"7px 14px", borderRadius:8, background:"var(--accent)", color:"#fff", border:"none", fontSize:12, fontWeight:700, cursor:"pointer" }}>Add Revenue</button>
        </div>
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit Revenue Entry">
        {entryForm}
        <div style={{ display:"flex", gap:9, justifyContent:"flex-end", marginTop:4 }}>
          <button onClick={() => setEditing(null)} style={{ padding:"7px 14px", borderRadius:8, border:"1px solid var(--border-card)", background:"var(--bg-input)", color:"var(--text-primary)", fontSize:12, fontWeight:600, cursor:"pointer" }}>Cancel</button>
          <button onClick={update} style={{ padding:"7px 14px", borderRadius:8, background:"var(--accent)", color:"#fff", border:"none", fontSize:12, fontWeight:700, cursor:"pointer" }}>Save Changes</button>
        </div>
      </Modal>
    </AppLayout>
  );
}
