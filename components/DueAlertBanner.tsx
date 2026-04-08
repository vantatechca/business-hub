"use client";
import React from "react";
import Link from "next/link";
import { AlertCircle, Clock } from "lucide-react";

// Shared due-date alert banner used by /tasks, /metrics, and the department
// detail page. Given a list of items with a `dueDate` and `title`, it groups
// them into "Overdue" (due < today) and "Due soon" (today through +3 days)
// and renders a single compact card. If both buckets are empty, renders null.
//
// This is purely a visual notification; scheduled email / push notifications
// are a separate feature. The banner answers the "I want to know at a glance"
// need on each page.

export interface DueItem {
  id: string | number;
  title: string;
  dueDate?: string | null;
  status?: string;                 // tasks: 'done' is excluded
  metricType?: string;             // metrics: no special handling yet
  assigneeName?: string | null;
  departmentName?: string | null;
  href?: string;                   // optional link for the row
}

function parseIso(d: string | null | undefined): Date | null {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  return new Date(d + "T00:00:00");
}

export function partitionByDue(items: DueItem[]): { overdue: DueItem[]; soon: DueItem[] } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const inThreeDays = new Date(today);
  inThreeDays.setDate(today.getDate() + 3);

  const overdue: DueItem[] = [];
  const soon: DueItem[] = [];
  for (const it of items) {
    if (it.status === "done") continue;
    const d = parseIso(it.dueDate ?? null);
    if (!d) continue;
    if (d.getTime() < today.getTime()) overdue.push(it);
    else if (d.getTime() <= inThreeDays.getTime()) soon.push(it);
  }
  // Sort each bucket: overdue by most-overdue first, soon by closest first
  overdue.sort((a, b) => (parseIso(a.dueDate)!.getTime()) - (parseIso(b.dueDate)!.getTime()));
  soon.sort((a, b) => (parseIso(a.dueDate)!.getTime()) - (parseIso(b.dueDate)!.getTime()));
  return { overdue, soon };
}

export default function DueAlertBanner({
  items,
  label = "items",
  viewAllHref,
}: {
  items: DueItem[];
  /** e.g. "tasks", "metrics" */
  label?: string;
  /** Optional "View all" link shown on the right */
  viewAllHref?: string;
}) {
  const { overdue, soon } = partitionByDue(items);
  if (overdue.length === 0 && soon.length === 0) return null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: overdue.length > 0 && soon.length > 0 ? "1fr 1fr" : "1fr", gap: 12, marginBottom: 14 }}>
      {overdue.length > 0 && (
        <DueCard
          title={`${overdue.length} overdue ${label}`}
          accent="var(--danger)"
          gradient="linear-gradient(135deg, rgba(248,113,113,.12), rgba(251,146,60,.12))"
          icon={<AlertCircle size={18} color="var(--danger)" />}
          items={overdue}
          label={label}
          viewAllHref={viewAllHref}
        />
      )}
      {soon.length > 0 && (
        <DueCard
          title={`${soon.length} ${label} due within 3 days`}
          accent="var(--warning)"
          gradient="linear-gradient(135deg, rgba(251,191,36,.12), rgba(253,186,116,.12))"
          icon={<Clock size={18} color="var(--warning)" />}
          items={soon}
          label={label}
          viewAllHref={viewAllHref}
        />
      )}
    </div>
  );
}

function DueCard({
  title,
  accent,
  gradient,
  icon,
  items,
  label,
  viewAllHref,
}: {
  title: string;
  accent: string;
  gradient: string;
  icon: React.ReactNode;
  items: DueItem[];
  label: string;
  viewAllHref?: string;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const describe = (it: DueItem): string => {
    const d = parseIso(it.dueDate ?? null);
    if (!d) return "";
    const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
    if (diff < 0) return `${Math.abs(diff)} day${Math.abs(diff) === 1 ? "" : "s"} overdue`;
    if (diff === 0) return "Due today";
    if (diff === 1) return "Due tomorrow";
    return `Due in ${diff} days`;
  };

  const shown = items.slice(0, 4);
  const extra = items.length - shown.length;

  return (
    <div
      style={{
        padding: "14px 16px",
        borderRadius: 12,
        background: gradient,
        border: `1px solid ${accent}55`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: `${accent}1a`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: accent, letterSpacing: ".05em", textTransform: "uppercase" }}>
            {title}
          </div>
        </div>
        {viewAllHref && (
          <Link
            href={viewAllHref}
            style={{ fontSize: 11, fontWeight: 700, color: accent, textDecoration: "none", flexShrink: 0 }}
          >
            View all →
          </Link>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {shown.map(it => (
          <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-primary)" }}>
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>
              {it.title}
              {it.departmentName && <span style={{ fontWeight: 400, color: "var(--text-muted)" }}> · {it.departmentName}</span>}
            </span>
            <span style={{ fontSize: 10, fontWeight: 700, color: accent, flexShrink: 0 }}>
              {describe(it)}
            </span>
          </div>
        ))}
        {extra > 0 && (
          <div style={{ fontSize: 11, color: "var(--text-secondary)", fontStyle: "italic" }}>
            +{extra} more
          </div>
        )}
      </div>
    </div>
  );
}
