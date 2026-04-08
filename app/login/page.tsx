"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, ArrowRight, Loader2, ShieldCheck, Activity, Target, BellRing, Building2 } from "lucide-react";

const FEATURES = [
  { Icon: Activity,    title: "Real-time Check-Ins",    desc: "Track your team's daily pulse instantly" },
  { Icon: Target,      title: "Goal Tracking",          desc: "OKRs and revenue targets at a glance" },
  { Icon: ShieldCheck, title: "Role-Based Access",      desc: "Granular permissions across the org" },
  { Icon: BellRing,    title: "Smart Alerts",           desc: "Notifications for what matters most" },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setLoading(true);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError("Invalid email or password.");
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  };

  return (
    <div className="login-shell">
      {/* ── ANIMATED BACKGROUND ─────────────────────────────────
          Three slowly drifting radial-gradient blobs over a dark
          base. The blobs each have their own keyframe + duration so
          the composite never repeats exactly. Pointer-events off so
          the form stays clickable. */}
      <div className="login-bg">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
        <div className="login-grid" />
      </div>

      <div className="login-card-wrap">
        {/* LEFT — brand + features */}
        <div className="login-left">
          <div className="login-brand">
            <div className="login-logo">
              <Building2 size={22} color="#fff" />
            </div>
            <div>
              <div className="login-brand-name">Business Hub</div>
              <div className="login-brand-sub">Operational Command Center</div>
            </div>
          </div>

          <div className="login-headline">
            <h1>
              Your operational
              <br />
              <span className="login-gradient-text">command center</span>
            </h1>
            <p>Manage departments, track revenue, monitor team check-ins, and hit your goals — all in one place.</p>
          </div>

          <div className="login-features">
            {FEATURES.map(({ Icon, title, desc }) => (
              <div key={title} className="login-feature">
                <div className="login-feature-icon">
                  <Icon size={16} strokeWidth={2} />
                </div>
                <div>
                  <div className="login-feature-title">{title}</div>
                  <div className="login-feature-desc">{desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="login-footer">
            © {new Date().getFullYear()} Business Hub · Internal use only
          </div>
        </div>

        {/* RIGHT — form */}
        <div className="login-right">
          <div className="login-form-card">
            <div className="login-form-brand">
              <div className="login-logo login-logo-sm">
                <Building2 size={16} color="#fff" />
              </div>
              <span>Business Hub</span>
            </div>

            <div className="login-form-header">
              <h2>Welcome back</h2>
              <p>Sign in to continue to your dashboard.</p>
            </div>

            <form onSubmit={handleSubmit} className="login-form">
              <div>
                <label htmlFor="email" className="login-label">Email address</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  placeholder="you@company.com"
                  className="login-input"
                />
              </div>
              <div>
                <label htmlFor="password" className="login-label">Password</label>
                <div className="login-input-wrap">
                  <input
                    id="password"
                    type={showPass ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    placeholder="••••••••"
                    className="login-input login-input-padded"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    className="login-eye"
                    aria-label={showPass ? "Hide password" : "Show password"}
                  >
                    {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              {error && <div className="login-error">{error}</div>}
              <button type="submit" disabled={loading} className="login-submit">
                {loading
                  ? <><Loader2 size={15} className="login-spin" />Signing in…</>
                  : <>Sign in <ArrowRight size={15} /></>}
              </button>
            </form>
          </div>
        </div>
      </div>

      <style jsx>{`
        .login-shell {
          position: relative;
          min-height: 100vh;
          width: 100%;
          overflow: hidden;
          background: #06070d;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .login-bg {
          position: absolute;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
        }
        .login-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px);
          background-size: 56px 56px;
          mask-image: radial-gradient(ellipse at center, #000 40%, transparent 75%);
          -webkit-mask-image: radial-gradient(ellipse at center, #000 40%, transparent 75%);
        }
        .blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(90px);
          opacity: 0.55;
          will-change: transform;
        }
        .blob-1 {
          width: 520px;
          height: 520px;
          background: radial-gradient(circle, #5b8ef8 0%, transparent 70%);
          top: -120px;
          left: -120px;
          animation: blobMove1 22s ease-in-out infinite;
        }
        .blob-2 {
          width: 460px;
          height: 460px;
          background: radial-gradient(circle, #a78bfa 0%, transparent 70%);
          top: 30%;
          right: -160px;
          animation: blobMove2 28s ease-in-out infinite;
        }
        .blob-3 {
          width: 540px;
          height: 540px;
          background: radial-gradient(circle, #22d3ee 0%, transparent 70%);
          bottom: -180px;
          left: 30%;
          animation: blobMove3 32s ease-in-out infinite;
          opacity: 0.4;
        }
        @keyframes blobMove1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33%      { transform: translate(120px, 80px) scale(1.1); }
          66%      { transform: translate(60px, 200px) scale(0.95); }
        }
        @keyframes blobMove2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%      { transform: translate(-180px, -100px) scale(1.15); }
        }
        @keyframes blobMove3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33%      { transform: translate(-100px, -120px) scale(1.05); }
          66%      { transform: translate(120px, -60px) scale(0.9); }
        }

        .login-card-wrap {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 1100px;
          padding: 24px;
          display: grid;
          grid-template-columns: 1fr;
          gap: 24px;
        }
        @media (min-width: 1024px) {
          .login-card-wrap { grid-template-columns: 1.15fr 1fr; gap: 0; }
        }

        .login-left {
          display: none;
        }
        @media (min-width: 1024px) {
          .login-left {
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            padding: 56px 56px 48px;
            color: #fff;
            background: linear-gradient(160deg, rgba(20, 24, 48, 0.85) 0%, rgba(13, 21, 53, 0.82) 50%, rgba(15, 22, 40, 0.85) 100%);
            border-radius: 20px 0 0 20px;
            border: 1px solid rgba(255, 255, 255, 0.06);
            border-right: none;
            backdrop-filter: blur(18px);
            -webkit-backdrop-filter: blur(18px);
            min-height: 620px;
          }
        }
        .login-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          animation: loginFadeUp 0.5s ease-out both;
        }
        .login-logo {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #5b8ef8, #6366f1);
          box-shadow: 0 8px 24px rgba(91, 142, 248, 0.35);
        }
        .login-logo-sm {
          width: 32px;
          height: 32px;
          border-radius: 9px;
          box-shadow: none;
        }
        .login-brand-name {
          font-size: 16px;
          font-weight: 800;
          letter-spacing: -0.02em;
          line-height: 1.1;
        }
        .login-brand-sub {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.5);
          margin-top: 2px;
        }
        .login-headline {
          animation: loginFadeUp 0.6s ease-out 0.1s both;
        }
        .login-headline h1 {
          font-size: 40px;
          font-weight: 800;
          line-height: 1.05;
          letter-spacing: -0.025em;
          margin: 0 0 14px;
        }
        .login-gradient-text {
          background: linear-gradient(135deg, #5b8ef8, #a78bfa 60%, #22d3ee);
          background-size: 200% 200%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: textShift 8s ease-in-out infinite;
        }
        @keyframes textShift {
          0%, 100% { background-position: 0% 50%; }
          50%      { background-position: 100% 50%; }
        }
        .login-headline p {
          font-size: 14px;
          color: rgba(255, 255, 255, 0.62);
          max-width: 380px;
          line-height: 1.6;
          margin: 0;
        }
        .login-features {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .login-feature {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          animation: loginFadeUp 0.5s ease-out both;
        }
        .login-feature:nth-child(1) { animation-delay: 0.15s; }
        .login-feature:nth-child(2) { animation-delay: 0.22s; }
        .login-feature:nth-child(3) { animation-delay: 0.29s; }
        .login-feature:nth-child(4) { animation-delay: 0.36s; }
        .login-feature-icon {
          width: 38px;
          height: 38px;
          border-radius: 11px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          background: rgba(91, 142, 248, 0.12);
          border: 1px solid rgba(91, 142, 248, 0.22);
          color: #93b4fb;
        }
        .login-feature-title {
          font-size: 13px;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.92);
        }
        .login-feature-desc {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.5);
          margin-top: 2px;
        }
        .login-footer {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.32);
          padding-top: 22px;
          border-top: 1px solid rgba(255, 255, 255, 0.07);
        }

        .login-right {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
        }
        .login-form-card {
          width: 100%;
          max-width: 420px;
          background: rgba(22, 25, 40, 0.78);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 20px;
          padding: 38px 36px;
          box-shadow: 0 30px 80px -20px rgba(0, 0, 0, 0.5);
          animation: loginFadeUp 0.55s ease-out 0.1s both;
        }
        @media (min-width: 1024px) {
          .login-form-card {
            border-radius: 0 20px 20px 0;
            border-left: 1px solid rgba(255, 255, 255, 0.08);
            min-height: 620px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            max-width: none;
          }
        }
        .login-form-brand {
          display: flex;
          align-items: center;
          gap: 9px;
          margin-bottom: 28px;
          color: #fff;
          font-size: 14px;
          font-weight: 800;
          letter-spacing: -0.02em;
        }
        @media (min-width: 1024px) {
          .login-form-brand { display: none; }
        }
        .login-form-header h2 {
          font-size: 24px;
          font-weight: 800;
          letter-spacing: -0.025em;
          color: #fff;
          margin: 0 0 6px;
        }
        .login-form-header p {
          font-size: 13px;
          color: rgba(255, 255, 255, 0.55);
          margin: 0 0 28px;
        }
        .login-form {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .login-label {
          display: block;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.55);
          margin-bottom: 7px;
        }
        .login-input {
          width: 100%;
          border-radius: 10px;
          padding: 12px 14px;
          font-size: 14px;
          outline: none;
          background: rgba(13, 16, 28, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #fff;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .login-input::placeholder {
          color: rgba(255, 255, 255, 0.3);
        }
        .login-input:focus {
          border-color: #5b8ef8;
          box-shadow: 0 0 0 3px rgba(91, 142, 248, 0.2);
        }
        .login-input-padded {
          padding-right: 42px;
        }
        .login-input-wrap {
          position: relative;
        }
        .login-eye {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.5);
          cursor: pointer;
          display: flex;
          padding: 4px;
        }
        .login-eye:hover { color: #fff; }
        .login-error {
          padding: 11px 13px;
          border-radius: 9px;
          font-size: 12px;
          font-weight: 600;
          background: rgba(220, 38, 38, 0.12);
          color: #f87171;
          border: 1px solid rgba(220, 38, 38, 0.25);
        }
        .login-submit {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 13px;
          border-radius: 10px;
          border: none;
          font-size: 14px;
          font-weight: 700;
          color: #fff;
          background: linear-gradient(135deg, #5b8ef8, #6366f1);
          cursor: pointer;
          transition: transform 0.1s ease, opacity 0.15s ease, box-shadow 0.2s ease;
          box-shadow: 0 12px 28px -12px rgba(91, 142, 248, 0.55);
          margin-top: 4px;
        }
        .login-submit:hover { box-shadow: 0 16px 36px -10px rgba(91, 142, 248, 0.7); }
        .login-submit:active { transform: scale(0.985); }
        .login-submit:disabled { opacity: 0.6; cursor: not-allowed; }
        .login-spin {
          animation: loginSpin 0.9s linear infinite;
        }
        @keyframes loginSpin {
          to { transform: rotate(360deg); }
        }
        @keyframes loginFadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: none; }
        }
      `}</style>
    </div>
  );
}
