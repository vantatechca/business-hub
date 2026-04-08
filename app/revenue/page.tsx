"use client";
import { useState, useEffect } from "react";
import AppLayout from "@/components/Layout";
import { Modal, FormField, HubInput, HubSelect, useToast, ToastList, EmptyState, formatValue } from "@/components/ui/shared";
import type { RevenueEntry, Department } from "@/lib/types";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const blank = { amount:0, departmentId: "" as string | number, departmentName:"", description:"", month:MONTHS[new Date().getMonth()], year:new Date().getFullYear() };

export default function RevenuePage() {
  const [entries, setEntries] = useState<RevenueEntry[]>([]);
  const [depts, setDepts]     = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm]       = useState<typeof blank>({ ...blank });
  const [hov, setHov]         = useState<number | null>(null);
  const { ts, toast }         = useToast();

  const load = () => Promise.all([
    fetch("/api/revenue").then(r => r.json()),
    fetch("/api/departments").then(r => r.json()),
  ]).then(([e, d]) => { setEntries(e.data ?? []); setDepts(d.data ?? []); setLoading(false); });
  useEffect(() => { load(); }, []);

  const total   = entries.reduce((a, e) => a + e.amount, 0);
  const thisM   = entries.filter(e => e.month === MONTHS[new Date().getMonth()]).reduce((a, e) => a + e.amount, 0);

  const selectDept = (id: string | number) => {
    const d = depts.find(d => String(d.id) === String(id));
    setForm(p => ({ ...p, departmentId: id as number, departmentName: d?.name ?? "" }));
  };

  const save = async () => {
    if (!form.amount || !form.description) return toast("Amount and description required", "er");
    await fetch("/api/revenue", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(form) });
    await load(); setShowAdd(false); toast("Revenue entry added");
  };

  const del = async (id: string | number) => {
    await fetch(`/api/revenue/${id}`, { method:"DELETE" });
    setEntries(p => p.filter(e => String(e.id) !== String(id)));
    toast("Entry deleted", "er");
  };

  const openAdd = () => { setForm({ ...blank, departmentId: String(depts[0]?.id ?? ""), departmentName: depts[0]?.name ?? "" }); setShowAdd(true); };

  // Monthly chart
  const byMonth = MONTHS.map(m => entries.filter(e => e.month === m).reduce((a, e) => a + e.amount, 0));
  const maxM = Math.max(...byMonth, 1);
  const activeIdxs = byMonth.map((v, i) => v > 0 ? i : -1).filter(i => i >= 0);

  return (
    <AppLayout title="Revenue" onNew={openAdd} newLabel="Add Entry">
      <ToastList ts={ts} />

      {/* Summary */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:14 }}>
        {[
          { l:"Total Revenue",    v:formatValue(total,"currency"),  c:"var(--success)" },
          { l:"This Month",       v:formatValue(thisM,"currency"),  c:"var(--accent)" },
          { l:"Entries",          v:String(entries.length),         c:"var(--violet)" },
        ].map((s, i) => (
          <div key={i} className="hub-card" style={{ padding:18 }}>
            <div style={{ fontSize:11, fontWeight:600, color:"var(--text-secondary)", marginBottom:6 }}>{s.l}</div>
            <div style={{ fontSize:24, fontWeight:800, letterSpacing:"-0.03em", color:s.c }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      {activeIdxs.length > 0 && (
        <div className="hub-card" style={{ padding:18, marginBottom:14 }}>
          <div style={{ fontSize:13, fontWeight:800, color:"var(--text-primary)", marginBottom:4 }}>Monthly Revenue</div>
          <div style={{ fontSize:11, color:"var(--text-secondary)", marginBottom:12 }}>USD</div>
          <svg width="100%" viewBox="0 0 540 120" preserveAspectRatio="xMidYMid meet" style={{ display:"block" }}>
            {activeIdxs.map((mi, i) => {
              const cw = 540 / activeIdxs.length;
              const cx = i * cw + cw / 2;
              const bw = Math.min(40, cw * 0.55);
              const bh = Math.round((byMonth[mi] / maxM) * 100);
              return (
                <g key={mi}>
                  <rect x={cx-bw/2} y={110-bh} width={bw} height={bh} fill="var(--success)" rx={4} opacity=".85"/>
                  <text x={cx} y={118} textAnchor="middle" fontSize={9} fill="var(--text-secondary)" fontFamily="inherit">{MONTHS[mi]}</text>
                  <text x={cx} y={110-bh-4} textAnchor="middle" fontSize={9} fill="var(--success)" fontFamily="inherit">{formatValue(byMonth[mi],"currency")}</text>
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="skeleton" style={{ height:200, borderRadius:12 }} />
      ) : entries.length === 0 ? (
        <EmptyState icon="$" title="No revenue entries yet" desc="Start tracking your revenue by adding an entry." action={<button onClick={openAdd} style={{ padding:"8px 18px", borderRadius:8, background:"var(--accent)", color:"#fff", border:"none", fontWeight:700, fontSize:13, cursor:"pointer" }}>Add Entry</button>} />
      ) : (
        <div className="hub-card" style={{ padding:0, overflow:"hidden" }}>
          <table className="hub-table">
            <thead><tr>{["Month","Department","Description","Amount",""].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id} onMouseEnter={() => setHov(e.id)} onMouseLeave={() => setHov(null)} style={{ background: hov===e.id ? "var(--bg-card-hover)" : "transparent" }}>
                  <td style={{ fontSize:12, color:"var(--text-primary)", fontWeight:600 }}>{e.month} {e.year}</td>
                  <td style={{ fontSize:12, color:"var(--text-secondary)" }}>{e.departmentName}</td>
                  <td style={{ fontSize:12, color:"var(--text-secondary)" }}>{e.description}</td>
                  <td style={{ fontSize:13, fontWeight:700, color:"var(--success)" }}>{formatValue(e.amount,"currency")}</td>
                  <td><button onClick={() => del(e.id)} style={{ padding:"3px 8px", borderRadius:6, border:"none", background:"var(--danger-bg)", color:"var(--danger)", fontSize:11, cursor:"pointer" }}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Revenue Entry">
        <FormField label="Amount ($)"><HubInput type="number" value={form.amount || ""} onChange={e => setForm(p => ({...p,amount:+e.target.value}))} placeholder="150000" /></FormField>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <FormField label="Month">
            <HubSelect value={form.month} onChange={e => setForm(p => ({...p,month:e.target.value}))}>
              {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
            </HubSelect>
          </FormField>
          <FormField label="Department">
            <HubSelect value={form.departmentId} onChange={e => selectDept(+e.target.value)}>
              {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </HubSelect>
          </FormField>
        </div>
        <FormField label="Description"><HubInput value={form.description} onChange={e => setForm(p => ({...p,description:e.target.value}))} placeholder="Brief description…" /></FormField>
        <div style={{ display:"flex", gap:9, justifyContent:"flex-end", marginTop:4 }}>
          <button onClick={() => setShowAdd(false)} style={{ padding:"7px 14px", borderRadius:8, border:"1px solid var(--border-card)", background:"var(--bg-input)", color:"var(--text-primary)", fontSize:12, fontWeight:600, cursor:"pointer" }}>Cancel</button>
          <button onClick={save} style={{ padding:"7px 14px", borderRadius:8, background:"var(--accent)", color:"#fff", border:"none", fontSize:12, fontWeight:700, cursor:"pointer" }}>Add Revenue</button>
        </div>
      </Modal>
    </AppLayout>
  );
}
