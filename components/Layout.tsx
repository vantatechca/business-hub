"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useTheme } from "next-themes";
import { signOut, useSession } from "next-auth/react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { LayoutDashboard, TrendingUp, Network, Users, ListChecks, CalendarCheck, DollarSign, CreditCard, Target, LogOut, Building2, Bell, Plus, Check, BarChart2, Shield, Workflow, Cake, History, X, Send, AlertTriangle, LifeBuoy } from "lucide-react";
import { Avatar } from "./ui/shared";
import { useCurrency } from "@/lib/CurrencyContext";
import { CURRENCIES } from "@/lib/currency";
import SendAlertModal from "./SendAlertModal";
import ReportIssueModal from "./ReportIssueModal";
import AiAssistant from "./AiAssistant";
import CheckInModal from "./CheckInModal";
import { hasCheckedInToday } from "./CheckInGate";

// `mgrOnly: true` hides the item from lead and member roles. The middleware
// also blocks the matching route paths so a manual URL doesn't sneak in.
const NAV = [
  { s:"MAIN", items:[
    {id:"dashboard",l:"Dashboard",h:"/dashboard",I:LayoutDashboard},
    {id:"analytics",l:"Analytics",h:"/analytics",I:TrendingUp, mgrOnly:true},
  ]},
  { s:"OPERATIONS", items:[
    {id:"departments",l:"Departments",h:"/departments",I:Network},
    {id:"metrics",l:"Assets",h:"/metrics",I:BarChart2},
    {id:"assignments",l:"Assignments",h:"/assignments",I:Workflow},
    {id:"team",l:"Team",h:"/team",I:Users},
    {id:"tasks",l:"Tasks",h:"/tasks",I:ListChecks},
    {id:"checkin",l:"Check-Ins",h:"/checkin",I:CalendarCheck},
    {id:"birthdays",l:"Birthdays",h:"/birthdays",I:Cake, mgrOnly:true},
  ]},
  { s:"FINANCE", items:[
    {id:"revenue",l:"Revenue",h:"/revenue",I:DollarSign, mgrOnly:true},
    {id:"expenses",l:"Expenses",h:"/expenses",I:CreditCard, mgrOnly:true},
    {id:"goals",l:"Goals",h:"/goals",I:Target, mgrOnly:true},
    {id:"investors",l:"Investors",h:"/investors",I:Users, mgrOnly:true},
  ]},
  { s:"ADMIN", items:[
    {id:"users",l:"Users",h:"/users",I:Shield},
  ]},
  // SYSTEM is super_admin only
  { s:"SYSTEM", items:[
    {id:"audit",l:"Audit Log",h:"/audit",I:History},
  ]},
];

interface Notif {
  id: number | string;
  type: string;
  message: string;
  body?: string;
  read: boolean;
  createdAt: string;
  actionUrl?: string;
  senderName?: string | null;
  severity?: "info" | "warning" | "critical";
}

export default function AppLayout({ children, title, onNew, newLabel="New" }: { children:React.ReactNode; title:string; onNew?:()=>void; newLabel?:string; }) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { data: session } = useSession();
  const { currency: globalCurrency, setCurrency: setGlobalCurrency } = useCurrency();
  const [col, setCol]       = useState(false);
  const [showN, setShowN]   = useState(false);
  const [showCur, setShowCur] = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [mounted, setMounted] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [showLogoutCheckin, setShowLogoutCheckin] = useState(false);
  const notifPanelRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setMounted(true); }, []);

  const name  = session?.user?.name ?? "Admin";
  const role  = (session?.user as { role?: string })?.role ?? "member";
  const layoutUserId = (session?.user as { id?: string })?.id;
  const requiresCheckin = (session?.user as { requiresCheckin?: boolean })?.requiresCheckin;
  const ini   = name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
  const unread = notifs.filter(n => !n.read).length;
  const isDark = mounted && theme === "dark";

  const handleSignOut = () => {
    const exemptRole = role === "super_admin" || role === "admin";
    if (!exemptRole && requiresCheckin && !hasCheckedInToday(layoutUserId)) {
      setShowLogoutCheckin(true);
    } else {
      signOut({ callbackUrl: "/login" });
    }
  };
  // Anyone above member can broadcast alerts.
  const canSendAlerts = role === "lead" || role === "manager" || role === "leader" || role === "admin" || role === "super_admin";

  // Fetch notifications immediately on mount, then poll every 60 seconds
  // while the tab is focused. We pause polling on hidden tabs to be nice
  // to the DB.
  const fetchNotifs = useCallback(() => {
    fetch("/api/notifications")
      .then(r => r.json())
      .then(d => setNotifs(d.data ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchNotifs();
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(() => {
        if (typeof document !== "undefined" && document.visibilityState === "visible") {
          fetchNotifs();
        }
      }, 60_000);
    };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    start();
    const onVis = () => { if (document.visibilityState === "visible") fetchNotifs(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { stop(); document.removeEventListener("visibilitychange", onVis); };
  }, [fetchNotifs]);

  // Click-outside-to-close for the notification panel.
  useEffect(() => {
    if (!showN) return;
    const onDown = (e: MouseEvent) => {
      if (notifPanelRef.current && !notifPanelRef.current.contains(e.target as Node)) {
        setShowN(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showN]);

  const markRead = (id: number | string) => {
    fetch(`/api/notifications/${id}`, { method:"PATCH" }).catch(() => {});
    setNotifs(p => p.map(n => n.id === id ? {...n,read:true} : n));
  };
  const markAll = () => {
    fetch("/api/notifications", { method:"PATCH" }).catch(() => {});
    setNotifs(p => p.map(n => ({...n,read:true})));
  };
  const dismiss = (id: number | string) => {
    fetch(`/api/notifications/${id}`, { method:"DELETE" }).catch(() => {});
    setNotifs(p => p.filter(n => n.id !== id));
  };

  // Severity → color for the row + bell. critical wins over warning wins
  // over info.
  const severityColor = (s?: string) => {
    if (s === "critical") return "var(--danger)";
    if (s === "warning")  return "var(--warning)";
    return "var(--accent)";
  };
  const hasCritical = notifs.some(n => !n.read && n.severity === "critical");
  const bellColor = unread === 0 ? "var(--text-secondary)" : (hasCritical ? "var(--danger)" : "var(--warning)");

  const ROLE_COLOR: Record<string,string> = {
    super_admin: "var(--danger)",
    admin: "var(--violet)",
    manager: "var(--warning)",
    leader: "var(--warning)",
    lead: "var(--accent)",
    member: "var(--accent)",
  };

  return (
    <Tooltip.Provider delayDuration={300}>
      <div style={{display:"flex",height:"100vh",overflow:"hidden",background:"var(--bg-base)"}}>

        <aside style={{width:col?"var(--sidebar-collapsed)":"var(--sidebar-width)",background:"var(--bg-sidebar)",borderRight:"1px solid var(--border-sidebar)",display:"flex",flexDirection:"column",transition:"width .2s ease",flexShrink:0,overflow:"hidden"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,padding:"13px 12px",borderBottom:"1px solid var(--border-sidebar)",flexShrink:0,minHeight:56}}>
            <div style={{width:32,height:32,borderRadius:9,flexShrink:0,background:"linear-gradient(135deg,#5b8ef8,#6366f1)",display:"flex",alignItems:"center",justifyContent:"center"}}><Building2 size={15} color="#fff"/></div>
            {!col&&<div><div style={{fontSize:13,fontWeight:800,color:"var(--text-primary)",whiteSpace:"nowrap",letterSpacing:"-0.02em"}}>Business Hub</div><div style={{fontSize:10,color:"var(--text-secondary)"}}>V2 · Command Center</div></div>}
          </div>

          <nav style={{flex:1,overflowY:"auto",overflowX:"hidden",padding:8}}>
            {NAV.map(sect=>{
              // Hide ADMIN section for non-admins (admin + super_admin see it)
              if (sect.s === "ADMIN" && role !== "admin" && role !== "super_admin") return null;
              // SYSTEM (audit log) is super_admin only
              if (sect.s === "SYSTEM" && role !== "super_admin") return null;
              // Items flagged mgrOnly are hidden from lead and member roles.
              // The whole section is hidden if every item in it is mgrOnly
              // and the viewer can't see it (otherwise we'd render an empty
              // section header with nothing under it — looks broken).
              const isMgrOrUp = role === "manager" || role === "leader" || role === "admin" || role === "super_admin";
              const visibleItems = sect.items.filter(it => !(it as { mgrOnly?: boolean }).mgrOnly || isMgrOrUp);
              if (visibleItems.length === 0) return null;
              return (
                <div key={sect.s} style={{marginBottom:2}}>
                  {!col&&<div style={{fontSize:9,fontWeight:800,color:"var(--text-muted)",padding:"10px 8px 4px",letterSpacing:".12em"}}>{sect.s}</div>}
                  {visibleItems.map(({id,l,h,I})=>{
                    const active=pathname===h||pathname.startsWith(h+"/");
                    const btn=<Link key={id} href={h} aria-label={l} aria-current={active?"page":undefined} className={`nav-item ${active?"active":""} ${col?"justify-center":""}`} style={{marginBottom:2}}><I size={15} aria-hidden/>{!col&&<span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis"}}>{l}</span>}</Link>;
                    if(col) return <Tooltip.Root key={id}><Tooltip.Trigger asChild>{btn}</Tooltip.Trigger><Tooltip.Portal><Tooltip.Content side="right" sideOffset={8} style={{padding:"6px 12px",borderRadius:"var(--radius-md)",background:"var(--bg-card)",border:"1px solid var(--border-card)",fontSize:12,fontWeight:600,color:"var(--text-primary)",boxShadow:"var(--shadow-dropdown)",zIndex:600}}>{l}<Tooltip.Arrow style={{fill:"var(--border-card)"}}/></Tooltip.Content></Tooltip.Portal></Tooltip.Root>;
                    return btn;
                  })}
                  {!col&&<div style={{height:1,background:"var(--border-divider)",margin:"6px 0"}}/>}
                </div>
              );
            })}
          </nav>

          <div style={{padding:8,borderTop:"1px solid var(--border-sidebar)",flexShrink:0}}>
            {/* Issues lives here (right above the user card) instead of in
                the OPERATIONS nav so it's always within thumb-reach for
                reporting / triaging. */}
            <Link
              href="/issues"
              aria-label="Issues"
              className={`nav-item ${pathname === "/issues" || pathname.startsWith("/issues/") ? "active" : ""} ${col?"justify-center":""}`}
              style={{fontSize:12,marginBottom:2}}
            >
              <LifeBuoy size={14}/>{!col && " Issues"}
            </Link>
            {/* Clicking the user card opens the user's own profile page where
                they can view + edit all their details. The whole row is the
                hit target so it's discoverable. */}
            <Link
              href="/profile"
              aria-label="Open my profile"
              style={{display:"flex",alignItems:"center",gap:8,padding:col?"6px 0":"6px 10px",marginBottom:2,textDecoration:"none",borderRadius:"var(--radius-md)",transition:"background .15s ease"}}
              className="nav-item"
            >
              <Avatar s={ini} size={28}/>
              {!col&&<div style={{minWidth:0,flex:1}}>
                <div style={{fontSize:12,fontWeight:700,color:"var(--text-primary)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</div>
                <div style={{fontSize:10,color:ROLE_COLOR[role] ?? "var(--text-secondary)",fontWeight:600,textTransform:"capitalize"}}>{role === "super_admin" ? "Super Admin" : role}</div>
              </div>}
            </Link>
            <button onClick={handleSignOut} className={`nav-item ${col?"justify-center":""}`} style={{fontSize:12,marginTop:2}}><LogOut size={14}/>{!col&&" Sign out"}</button>
            <button onClick={()=>setCol(v=>!v)} className={`nav-item ${col?"justify-center":""}`} style={{fontSize:11,marginTop:2,color:"var(--text-muted)"}}>
              <span style={{fontSize:13}}>{col?"→":"←"}</span>{!col&&<span> Collapse</span>}
            </button>
          </div>
        </aside>

        <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>
          <header style={{height:"var(--topbar-height)",background:"var(--bg-sidebar)",borderBottom:"1px solid var(--border-sidebar)",display:"flex",alignItems:"center",padding:"0 18px",gap:10,flexShrink:0}}>
            <h1 style={{flex:1,fontSize:15,fontWeight:800,color:"var(--text-primary)",margin:0,letterSpacing:"-0.02em",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{title}</h1>
            <div style={{position:"relative"}}>
              <button
                onClick={() => setShowCur(v => !v)}
                aria-label="Switch currency"
                title="Global display currency"
                style={{
                  height: 34, padding: "0 10px", borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-card)", background: "transparent",
                  display: "flex", alignItems: "center", gap: 4, cursor: "pointer",
                  color: "var(--text-primary)", fontSize: 11, fontWeight: 700,
                }}
              >
                <DollarSign size={13} style={{ color: "var(--text-muted)" }} />
                {globalCurrency}
              </button>
              {showCur && (
                <div
                  style={{
                    position: "absolute", right: 0, top: "calc(100% + 8px)", width: 200,
                    background: "var(--bg-card)", border: "1px solid var(--border-card)",
                    borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-dropdown)",
                    zIndex: 300, overflow: "hidden",
                  }}
                  className="animate-slide-up"
                >
                  <div style={{ padding: "11px 14px", borderBottom: "1px solid var(--border-divider)", fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                    Global currency
                  </div>
                  <div style={{ padding: "8px 14px", fontSize: 10, color: "var(--text-muted)", lineHeight: 1.5 }}>
                    Applied across the whole site. Revenue and Expenses pages can also override per-page.
                  </div>
                  {CURRENCIES.map(c => (
                    <button
                      key={c}
                      onClick={() => { setGlobalCurrency(c); setShowCur(false); }}
                      style={{
                        width: "100%", padding: "11px 14px",
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        background: "transparent", border: "none",
                        borderTop: "1px solid var(--border-divider)",
                        cursor: "pointer",
                        fontSize: 12, fontWeight: 600,
                        color: globalCurrency === c ? "var(--accent)" : "var(--text-primary)",
                      }}
                    >
                      <span>{c}</span>
                      {globalCurrency === c && <Check size={14} color="var(--accent)" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div ref={notifPanelRef} style={{position:"relative"}}>
              <button
                onClick={()=>setShowN(v=>!v)}
                aria-label="Notifications"
                className={unread > 0 ? "bell-active" : ""}
                style={{
                  width:34, height:34, borderRadius:"var(--radius-md)",
                  border:"1px solid var(--border-card)",
                  background:"transparent",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  cursor:"pointer",
                  color: bellColor,
                  position:"relative",
                  transition: "color .2s ease",
                }}
              >
                <Bell size={15}/>
                {unread > 0 && (
                  <span style={{
                    position: "absolute",
                    top: -4, right: -4,
                    minWidth: 16, height: 16,
                    borderRadius: 8,
                    background: hasCritical ? "var(--danger)" : "var(--warning)",
                    color: "#fff",
                    fontSize: 9,
                    fontWeight: 800,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "0 4px",
                    border: "2px solid var(--bg-sidebar)",
                  }}>{unread > 99 ? "99+" : unread}</span>
                )}
              </button>
              {showN&&(
                <div style={{position:"absolute",right:0,top:"calc(100% + 8px)",width:340,background:"var(--bg-card)",border:"1px solid var(--border-card)",borderRadius:"var(--radius-xl)",boxShadow:"var(--shadow-dropdown)",zIndex:300}} className="animate-slide-up">
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 14px",borderBottom:"1px solid var(--border-divider)",gap:6}}>
                    <span style={{fontSize:13,fontWeight:700,color:"var(--text-primary)",flex:1}}>Notifications{unread>0&&` (${unread})`}</span>
                    {unread>0&&<button onClick={markAll} style={{fontSize:11,color:"var(--accent)",background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:4}}><Check size={11}/>Mark all read</button>}
                    <button onClick={() => setShowN(false)} aria-label="Close notifications" style={{background:"transparent",border:"none",color:"var(--text-secondary)",cursor:"pointer",display:"flex",padding:2}}><X size={14}/></button>
                  </div>
                  {/* Action row — Send Alert (admins/managers/leads), Report Issue (everyone) */}
                  <div style={{display:"flex",gap:6,padding:"9px 14px",borderBottom:"1px solid var(--border-divider)"}}>
                    {canSendAlerts && (
                      <button
                        onClick={() => { setShowAlertModal(true); setShowN(false); }}
                        style={{flex:1,padding:"7px 10px",borderRadius:7,background:"var(--accent-bg)",color:"var(--accent)",border:"1px solid var(--accent)33",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:5,justifyContent:"center"}}
                      >
                        <Send size={11}/>Send Alert
                      </button>
                    )}
                    <button
                      onClick={() => { setShowIssueModal(true); setShowN(false); }}
                      style={{flex:1,padding:"7px 10px",borderRadius:7,background:"var(--warning-bg)",color:"var(--warning)",border:"1px solid var(--warning)33",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:5,justifyContent:"center"}}
                    >
                      <AlertTriangle size={11}/>Report Issue
                    </button>
                  </div>
                  <div style={{maxHeight:380,overflowY:"auto"}}>
                    {notifs.length===0?<div style={{padding:"28px 0",textAlign:"center",fontSize:13,color:"var(--text-secondary)"}}>All caught up!</div>:
                      notifs.map(n=>{
                        const sevColor = severityColor(n.severity);
                        return (
                        <div key={n.id} role="button" style={{padding:"10px 14px",borderBottom:"1px solid var(--border-divider)",background:n.read?"transparent":"var(--bg-card-hover)",display:"flex",gap:9,alignItems:"flex-start",position:"relative"}}>
                          <div style={{width:7,height:7,borderRadius:"50%",marginTop:6,flexShrink:0,background:n.read?"var(--text-muted)":sevColor}}/>
                          <div style={{flex:1,minWidth:0,cursor:"pointer"}} onClick={()=>{markRead(n.id); if(n.actionUrl){window.location.href=n.actionUrl;}}}>
                            {n.type === "alert" && (
                              <div style={{fontSize:9,fontWeight:800,letterSpacing:".06em",textTransform:"uppercase",color:sevColor,marginBottom:3}}>
                                ALERT{n.senderName ? ` · from ${n.senderName}` : ""}
                              </div>
                            )}
                            {n.type === "issue_update" && (
                              <div style={{fontSize:9,fontWeight:800,letterSpacing:".06em",textTransform:"uppercase",color:"var(--success)",marginBottom:3}}>
                                ISSUE UPDATE
                              </div>
                            )}
                            <div style={{fontSize:12,color:"var(--text-primary)",lineHeight:1.4,fontWeight:n.read?500:700}}>{n.message}</div>
                            {n.body && <div style={{fontSize:11,color:"var(--text-secondary)",marginTop:3,lineHeight:1.4,whiteSpace:"pre-wrap"}}>{n.body}</div>}
                            <div style={{fontSize:10,color:"var(--text-muted)",marginTop:3}}>{new Date(n.createdAt).toLocaleString(undefined,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}</div>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); dismiss(n.id); }}
                            aria-label="Dismiss"
                            style={{background:"transparent",border:"none",color:"var(--text-muted)",cursor:"pointer",display:"flex",padding:2,marginTop:2}}
                          >
                            <X size={12}/>
                          </button>
                        </div>
                      );})
                    }
                  </div>
                </div>
              )}
            </div>
            {/* Dark mode toggle moved here from the sidebar — sits to the
                right of the notification icon. mounted is checked to avoid
                a hydration mismatch on the icon (next-themes resolves the
                actual theme on the client). */}
            <button
              onClick={()=>setTheme(isDark?"light":"dark")}
              aria-label="Toggle dark mode"
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
              style={{
                width:34,height:34,borderRadius:"var(--radius-md)",
                border:"1px solid var(--border-card)",background:"transparent",
                display:"flex",alignItems:"center",justifyContent:"center",
                cursor:"pointer",color:"var(--text-secondary)",fontSize:14,
              }}
            >
              {mounted ? (isDark ? "☀" : "🌙") : "🌙"}
            </button>
            {onNew&&<button onClick={onNew} style={{display:"flex",alignItems:"center",gap:6,background:"var(--accent)",color:"#fff",border:"none",borderRadius:"var(--radius-md)",padding:"7px 13px",fontSize:12,fontWeight:700,cursor:"pointer"}}><Plus size={13}/>{newLabel}</button>}
          </header>
          <main style={{flex:1,overflowY:"auto",padding:"16px 18px"}} className="animate-fade-in">{children}</main>
        </div>
      </div>

      {/* Modals — mounted at the layout level so they're available from
          every page. The Send Alert modal is gated by role inside the
          notification panel header; here we just need to host it. */}
      <SendAlertModal open={showAlertModal} onClose={() => setShowAlertModal(false)} onSent={fetchNotifs} />
      <ReportIssueModal open={showIssueModal} onClose={() => setShowIssueModal(false)} onCreated={fetchNotifs} />
      <AiAssistant />

      {/* Check-in prompt on logout — shown when user tries to sign out
          without having submitted their daily check-in. */}
      {showLogoutCheckin && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 700, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div style={{
            background: "var(--bg-card)", border: "1px solid var(--border-card)",
            borderRadius: 16, padding: "24px 28px", width: 420, maxWidth: "95vw",
            boxShadow: "var(--shadow-modal)", textAlign: "center",
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📝</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text-primary)", marginBottom: 6 }}>
              Check-in required before signing out
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 20, lineHeight: 1.5 }}>
              Please submit your daily check-in before signing out. This helps the team stay aligned.
            </div>
            <button
              onClick={() => { setShowLogoutCheckin(false); window.location.href = "/dashboard"; }}
              style={{ width: "100%", padding: "12px 14px", borderRadius: 10, background: "var(--accent)", color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
            >
              Submit Check-In Now
            </button>
          </div>
        </div>
      )}
    </Tooltip.Provider>
  );
}
