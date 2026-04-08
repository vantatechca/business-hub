// In-memory seed — used as fallback when DATABASE_URL not configured.
// Once you run: node scripts/setup-db.js  — the app switches to real Neon DB.

export let departments = [
  { id:1, name:"Sites",            slug:"sites",            color:"#5b8ef8", icon:"🌐", priorityScore:95, sortOrder:1,  memberCount:8,  health:92 },
  { id:2, name:"Payments",         slug:"payments",         color:"#f87171", icon:"💳", priorityScore:92, sortOrder:2,  memberCount:4,  health:88 },
  { id:3, name:"Orders",           slug:"orders",           color:"#34d399", icon:"📦", priorityScore:90, sortOrder:3,  memberCount:6,  health:85 },
  { id:4, name:"GMC",              slug:"gmc",              color:"#fbbf24", icon:"🛒", priorityScore:85, sortOrder:4,  memberCount:6,  health:55 },
  { id:5, name:"Google Ads",       slug:"google-ads",       color:"#a78bfa", icon:"📣", priorityScore:82, sortOrder:5,  memberCount:6,  health:78 },
  { id:6, name:"Gmail",            slug:"gmail",            color:"#22d3ee", icon:"📧", priorityScore:75, sortOrder:6,  memberCount:1,  health:72 },
  { id:7, name:"GMB",              slug:"gmb",              color:"#84cc16", icon:"⭐", priorityScore:70, sortOrder:7,  memberCount:3,  health:68 },
  { id:8, name:"Blogs",            slug:"blogs",            color:"#fb923c", icon:"✍️", priorityScore:60, sortOrder:8,  memberCount:3,  health:80 },
  { id:9, name:"Chat Support",     slug:"chat-support",     color:"#e879f9", icon:"💬", priorityScore:55, sortOrder:9,  memberCount:5,  health:75 },
  { id:10,name:"Restock",          slug:"restock",          color:"#6366f1", icon:"🏭", priorityScore:50, sortOrder:10, memberCount:2,  health:60 },
  { id:11,name:"Revenue",          slug:"revenue",          color:"#10b981", icon:"💰", priorityScore:45, sortOrder:11, memberCount:1,  health:82 },
  { id:12,name:"Web Dev",          slug:"web-dev",          color:"#0ea5e9", icon:"🖥️", priorityScore:40, sortOrder:12, memberCount:2,  health:70 },
  { id:13,name:"Video",            slug:"video",            color:"#f59e0b", icon:"🎬", priorityScore:30, sortOrder:13, memberCount:1,  health:65 },
  { id:14,name:"Game Dev",         slug:"game-dev",         color:"#8b5cf6", icon:"🎮", priorityScore:20, sortOrder:14, memberCount:1,  health:50 },
];

export let teamMembers = [
  { id:1,  initials:"AN", name:"Andrei",   role:"admin",  departmentId:1, departmentName:"Sites",        status:"active", birthday:"", checkedInToday:true  },
  { id:2,  initials:"MT", name:"Mathieu",  role:"leader", departmentId:2, departmentName:"Payments",     status:"active", birthday:"", checkedInToday:true  },
  { id:3,  initials:"FN", name:"Fernanda", role:"leader", departmentId:1, departmentName:"Sites",        status:"active", birthday:"", checkedInToday:false },
  { id:4,  initials:"BR", name:"Brisson",  role:"leader", departmentId:11,departmentName:"Revenue",      status:"active", birthday:"", checkedInToday:false },
  { id:5,  initials:"GA", name:"Gauthier", role:"leader", departmentId:4, departmentName:"GMC",          status:"active", birthday:"", checkedInToday:true  },
  { id:6,  initials:"DN", name:"Dana",     role:"leader", departmentId:5, departmentName:"Google Ads",   status:"active", birthday:"", checkedInToday:true  },
  { id:7,  initials:"RE", name:"Renold",   role:"member", departmentId:3, departmentName:"Orders",       status:"active", birthday:"", checkedInToday:true  },
  { id:8,  initials:"TR", name:"Tristan",  role:"member", departmentId:3, departmentName:"Orders",       status:"active", birthday:"", checkedInToday:false },
  { id:9,  initials:"LA", name:"Launce",   role:"member", departmentId:3, departmentName:"Orders",       status:"active", birthday:"", checkedInToday:true  },
  { id:10, initials:"JO", name:"Joshua",   role:"member", departmentId:4, departmentName:"GMC",          status:"active", birthday:"", checkedInToday:false },
  { id:11, initials:"JX", name:"Jaxyl",    role:"member", departmentId:3, departmentName:"Orders",       status:"busy",   birthday:"", checkedInToday:false },
  { id:12, initials:"JR", name:"Jerome",   role:"member", departmentId:6, departmentName:"Gmail",        status:"active", birthday:"", checkedInToday:true  },
  { id:13, initials:"MK", name:"Mark",     role:"member", departmentId:7, departmentName:"GMB",          status:"active", birthday:"", checkedInToday:true  },
  { id:14, initials:"IL", name:"Ilce",     role:"member", departmentId:7, departmentName:"GMB",          status:"active", birthday:"", checkedInToday:false },
  { id:15, initials:"OH", name:"Ohna",     role:"member", departmentId:7, departmentName:"GMB",          status:"away",   birthday:"", checkedInToday:false },
  { id:16, initials:"AG", name:"Angelito", role:"member", departmentId:8, departmentName:"Blogs",        status:"active", birthday:"", checkedInToday:true  },
  { id:17, initials:"NT", name:"Nathan",   role:"member", departmentId:8, departmentName:"Blogs",        status:"active", birthday:"", checkedInToday:false },
  { id:18, initials:"VL", name:"Valerie",  role:"member", departmentId:9, departmentName:"Chat Support", status:"active", birthday:"", checkedInToday:true  },
  { id:19, initials:"ER", name:"Eric",     role:"member", departmentId:9, departmentName:"Chat Support", status:"active", birthday:"", checkedInToday:true  },
  { id:20, initials:"MI", name:"Mik",      role:"member", departmentId:9, departmentName:"Chat Support", status:"busy",   birthday:"", checkedInToday:false },
  { id:21, initials:"NA", name:"Nate",     role:"member", departmentId:9, departmentName:"Chat Support", status:"active", birthday:"", checkedInToday:false },
  { id:22, initials:"CL", name:"Claire",   role:"member", departmentId:9, departmentName:"Chat Support", status:"active", birthday:"", checkedInToday:true  },
  { id:23, initials:"BA", name:"Barcha",   role:"member", departmentId:4, departmentName:"GMC",          status:"active", birthday:"", checkedInToday:false },
  { id:24, initials:"JD", name:"Jordan",   role:"member", departmentId:4, departmentName:"GMC",          status:"active", birthday:"", checkedInToday:true  },
];

export let tasks = [
  { id:1, title:"Q4 GMC account audit",         priority:"urgent", status:"in-progress", departmentId:4, departmentName:"GMC",          assigneeInitials:"BA", dueDate:"Today"    },
  { id:2, title:"Gmail warmup batch #12",        priority:"high",   status:"todo",        departmentId:6, departmentName:"Gmail",         assigneeInitials:"JR", dueDate:"Tomorrow" },
  { id:3, title:"Stripe account setup",          priority:"urgent", status:"todo",        departmentId:2, departmentName:"Payments",      assigneeInitials:"MT", dueDate:"Today"    },
  { id:4, title:"Blog posts for Dec batch",      priority:"medium", status:"in-progress", departmentId:8, departmentName:"Blogs",         assigneeInitials:"AG", dueDate:"Dec 20"   },
  { id:5, title:"Chat response time reduction",  priority:"medium", status:"todo",        departmentId:9, departmentName:"Chat Support",  assigneeInitials:"VL", dueDate:"Dec 15"   },
  { id:6, title:"Google Ads campaign review",    priority:"high",   status:"in-progress", departmentId:5, departmentName:"Google Ads",    assigneeInitials:"DN", dueDate:"Dec 18"   },
  { id:7, title:"Shopify orders reconciliation", priority:"high",   status:"done",        departmentId:3, departmentName:"Orders",        assigneeInitials:"RE", dueDate:"Dec 10"   },
  { id:8, title:"GMB review monitoring setup",   priority:"low",    status:"todo",        departmentId:7, departmentName:"GMB",           assigneeInitials:"MK", dueDate:"Dec 22"   },
];

export let goals = [
  { id:1, name:"Total Gmail Accounts",     target:4000,    current:250,     format:"number"   as const, color:"#22d3ee" },
  { id:2, name:"GMC Approved Total",       target:100,     current:1,       format:"number"   as const, color:"#fbbf24" },
  { id:3, name:"Sites on Chat Router",     target:600,     current:156,     format:"number"   as const, color:"#5b8ef8" },
  { id:4, name:"Daily Shopify Orders",     target:50,      current:0,       format:"number"   as const, color:"#34d399" },
  { id:5, name:"Monthly Net Revenue (CAD)",target:50000,   current:28000,   format:"currency" as const, color:"#10b981" },
  { id:6, name:"Check-In Completion Rate", target:100,     current:Math.round(teamMembers.filter(m=>m.checkedInToday).length/teamMembers.length*100), format:"percent" as const, color:"#a78bfa" },
];

export let revenueEntries = [
  { id:1, amount:210000, departmentId:1, departmentName:"Sites", description:"Q3 enterprise deals",   month:"Jul", year:2024 },
  { id:2, amount:235000, departmentId:1, departmentName:"Sites", description:"August contracts",       month:"Aug", year:2024 },
  { id:3, amount:267000, departmentId:1, departmentName:"Sites", description:"October expansion",      month:"Oct", year:2024 },
  { id:4, amount:289000, departmentId:1, departmentName:"Sites", description:"November new clients",   month:"Nov", year:2024 },
  { id:5, amount:312000, departmentId:1, departmentName:"Sites", description:"December record close",  month:"Dec", year:2024 },
];

export let expenseEntries = [
  { id:1, amount:148000, departmentId:10, departmentName:"Restock",  description:"Infrastructure",    month:"Jul", year:2024 },
  { id:2, amount:156000, departmentId:12, departmentName:"Web Dev",  description:"Cloud & tooling",   month:"Aug", year:2024 },
  { id:3, amount:158000, departmentId:10, departmentName:"Restock",  description:"Q4 overhead",       month:"Oct", year:2024 },
  { id:4, amount:165000, departmentId:2,  departmentName:"Payments", description:"Payroll expansion",  month:"Nov", year:2024 },
  { id:5, amount:149000, departmentId:11, departmentName:"Revenue",  description:"Year-end costs",     month:"Dec", year:2024 },
];

export interface SeedNotification {
  id: number;
  type: string;
  message: string;
  time: string;
  read: boolean;
  createdAt: string;
}

export let notifications: SeedNotification[] = [
  { id:1, type:"checkin", message:"10 members haven't checked in today",   time:"2h ago", read:false, createdAt: new Date(Date.now()-7200000).toISOString() },
  { id:2, type:"alert",   message:"GMC banned count at 85 — needs attention", time:"3h ago", read:false, createdAt: new Date(Date.now()-10800000).toISOString() },
  { id:3, type:"system",  message:"Gmail accounts: 250/4000 target (6.3%)",   time:"5h ago", read:true,  createdAt: new Date(Date.now()-18000000).toISOString() },
  { id:4, type:"checkin", message:"Tristan hasn't submitted today's check-in", time:"1h ago", read:false, createdAt: new Date(Date.now()-3600000).toISOString() },
  { id:5, type:"system",  message:"Phase 1 migration ready — run setup-db.js", time:"now",    read:false, createdAt: new Date().toISOString() },
];

let _id = 1000;
export const nextId = () => ++_id;
