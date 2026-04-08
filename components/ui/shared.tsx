"use client";
import React, { useState, useEffect } from "react";
import { X } from "lucide-react";

// ── TOKENS ────────────────────────────────────────────────────
export const inputCls = "w-full rounded-[var(--radius-md)] px-3 py-2 text-sm outline-none transition-colors font-[inherit]";
export const labelCls = "block text-[10px] font-extrabold mb-1.5 tracking-[.07em] uppercase";
export const btnPrimaryCls = "inline-flex items-center gap-1.5 px-4 py-2 rounded-[var(--radius-md)] text-sm font-bold cursor-pointer border-none text-white transition-opacity hover:opacity-90 active:scale-[.97]";
export const btnSecondaryCls = "inline-flex items-center gap-1.5 px-4 py-2 rounded-[var(--radius-md)] text-sm font-semibold cursor-pointer transition-colors";
export const btnDangerCls = "inline-flex items-center gap-1.5 px-4 py-2 rounded-[var(--radius-md)] text-sm font-bold cursor-pointer";

// ── HELPERS ───────────────────────────────────────────────────
export function formatValue(v: number | string | null | undefined, f: "number"|"currency"|"percent"): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  if (f==="currency") return n>=1e6?`$${(n/1e6).toFixed(2)}M`:`$${Math.round(n/1000)}K`;
  if (f==="percent") return `${n}%`;
  return n.toLocaleString();
}
export function pctChange(cur: number | string, prev: number | string) {
  const c = Number(cur) || 0;
  const p = Number(prev) || 0;
  return { value: Math.abs((c-p)/Math.max(p,1)*100).toFixed(1), up: c>=p };
}
// healthColor is exported from lib/types
export function avatarBg(s: string) {
  return `hsl(${s.split("").reduce((a,c)=>a+c.charCodeAt(0),0)*47%360},50%,40%)`;
}

// ── AVATAR ────────────────────────────────────────────────────
export function Avatar({ s, size=32 }: { s: string; size?: number }) {
  return <div style={{width:size,height:size,borderRadius:"50%",background:avatarBg(s),display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.36,fontWeight:700,color:"#fff",flexShrink:0,letterSpacing:"-0.02em",userSelect:"none"}}>{s}</div>;
}

// ── SPARKLINE ─────────────────────────────────────────────────
export function Sparkline({ data, color="var(--accent)", w=72, h=26 }: { data:number[]; color?:string; w?:number; h?:number }) {
  if (!data.length) return null;
  const max=Math.max(...data),min=Math.min(...data),range=max-min||1;
  const pts=data.map((v,i)=>[(i/(data.length-1))*w, h-((v-min)/range)*(h-6)-3]);
  const ln=pts.map(p=>p.join(",")).join(" ");
  const ar=`M${pts[0].join(",")} L${ln} L${w},${h} L0,${h} Z`;
  // Stable ID: hash color + first+last data points (no Math.random = no hydration mismatch)
  const stableKey = color.replace(/\W/g,"") + (data[0]??0) + (data[data.length-1]??0) + data.length;
  const id=`sp${stableKey}`;
  return <svg width={w} height={h} style={{display:"block",overflow:"visible"}} aria-hidden><defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".25"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs><path d={ar} fill={`url(#${id})`}/><polyline points={ln} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

// ── PROGRESS BAR ──────────────────────────────────────────────
export function ProgressBar({ value, color="var(--accent)", height=6 }: { value:number; color?:string; height?:number }) {
  return <div className="progress-track" style={{height}}><div className="progress-fill" style={{width:`${Math.min(100,Math.max(0,value))}%`,background:color,height}}/></div>;
}

// ── BADGE ─────────────────────────────────────────────────────
export function Badge({ children, bg, color }: { children:React.ReactNode; bg:string; color:string }) {
  return <span style={{padding:"2px 8px",borderRadius:6,fontSize:11,fontWeight:700,background:bg,color,whiteSpace:"nowrap"}}>{children}</span>;
}

// ── CARD ──────────────────────────────────────────────────────
export function Card({ children, className="", onClick, p=18 }: { children:React.ReactNode; className?:string; onClick?:()=>void; p?:number }) {
  return <div onClick={onClick} className={`hub-card ${onClick?"hub-card-hover cursor-pointer":""} ${className}`} style={{padding:p}}>{children}</div>;
}

// ── FORM FIELD ────────────────────────────────────────────────
export function FormField({ label, children, error }: { label:string; children:React.ReactNode; error?:string }) {
  return <div style={{marginBottom:13}}><div className={labelCls} style={{color:"var(--text-secondary)"}}>{label}</div>{children}{error&&<p style={{marginTop:4,fontSize:11,color:"var(--danger)"}}>{error}</p>}</div>;
}

export function HubInput({ c:_c, style={}, ...p }: React.InputHTMLAttributes<HTMLInputElement> & { c?: unknown }) {
  return <input {...p} className={inputCls} style={{background:"var(--bg-input)",border:"1px solid var(--border-card)",color:"var(--text-primary)",...style}}/>;
}
export function HubSelect({ c:_c, children, style={}, ...p }: React.SelectHTMLAttributes<HTMLSelectElement> & { c?: unknown }) {
  return <select {...p} className={inputCls} style={{background:"var(--bg-input)",border:"1px solid var(--border-card)",color:"var(--text-primary)",...style}}>{children}</select>;
}
export function HubTextarea({ c:_c, style={}, ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { c?: unknown }) {
  return <textarea {...p} className={inputCls} style={{background:"var(--bg-input)",border:"1px solid var(--border-card)",color:"var(--text-primary)",resize:"vertical",...style}}/>;
}

// ── MODAL ─────────────────────────────────────────────────────
export function Modal({ open, onClose, title, width=480, children }: { open:boolean; onClose:()=>void; title:string; width?:number; children:React.ReactNode }) {
  useEffect(()=>{
    if (!open) return;
    const fn=(e:KeyboardEvent)=>{ if(e.key==="Escape") onClose(); };
    document.addEventListener("keydown",fn);
    document.body.style.overflow="hidden";
    return()=>{ document.removeEventListener("keydown",fn); document.body.style.overflow=""; };
  },[open,onClose]);
  if (!open) return null;
  return <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose()}}><div className="modal-panel" style={{width}}><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 20px",borderBottom:"1px solid var(--border-divider)"}}><div style={{fontSize:14,fontWeight:800,color:"var(--text-primary)"}}>{title}</div><button onClick={onClose} style={{background:"transparent",border:"none",color:"var(--text-secondary)",fontSize:20,cursor:"pointer",lineHeight:1,display:"flex"}}><X size={16}/></button></div><div style={{padding:"18px 20px"}}>{children}</div></div></div>;
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  name,
  entity = "item",
  // Optional overrides for non-delete confirms (e.g. password reset). Default
  // copy is the destructive "Delete" wording so existing call sites are
  // unchanged.
  title = "Confirm Delete",
  message,
  confirmLabel = "Delete",
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  name: string;
  entity?: string;
  title?: string;
  message?: React.ReactNode;
  confirmLabel?: string;
}) {
  const body = message ?? (
    <>Are you sure you want to delete <strong style={{ color: "var(--text-primary)" }}>{name}</strong>? This {entity} will be permanently removed.</>
  );
  return (
    <Modal open={open} onClose={onClose} title={title} width={420}>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20, lineHeight: 1.6 }}>{body}</p>
      <div style={{ display: "flex", gap: 9, justifyContent: "flex-end" }}>
        <button onClick={onClose} className={btnSecondaryCls} style={{ background: "var(--bg-input)", border: "1px solid var(--border-card)", color: "var(--text-primary)" }}>Cancel</button>
        <button onClick={() => { onConfirm(); onClose(); }} className={btnDangerCls} style={{ background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid rgba(220,38,38,.3)" }}>{confirmLabel}</button>
      </div>
    </Modal>
  );
}

// ── TOAST ─────────────────────────────────────────────────────
interface Toast { id:string; msg:string; type:"ok"|"er"|"wa"; }
export function useToast() {
  const [ts,sts]=useState<Toast[]>([]);
  // IMPORTANT: toast MUST be stable across renders. If it changes every render,
  // callers that put it in a useCallback/useEffect dep array (e.g. the checkin
  // and department detail pages) will fire infinite loops of fetches and hit
  // ERR_INSUFFICIENT_RESOURCES in the browser.
  const toast = React.useCallback((msg:string,type:"ok"|"er"|"wa"="ok")=>{
    const id=Math.random().toString(36).slice(2);
    sts(p=>[...p,{id,msg,type}]);
    setTimeout(()=>sts(p=>p.filter(t=>t.id!==id)),3500);
  }, []);
  return { ts, toast };
}
export function ToastList({ ts }: { ts:Toast[] }) {
  const bg={ok:"var(--success)",er:"var(--danger)",wa:"var(--warning)"};
  const ic={ok:"✓",er:"✕",wa:"⚠"};
  return <div className="toast-container">{ts.map(t=><div key={t.id} className="toast animate-slide-right" style={{background:bg[t.type]}}>{ic[t.type]} {t.msg}</div>)}</div>;
}

// ── EMPTY STATE ───────────────────────────────────────────────
export function EmptyState({ icon="📭", title, desc, action }: { icon?:string; title:string; desc?:string; action?:React.ReactNode }) {
  return <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"48px 0",textAlign:"center"}}><div style={{fontSize:48,marginBottom:12}}>{icon}</div><div style={{fontSize:14,fontWeight:700,color:"var(--text-primary)",marginBottom:6}}>{title}</div>{desc&&<div style={{fontSize:12,color:"var(--text-secondary)",marginBottom:16,maxWidth:280}}>{desc}</div>}{action}</div>;
}

// ── RE-EXPORTS from lib/types (for convenience) ─────────────────────────────
export { priorityColor, priorityLabel, formatMetricValue, getInitials, metricDelta, healthColor } from "@/lib/types";
