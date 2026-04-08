// In-memory seed data used as fallback when DATABASE_URL is not configured.
// The app stores all mutations in module-level arrays so state persists
// within a single server process (dev mode). In production, wire to real DB.

import type { Department, TeamMember, Task, Goal, RevenueEntry, ExpenseEntry, Notification } from "./types";

const today = new Date().toISOString().slice(0, 10);
const todayMMDD = today.slice(5);

export let departments: Department[] = [
  { id:1, name:"Sales",            icon:"💼", color:"#5b8ef8", head:"Maria Santos",  health:92, memberCount:8 },
  { id:2, name:"Engineering",      icon:"⚙️",  color:"#34d399", head:"Alex Chen",     health:95, memberCount:12 },
  { id:3, name:"Marketing",        icon:"📣", color:"#a78bfa", head:"James Reyes",   health:78, memberCount:5 },
  { id:4, name:"Finance",          icon:"📊", color:"#fbbf24", head:"Diana Cruz",    health:88, memberCount:4 },
  { id:5, name:"HR",               icon:"👥", color:"#f87171", head:"Carlos Lim",    health:71, memberCount:3 },
  { id:6, name:"Operations",       icon:"🔧", color:"#22d3ee", head:"Ana Reyes",     health:83, memberCount:6 },
  { id:7, name:"Product",          icon:"🎯", color:"#84cc16", head:"Kim Park",      health:90, memberCount:7 },
  { id:8, name:"Customer Success", icon:"⭐", color:"#fb923c", head:"Leo Tan",       health:76, memberCount:5 },
];

export let teamMembers: TeamMember[] = [
  { id:1,  name:"Maria Santos",  initials:"MS", role:"Sales Director",     departmentId:1, departmentName:"Sales",            status:"active",  birthday:`1985-${todayMMDD}`, checkedInToday:true },
  { id:2,  name:"Alex Chen",     initials:"AC", role:"Lead Engineer",      departmentId:2, departmentName:"Engineering",      status:"active",  birthday:"1990-06-15",          checkedInToday:true },
  { id:3,  name:"Diana Cruz",    initials:"DC", role:"CFO",                departmentId:4, departmentName:"Finance",          status:"active",  birthday:"1982-11-20",          checkedInToday:false },
  { id:4,  name:"James Reyes",   initials:"JR", role:"Marketing Manager",  departmentId:3, departmentName:"Marketing",        status:"active",  birthday:"1991-03-08",          checkedInToday:true },
  { id:5,  name:"Carlos Lim",    initials:"CL", role:"HR Manager",         departmentId:5, departmentName:"HR",               status:"away",    birthday:"1988-09-25",          checkedInToday:false },
  { id:6,  name:"Ana Reyes",     initials:"AR", role:"Operations Lead",    departmentId:6, departmentName:"Operations",       status:"active",  birthday:"1993-07-14",          checkedInToday:true },
  { id:7,  name:"Kim Park",      initials:"KP", role:"Product Manager",    departmentId:7, departmentName:"Product",          status:"active",  birthday:"1989-12-03",          checkedInToday:true },
  { id:8,  name:"Leo Tan",       initials:"LT", role:"CS Manager",         departmentId:8, departmentName:"Customer Success", status:"busy",    birthday:"1994-02-18",          checkedInToday:false },
  { id:9,  name:"Sarah Wong",    initials:"SW", role:"Senior Engineer",    departmentId:2, departmentName:"Engineering",      status:"active",  birthday:"1992-05-30",          checkedInToday:true },
  { id:10, name:"Michael Torres",initials:"MT", role:"Sales Rep",          departmentId:1, departmentName:"Sales",            status:"active",  birthday:"1995-08-11",          checkedInToday:true },
];

export let tasks: Task[] = [
  { id:1, title:"Q4 financial report",         priority:"urgent", status:"in-progress", departmentId:4, departmentName:"Finance",          assigneeId:3, assigneeInitials:"DC", dueDate:"Today" },
  { id:2, title:"New hire onboarding flow",    priority:"medium", status:"todo",        departmentId:5, departmentName:"HR",               assigneeId:5, assigneeInitials:"CL", dueDate:"Tomorrow" },
  { id:3, title:"Website redesign v2",         priority:"high",   status:"in-progress", departmentId:3, departmentName:"Marketing",        assigneeId:4, assigneeInitials:"JR", dueDate:"Dec 15" },
  { id:4, title:"API rate limiting fix",       priority:"urgent", status:"todo",        departmentId:2, departmentName:"Engineering",      assigneeId:2, assigneeInitials:"AC", dueDate:"Today" },
  { id:5, title:"Customer feedback survey",    priority:"low",    status:"done",        departmentId:8, departmentName:"Customer Success", assigneeId:8, assigneeInitials:"LT", dueDate:"Dec 20" },
  { id:6, title:"Q4 OKR review meeting",       priority:"medium", status:"todo",        departmentId:6, departmentName:"Operations",       assigneeId:6, assigneeInitials:"AR", dueDate:"Dec 12" },
  { id:7, title:"Sales pipeline automation",   priority:"high",   status:"in-progress", departmentId:1, departmentName:"Sales",            assigneeId:1, assigneeInitials:"MS", dueDate:"Dec 18" },
  { id:8, title:"Product roadmap 2025",        priority:"high",   status:"todo",        departmentId:7, departmentName:"Product",          assigneeId:7, assigneeInitials:"KP", dueDate:"Dec 30" },
];

export let goals: Goal[] = [
  { id:1, name:"Annual Revenue",    target:3500000, current:2847500, format:"currency", color:"#34d399" },
  { id:2, name:"New Clients",       target:100,     current:67,      format:"number",   color:"#5b8ef8" },
  { id:3, name:"Team Headcount",    target:60,      current:10,      format:"number",   color:"#a78bfa" },
  { id:4, name:"Customer NPS",      target:80,      current:72,      format:"number",   color:"#fbbf24" },
  { id:5, name:"Expense Reduction", target:20,      current:14,      format:"percent",  color:"#f87171" },
  { id:6, name:"Product Launches",  target:6,       current:4,       format:"number",   color:"#22d3ee" },
];

export let revenueEntries: RevenueEntry[] = [
  { id:1, amount:210000, departmentId:1, departmentName:"Sales", description:"Q3 enterprise deals",   month:"Jul", year:2024 },
  { id:2, amount:235000, departmentId:1, departmentName:"Sales", description:"August contracts",      month:"Aug", year:2024 },
  { id:3, amount:267000, departmentId:1, departmentName:"Sales", description:"October expansion",     month:"Oct", year:2024 },
  { id:4, amount:289000, departmentId:1, departmentName:"Sales", description:"November new clients",  month:"Nov", year:2024 },
  { id:5, amount:312000, departmentId:1, departmentName:"Sales", description:"December record close", month:"Dec", year:2024 },
];

export let expenseEntries: ExpenseEntry[] = [
  { id:1, amount:148000, departmentId:6, departmentName:"Operations",  description:"Infrastructure & ops",  month:"Jul", year:2024 },
  { id:2, amount:156000, departmentId:2, departmentName:"Engineering", description:"Cloud & tooling",        month:"Aug", year:2024 },
  { id:3, amount:158000, departmentId:6, departmentName:"Operations",  description:"Q4 overhead",            month:"Oct", year:2024 },
  { id:4, amount:165000, departmentId:5, departmentName:"HR",          description:"Payroll expansion",      month:"Nov", year:2024 },
  { id:5, amount:149000, departmentId:4, departmentName:"Finance",     description:"Year-end costs",         month:"Dec", year:2024 },
];

export let notifications: Notification[] = [
  { id:1, type:"checkin",  message:"3 members haven't checked in today",     read:false, createdAt: new Date(Date.now()-7200000).toISOString() },
  { id:2, type:"birthday", message:"🎂 It's Maria Santos' birthday today!",  read:false, createdAt: new Date(Date.now()-28800000).toISOString() },
  { id:3, type:"alert",    message:"HR department health dropped below 75%", read:true,  createdAt: new Date(Date.now()-86400000).toISOString() },
  { id:4, type:"task",     message:"5 tasks are overdue today",              read:false, createdAt: new Date(Date.now()-10800000).toISOString() },
  { id:5, type:"system",   message:"December check-in streak: 18 days 🔥",  read:true,  createdAt: new Date(Date.now()-86400000).toISOString() },
];

// ── ID COUNTER ─────────────────────────────────────────────────────────────
let _id = 1000;
export const nextId = () => ++_id;
