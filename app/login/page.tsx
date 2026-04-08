"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Zap, ArrowRight, Loader2 } from "lucide-react";

const FEATURES = [
  { icon:"⚡", title:"Real-time Check-Ins",    desc:"Track your team's daily pulse instantly" },
  { icon:"📊", title:"Live Metrics Dashboard", desc:"KPIs across all departments in one view" },
  { icon:"🎯", title:"Goal Tracking",          desc:"OKRs and revenue targets at a glance" },
  { icon:"🔔", title:"Smart Alerts",           desc:"Notifications for what matters most" },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail]       = useState("admin@hub.com");
  const [password, setPassword] = useState("admin123");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setLoading(true);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) setError("Invalid credentials. Try admin@hub.com / admin123");
    else { router.push("/dashboard"); router.refresh(); }
  };

  return (
    <div className="flex min-h-screen" style={{background:"var(--bg-base)"}}>
      {/* LEFT PANEL */}
      <div className="hidden lg:flex lg:w-[58%] flex-col justify-between p-12 relative overflow-hidden" style={{background:"linear-gradient(145deg,#0f1628 0%,#1a1f45 40%,#0d1535 100%)"}}>
        <div className="absolute inset-0 opacity-[0.04]" style={{backgroundImage:"linear-gradient(rgba(255,255,255,.5) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.5) 1px,transparent 1px)",backgroundSize:"48px 48px"}}/>
        <div className="absolute top-1/4 right-0 w-96 h-96 rounded-full opacity-10 blur-3xl pointer-events-none" style={{background:"radial-gradient(circle,#5b8ef8 0%,transparent 70%)"}}/>
        <div className="flex items-center gap-3 relative z-10 animate-fade-up">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{background:"linear-gradient(135deg,#5b8ef8,#6366f1)"}}><Zap size={20} color="#fff"/></div>
          <div><div className="text-base font-extrabold text-white tracking-tight">Business Hub</div><div className="text-[11px] text-white/50">Operational Command Center</div></div>
        </div>
        <div className="relative z-10 animate-fade-up" style={{animationDelay:"100ms"}}>
          <h1 className="text-4xl font-extrabold text-white leading-tight tracking-tight mb-4">Your operational<br/><span className="text-transparent bg-clip-text" style={{backgroundImage:"linear-gradient(135deg,#5b8ef8,#a78bfa)"}}>command center</span></h1>
          <p className="text-sm text-white/60 max-w-sm leading-relaxed">Manage departments, track revenue, monitor team check-ins, and hit your goals — all in one place.</p>
        </div>
        <div className="relative z-10 space-y-4 stagger-children">
          {FEATURES.map(f=>(
            <div key={f.title} className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-base" style={{background:"rgba(91,142,248,.12)",border:"1px solid rgba(91,142,248,.2)"}}>{f.icon}</div>
              <div><div className="text-sm font-bold text-white/90">{f.title}</div><div className="text-[11px] text-white/50 mt-0.5">{f.desc}</div></div>
            </div>
          ))}
        </div>
        <div className="relative z-10 pt-6 border-t animate-fade-up" style={{borderColor:"rgba(255,255,255,.08)",animationDelay:"300ms"}}>
          <p className="text-[11px] text-white/30">© {new Date().getFullYear()} Business Hub · Internal use only</p>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="flex-1 flex items-center justify-center p-6 animate-fade-up">
        <div className="w-full max-w-[380px]">
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{background:"linear-gradient(135deg,var(--accent),#6366f1)"}}><Zap size={16} color="#fff"/></div>
            <span className="text-sm font-extrabold tracking-tight" style={{color:"var(--text-primary)"}}>Business Hub</span>
          </div>
          <div className="mb-8">
            <h2 className="text-2xl font-extrabold tracking-tight mb-1" style={{color:"var(--text-primary)"}}>Welcome back</h2>
            <p className="text-sm" style={{color:"var(--text-secondary)"}}>Sign in to continue to your dashboard.</p>
          </div>
          {/* Demo hint */}
          <div className="mb-5 p-3 rounded-lg text-xs" style={{background:"var(--accent-bg)",color:"var(--accent)",border:"1px solid rgba(91,142,248,.2)"}}>
            Demo: <strong>admin@hub.com</strong> / <strong>admin123</strong>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-[11px] font-extrabold mb-1.5 tracking-[.07em] uppercase" style={{color:"var(--text-secondary)"}}>Email address</label>
              <input id="email" type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" className="w-full rounded-[var(--radius-md)] px-3.5 py-3 text-sm outline-none transition-all" style={{background:"var(--bg-input)",border:"1px solid var(--border-card)",color:"var(--text-primary)"}}/>
            </div>
            <div>
              <label htmlFor="password" className="block text-[11px] font-extrabold mb-1.5 tracking-[.07em] uppercase" style={{color:"var(--text-secondary)"}}>Password</label>
              <div className="relative">
                <input id="password" type={showPass?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" className="w-full rounded-[var(--radius-md)] px-3.5 py-3 pr-10 text-sm outline-none" style={{background:"var(--bg-input)",border:"1px solid var(--border-card)",color:"var(--text-primary)"}}/>
                <button type="button" onClick={()=>setShowPass(v=>!v)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{color:"var(--text-muted)"}}>{showPass?<EyeOff size={15}/>:<Eye size={15}/>}</button>
              </div>
            </div>
            {error&&<div className="p-3 rounded-lg text-xs font-semibold" style={{background:"var(--danger-bg)",color:"var(--danger)"}}>{error}</div>}
            <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 py-3 rounded-[var(--radius-md)] text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[.98] disabled:opacity-60" style={{background:"var(--accent)"}}>
              {loading?<><Loader2 size={15} className="animate-spin"/>Signing in…</>:<>Sign in<ArrowRight size={15}/></>}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
