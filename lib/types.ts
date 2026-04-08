export type UserRole = "admin" | "leader" | "member";
export type MetricType = "value" | "daily" | "value_and_daily";
export type MetricDirection = "higher_better" | "lower_better";
export type AssignmentRole = "owner" | "contributor" | "reviewer";
export type CheckInStatus = "pending" | "submitted" | "ai_processed" | "reviewed";
export type NotifType = "checkin_reminder" | "missed_checkin" | "metric_alert" | "ai_flag" | "stalled_metric" | "priority_change" | "weekly_summary" | "api_sync_error" | "system";
export type UpdateSource = "checkin" | "manual" | "api_sync" | "sheets_import";

export interface User {
  id: string; email: string; name: string; role: UserRole;
  avatarUrl?: string; timezone?: string; isActive: boolean;
  lastLoginAt?: string; lastCheckinAt?: string; createdAt: string;
  initials?: string; checkedInToday?: boolean; streak?: number;
}

export interface Department {
  id: string; name: string; slug: string; color: string; icon: string;
  priorityScore: number; googleSheetUrl?: string; description?: string; sortOrder: number;
  createdAt?: string; metricCount?: number; memberCount?: number; health?: number;
}

export interface Metric {
  id: string; departmentId: string; departmentName?: string; departmentColor?: string;
  name: string; metricType: MetricType; direction: MetricDirection;
  currentValue: number; previousValue: number; thirtyDayTotal: number;
  targetValue?: number; unit: string; priorityScore: number;
  notes?: string; sortOrder: number; createdAt?: string; updatedAt?: string;
  assignees?: MetricAssignment[]; lastUpdatedBy?: string; lastUpdatedAt?: string; apiVerified?: boolean;
}

export interface MetricAssignment {
  id: string; metricId: string; metricName?: string;
  userId: string; userName?: string; userInitials?: string;
  roleInMetric: AssignmentRole; assignedAt: string; assignedBy?: string;
}

export interface DailyCheckin {
  id: string; userId: string; userName?: string; userInitials?: string;
  checkinDate: string; rawResponse?: string; aiSummary?: string;
  aiExtractedMetrics?: ExtractedMetric[]; aiConfidenceScore?: number;
  aiFlags?: AiFlag[]; mood?: string; moodEmoji?: string;
  wins?: string; blockers?: string; status: CheckInStatus;
  reviewedBy?: string; reviewerNotes?: string;
  submittedAt?: string; processedAt?: string; createdAt: string;
}

export interface ExtractedMetric {
  metricId?: string; metricName: string; delta?: number;
  newValue?: number; confidence: number; confirmed?: boolean;
}

export interface AiFlag { description: string; severity: "low" | "medium" | "high"; }

export interface MetricUpdate {
  id: string; metricId: string; metricName?: string; userId?: string; userName?: string;
  checkinId?: string; source: UpdateSource; oldValue: number; newValue: number;
  delta: number; apiVerified: boolean; apiSource?: string; notes?: string; createdAt: string;
}

export interface Notification {
  id: string; userId?: string; type: NotifType; title: string;
  body?: string; isRead: boolean; actionUrl?: string; createdAt: string;
}

export interface DailyPrompt {
  id: string; departmentId?: string; promptText: string;
  promptType: "universal" | "department" | "metric_specific";
  isActive: boolean; createdAt: string;
}

export interface ApiResponse<T = unknown> { data?: T; error?: string; message?: string; }

export interface SessionUser { id: string; name: string; email: string; role: UserRole; }

export function priorityColor(score: number): string {
  if (score >= 80) return "var(--danger)";
  if (score >= 50) return "var(--warning)";
  return "var(--accent)";
}
export function priorityLabel(score: number): string {
  if (score >= 80) return "Critical";
  if (score >= 50) return "Important";
  return "Standard";
}

// Canonical priority "level" <-> numeric score mapping used by the metric /
// department forms. The backend still stores an INTEGER (1-100) so this
// keeps existing rows working; the UI just picks one of three discrete
// values. Any score in the "close-enough" band of an existing row round-trips
// to the correct label via priorityLabel().
export const PRIORITY_OPTIONS = [
  { value: 25, label: "Standard" },
  { value: 65, label: "Important" },
  { value: 90, label: "Critical" },
] as const;

/** Given any numeric score, return the canonical option value that best
 *  represents it. Used to pre-select the dropdown when editing an existing
 *  row whose stored score might be anywhere in 1-100. */
export function priorityToOption(score: number | undefined | null): number {
  const n = Number(score ?? 25);
  if (n >= 80) return 90;
  if (n >= 50) return 65;
  return 25;
}
export function healthColor(score: number): string {
  if (score >= 80) return "var(--success)";
  if (score >= 60) return "var(--warning)";
  return "var(--danger)";
}
export function metricDelta(m: Metric): { value: number; isGood: boolean; pct: string } {
  const cur = Number(m.currentValue) || 0;
  const prev = Number(m.previousValue) || 0;
  const delta = cur - prev;
  const pct = prev !== 0 ? Math.abs(Math.round((delta / prev) * 100)) : 0;
  const up = delta >= 0;
  const isGood = m.direction === "higher_better" ? up : !up;
  return { value: delta, isGood, pct: `${pct}%` };
}
export function formatMetricValue(value: number | string | null | undefined, unit: string): string {
  const v = Number(value);
  if (!Number.isFinite(v)) return "—";
  if (unit === "USD" || unit === "CAD") return v >= 1000 ? `$${(v/1000).toFixed(1)}K` : `$${v.toFixed(0)}`;
  if (unit === "minutes") return `${v}m`;
  return v.toLocaleString();
}
export function getInitials(name: string): string {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

// Format a task dueDate for display on cards. Accepts either ISO YYYY-MM-DD
// (from the new date picker) or a legacy free-text string ("Today", "Dec 10").
export function formatTaskDueDate(raw: string | undefined | null): string {
  if (!raw) return "—";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw + "T00:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Is this dueDate today or overdue (for red highlighting)?
export function isTaskDueTodayOrPast(raw: string | undefined | null): boolean {
  if (!raw) return false;
  if (raw === "Today") return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const d = new Date(raw + "T00:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return d.getTime() <= today.getTime();
}

// ── Team / Tasks / Goals / Finance (DB-backed) ─────────────────────────
// All of these types are UUID-id'd now that seed.ts is gone.
export interface TeamMember {
  id: string;
  name: string;
  email: string;
  initials: string;
  role: UserRole;                                    // admin | leader | member
  jobTitle?: string;                                 // free-text title ("Senior Engineer")
  departmentId?: string;
  departmentName?: string;
  status: "active" | "away" | "busy" | "offline";
  birthday?: string | null;
  checkedInToday?: boolean;
  isActive?: boolean;
  lastLoginAt?: string | null;
  lastCheckinAt?: string | null;
}
export interface Task {
  id: string;
  title: string;
  priority: "urgent" | "high" | "medium" | "low";
  status: "todo" | "in-progress" | "done";
  departmentId?: string | null;
  departmentName?: string;
  assigneeId?: string | null;
  assigneeName?: string;
  assigneeInitials?: string;
  dueDate?: string;
  sortOrder?: number;
}
export interface Goal {
  id: string;
  name: string;
  target: number;
  current: number;
  format: "number" | "currency" | "percent";
  color: string;
  sortOrder?: number;
}
export interface RevenueEntry {
  id: string;
  amount: number;
  departmentId?: string | null;
  departmentName?: string;
  description: string;
  month: string;
  year: number;
}
export interface ExpenseEntry {
  id: string;
  amount: number;
  departmentId?: string | null;
  departmentName?: string;
  description: string;
  month: string;
  year: number;
}
