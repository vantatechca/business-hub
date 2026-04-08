"use client";
import { useState, useRef, useEffect } from "react";
import { X, ChevronDown } from "lucide-react";
import type { Department } from "@/lib/types";

interface Props {
  departments: Department[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
}

// Multi-select chip input used on Team and Users pages for the "Departments"
// field. A user (Lead or Member) can belong to multiple departments. Clicking
// a chip removes it; clicking the input opens a dropdown of unselected depts.
export default function MultiDeptSelect({ departments, selectedIds, onChange, placeholder = "Add department…" }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const selectedSet = new Set(selectedIds.map(String));
  const selected = departments.filter(d => selectedSet.has(String(d.id)));
  const available = departments.filter(d => !selectedSet.has(String(d.id)));

  const add = (id: string) => {
    onChange([...selectedIds, id]);
    setOpen(false);
  };
  const remove = (id: string) => {
    onChange(selectedIds.filter(x => String(x) !== String(id)));
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <div
        onClick={() => setOpen(v => !v)}
        style={{
          minHeight: 36,
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border-card)",
          background: "var(--bg-input)",
          padding: "5px 8px",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 5,
          cursor: "pointer",
        }}
      >
        {selected.map(d => (
          <span
            key={d.id}
            onClick={e => e.stopPropagation()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 8px",
              borderRadius: 6,
              background: (d.color ?? "#5b8ef8") + "22",
              color: d.color ?? "var(--accent)",
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {d.name}
            <button
              onClick={e => { e.stopPropagation(); remove(String(d.id)); }}
              style={{ background: "transparent", border: "none", cursor: "pointer", color: "inherit", display: "flex", padding: 0 }}
              aria-label={`Remove ${d.name}`}
            >
              <X size={11} />
            </button>
          </span>
        ))}
        {selected.length === 0 && (
          <span style={{ fontSize: 12, color: "var(--text-muted)", padding: "4px 4px" }}>{placeholder}</span>
        )}
        <div style={{ flex: 1 }} />
        <ChevronDown size={13} style={{ color: "var(--text-muted)" }} />
      </div>

      {open && available.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: "var(--bg-card)",
            border: "1px solid var(--border-card)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-dropdown)",
            zIndex: 200,
            maxHeight: 240,
            overflowY: "auto",
            padding: 4,
          }}
        >
          {available.map(d => (
            <button
              key={d.id}
              onClick={() => add(String(d.id))}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "8px 10px",
                borderRadius: 6,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                fontSize: 12,
                color: "var(--text-primary)",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-card-hover)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: d.color ?? "#5b8ef8" }} />
              <span style={{ flex: 1 }}>{d.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
