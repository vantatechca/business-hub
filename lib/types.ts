// ── CORE ENTITIES ──────────────────────────────────────────────────────────

export interface Department {
  id: number;
  name: string;
  icon: string;
  color: string;
  head: string;
  health: number;       // 0–100
  memberCount: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface TeamMember {
  id: number;
  name: string;
  initials: string;
  role: string;
  departmentId: number;
  departmentName?: string;
  status: "active" | "away" | "busy" | "offline";
  birthday?: string;    // "YYYY-MM-DD"
  checkedInToday?: boolean;
  createdAt?: string;
}

export interface Task {
  id: number;
  title: string;
  priority: "urgent" | "high" | "medium" | "low";
  status: "todo" | "in-progress" | "done";
  departmentId?: number;
  departmentName?: string;
  assigneeId?: number;
  assigneeInitials?: string;
  dueDate?: string;     // "YYYY-MM-DD" or display string
  createdAt?: string;
  updatedAt?: string;
}

export interface Goal {
  id: number;
  name: string;
  target: number;
  current: number;
  format: "number" | "currency" | "percent";
  color: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface RevenueEntry {
  id: number;
  amount: number;
  departmentId?: number;
  departmentName?: string;
  description: string;
  month: string;        // "Jan", "Feb", ...
  year: number;
  createdAt?: string;
}

export interface ExpenseEntry {
  id: number;
  amount: number;
  departmentId?: number;
  departmentName?: string;
  description: string;
  month: string;
  year: number;
  createdAt?: string;
}

export interface CheckIn {
  id: number;
  memberId: number;
  memberName?: string;
  mood: string;
  moodEmoji: string;
  wins: string;
  blockers: string;
  date: string;         // "YYYY-MM-DD"
  createdAt?: string;
}

export interface Notification {
  id: number;
  type: "checkin" | "birthday" | "alert" | "task" | "system";
  message: string;
  read: boolean;
  href?: string;
  createdAt: string;
}

// ── AUTH ───────────────────────────────────────────────────────────────────

export interface UserProfile {
  id: number;
  name: string;
  email: string;
  role: "admin" | "manager" | "member";
  departmentId?: number;
}

// ── API RESPONSE SHAPES ────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  message?: string;
}

// ── DASHBOARD TYPES ────────────────────────────────────────────────────────

export interface KPI {
  label: string;
  value: number;
  previous: number;
  format: "number" | "currency" | "percent";
  color: string;
  spark: number[];
  invertTrend?: boolean; // true = lower is better (expenses)
}

export interface MonthlyMetric {
  month: string;
  revenue: number;
  expenses: number;
}
