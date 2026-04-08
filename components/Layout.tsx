"use client";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useTheme } from "next-themes";
import { signOut, useSession } from "next-auth/react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { LayoutDashboard, TrendingUp, Layers, Users, CheckSquare, Calendar, DollarSign, CreditCard, Target, LogOut, Zap, Bell, Search, Plus, Check, BarChart2, UserCog, Link2 } from "lucide-react";
import { Avatar } from "./ui/shared";

const NAV = [
  { s:"MAIN", items:[
    {id:"dashboard",l:"Dashboard",h:"/dashboard",I:LayoutDashboard},
    {id:"analytics",l:"Analytics",h:"/analytics",I:TrendingUp},
  ]},
  { s:"OPERATIONS", items:[
    {id:"departments",l:"Departments",h:"/departments",I:Layers},
    {id:"metrics",l:"Metrics",h:"/metrics",I:BarChart2},
    {id:"assignments",l:"Assignments",h:"/assignments",I:Link2},
    {id:"team",l:"Team",h:"/team",I:Users},
    {id:"tasks",l:"Tasks",h:"/tasks",I:CheckSquare},
    {id:"checkin",l:"Check-Ins",h:"/checkin",I:Calendar},
  ]},
  { s:"FINANCE", items:[
    {id:"revenue",l:"Revenue",h:"/revenue",I:DollarSign},
    {id:"expenses",l:"Expenses",h:"/expenses",I:CreditCard},
    {id:"goals",l:"Goals",h:"/goals",I:Target},
  ]},
  { s:"ADMIN", items:[
    {id:"users",l:"Users",h:"/users",I:UserCog},
  ]},
];

interface Notif { id:number; type:string; message:string; read:boolean; createdAt:string; }

export default function AppLayout({ children, title, onNew, newLabel="New" }: { children:React.ReactNode; title:string; onNew?:()=>void; newLabel?:string; }) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { data: session } = useSession();
  const [col, setCol]       = useState(false);
  const [showN, setShowN]   = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const name  = session?.user?.name ?? "Admin";
  const role  = (session?.user as { role?: string })?.role ?? "member";
  const ini   = name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
  const unread = notifs.filter(n => !n.read).length;
  const isDark = mounted && theme === "dark";

  useEffect(() => {
    fetch("/api/notifications").then(r => r.json()).then(d => setNotifs(d.data ?? [])).catch(() => {});
  }, []);

  const markRead = (id: number) => {
    fetch(`/api/notifications/${id}`, { method:"PATCH" }).catch(() => {});
    setNotifs(p => p.map(n => n.id === id ? {...n,read:true} : n));
  };
  const markAll = () => {
    fetch("/api/notifications", { method:"PATCH" }).catch(() => {});
    setNotifs(p => p.map(n => ({...n,read:true})));
  };

  const ROLE_COLOR: Record<string,string> = { admin:"var(--violet)", leader:"var(--warning)", member:"var(--accent)" };

  return (
    <Tooltip.Provider delayDuration={300}>
      <div style={{display:"flex",height:"100vh",overflow:"hidden",background:"var(--bg-base)"}}>

        <aside style={{width:col?"var(--sidebar-collapsed)":"var(--sidebar-width)",background:"var(--bg-sidebar)",borderRight:"1px solid var(--border-sidebar)",display:"flex",flexDirection:"column",transition:"width .2s ease",flexShrink:0,overflow:"hidden"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,padding:"13px 12px",borderBottom:"1px solid var(--border-sidebar)",flexShrink:0,minHeight:56}}>
            <div style={{width:32,height:32,borderRadius:9,flexShrink:0,background:"linear-gradient(135deg,#5b8ef8,#6366f1)",display:"flex",alignItems:"center",justifyContent:"center"}}><Zap size={15} color="#fff"/></div>
            {!col&&<div><div style={{fontSize:13,fontWeight:800,color:"var(--text-primary)",whiteSpace:"nowrap",letterSpacing:"-0.02em"}}>Business Hub</div><div style={{fontSize:10,color:"var(--text-secondary)"}}>V2 · Command Center</div></div>}
          </div>

          <nav style={{flex:1,overflowY:"auto",overflowX:"hidden",padding:8}}>
            {NAV.map(sect=>{
              // Hide ADMIN section for non-admins
              if (sect.s === "ADMIN" && role !== "admin") return null;
              return (
                <div key={sect.s} style={{marginBottom:2}}>
                  {!col&&<div style={{fontSize:9,fontWeight:800,color:"var(--text-muted)",padding:"10px 8px 4px",letterSpacing:".12em"}}>{sect.s}</div>}
                  {sect.items.map(({id,l,h,I})=>{
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
            <button onClick={()=>setTheme(isDark?"light":"dark")} className={`nav-item ${col?"justify-center":""}`} style={{fontSize:12,marginBottom:2}}>
              <span style={{fontSize:14,lineHeight:1,width:14,display:"inline-block",textAlign:"center"}}>{isDark?"☀":"🌙"}</span>
              {!col&&<span>{isDark?" Light mode":" Dark mode"}</span>}
            </button>
            <div style={{display:"flex",alignItems:"center",gap:8,padding:col?"6px 0":"6px 10px",marginBottom:2}}>
              <Avatar s={ini} size={28}/>
              {!col&&<div>
                <div style={{fontSize:12,fontWeight:700,color:"var(--text-primary)"}}>{name}</div>
                <div style={{fontSize:10,color:ROLE_COLOR[role] ?? "var(--text-secondary)",fontWeight:600,textTransform:"capitalize"}}>{role}</div>
              </div>}
            </div>
            <button onClick={()=>signOut({callbackUrl:"/login"})} className={`nav-item ${col?"justify-center":""}`} style={{fontSize:12,marginTop:2}}><LogOut size={14}/>{!col&&" Sign out"}</button>
            <button onClick={()=>setCol(v=>!v)} className={`nav-item ${col?"justify-center":""}`} style={{fontSize:11,marginTop:2,color:"var(--text-muted)"}}>
              <span style={{fontSize:13}}>{col?"→":"←"}</span>{!col&&<span> Collapse</span>}
            </button>
          </div>
        </aside>

        <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>
          <header style={{height:"var(--topbar-height)",background:"var(--bg-sidebar)",borderBottom:"1px solid var(--border-sidebar)",display:"flex",alignItems:"center",padding:"0 18px",gap:10,flexShrink:0}}>
            <h1 style={{flex:1,fontSize:15,fontWeight:800,color:"var(--text-primary)",margin:0,letterSpacing:"-0.02em",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{title}</h1>
            <div style={{display:"flex",alignItems:"center",gap:8,background:"var(--bg-input)",border:"1px solid var(--border-card)",borderRadius:"var(--radius-md)",padding:"6px 10px",width:160}}>
              <Search size={12} style={{color:"var(--text-muted)",flexShrink:0}}/>
              <input placeholder="Search..." style={{border:"none",background:"transparent",outline:"none",fontSize:12,color:"var(--text-primary)",width:"100%"}}/>
            </div>
            <div style={{position:"relative"}}>
              <button onClick={()=>setShowN(v=>!v)} aria-label="Notifications" style={{width:34,height:34,borderRadius:"var(--radius-md)",border:"1px solid var(--border-card)",background:"transparent",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"var(--text-secondary)",position:"relative"}}>
                <Bell size={15}/>{unread>0&&<div className="notif-dot"/>}
              </button>
              {showN&&(
                <div style={{position:"absolute",right:0,top:"calc(100% + 8px)",width:300,background:"var(--bg-card)",border:"1px solid var(--border-card)",borderRadius:"var(--radius-xl)",boxShadow:"var(--shadow-dropdown)",zIndex:300}} className="animate-slide-up">
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 14px",borderBottom:"1px solid var(--border-divider)"}}>
                    <span style={{fontSize:13,fontWeight:700,color:"var(--text-primary)"}}>Notifications{unread>0&&` (${unread})`}</span>
                    {unread>0&&<button onClick={markAll} style={{fontSize:11,color:"var(--accent)",background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:4}}><Check size={11}/>Mark all read</button>}
                  </div>
                  <div style={{maxHeight:320,overflowY:"auto"}}>
                    {notifs.length===0?<div style={{padding:"28px 0",textAlign:"center",fontSize:13,color:"var(--text-secondary)"}}>All caught up!</div>:
                      notifs.map(n=>(
                        <div key={n.id} onClick={()=>markRead(n.id)} role="button" style={{padding:"9px 14px",borderBottom:"1px solid var(--border-divider)",background:n.read?"transparent":"var(--accent-bg)",display:"flex",gap:9,alignItems:"flex-start",cursor:"pointer"}}>
                          <div style={{width:7,height:7,borderRadius:"50%",marginTop:5,flexShrink:0,background:n.read?"var(--text-muted)":"var(--accent)"}}/>
                          <div><div style={{fontSize:12,color:"var(--text-primary)",lineHeight:1.4}}>{n.message}</div><div style={{fontSize:10,color:"var(--text-secondary)",marginTop:2}}>{new Date(n.createdAt).toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"})}</div></div>
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}
            </div>
            {onNew&&<button onClick={onNew} style={{display:"flex",alignItems:"center",gap:6,background:"var(--accent)",color:"#fff",border:"none",borderRadius:"var(--radius-md)",padding:"7px 13px",fontSize:12,fontWeight:700,cursor:"pointer"}}><Plus size={13}/>{newLabel}</button>}
          </header>
          <main style={{flex:1,overflowY:"auto",padding:"16px 18px"}} className="animate-fade-in">{children}</main>
        </div>
      </div>
    </Tooltip.Provider>
  );
}
