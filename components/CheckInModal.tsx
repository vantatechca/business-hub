"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { formatMetricValue, getInitials } from "@/lib/types";
import type { Metric, ExtractedMetric, AiFlag, DailyCheckin } from "@/lib/types";

// ── TYPES ──────────────────────────────────────────────────────
interface AiResult {
  extractedMetrics: ExtractedMetric[];
  blockers:         AiFlag[];
  crossTeamMentions:string[];
  summary:          string;
  overallConfidence:number;
  _mockData?:       boolean;
}

interface CheckInModalProps {
  open:        boolean;
  onClose:     () => void;
  onComplete?: (data: DailyCheckin) => void;
  canDefer?:   boolean; // false = mandatory, no close
}

const STEPS  = ["Welcome","Context","Report","AI Review","Done"] as const;
const MOODS  = [
  { emoji:"😊", label:"Great",    color:"#34d399" },
  { emoji:"😌", label:"Good",     color:"#5b8ef8" },
  { emoji:"😐", label:"Okay",     color:"#fbbf24" },
  { emoji:"😴", label:"Tired",    color:"#a78bfa" },
  { emoji:"😰", label:"Stressed", color:"#f87171" },
];

// ── COMPONENT ─────────────────────────────────────────────────
export default function CheckInModal({ open, onClose, onComplete, canDefer = true }: CheckInModalProps) {
  const { data: session } = useSession();
  const userId   = (session?.user as { id?: string })?.id;
  const userName = session?.user?.name ?? "there";
  const role     = (session?.user as { role?: string })?.role ?? "member";

  const [step,       setStep]       = useState(0);
  const [mood,       setMood]       = useState<typeof MOODS[0] | null>(null);
  const [rawResponse,setRaw]        = useState("");
  const [aiResult,   setAiResult]   = useState<AiResult | null>(null);
  const [confirmed,  setConfirmed]  = useState<Record<number, boolean>>({});
  const [editVals,   setEditVals]   = useState<Record<number, string>>({});
  const [parsing,    setParsing]    = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [myMetrics,  setMyMetrics]  = useState<Metric[]>([]);
  const [loadingM,   setLoadingM]   = useState(false);
  const [deferred,   setDeferred]   = useState(false);

  // Load member's assigned metrics for context display
  useEffect(() => {
    if (!open || !userId) return;
    setLoadingM(true);
    fetch(`/api/metrics?userId=${userId}`)
      .then(r => r.json())
      .then(d => { setMyMetrics(d.data ?? []); setLoadingM(false); })
      .catch(() => setLoadingM(false));
  }, [open, userId]);

  const reset = useCallback(() => {
    setStep(0); setMood(null); setRaw(""); setAiResult(null);
    setConfirmed({}); setEditVals({}); setParsing(false); setSubmitting(false);
  }, []);

  const handleClose = useCallback(() => {
    if (!canDefer && step < 4) return; // mandatory — block close
    setTimeout(reset, 300);
    onClose();
  }, [canDefer, step, reset, onClose]);

  // ── STEP 2 → 3: call AI parser ─────────────────────────────
  const parseWithAI = async () => {
    if (!rawResponse.trim()) return;
    setParsing(true);
    setStep(3);
    try {
      const res = await fetch("/api/checkin-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawResponse, assignedMetrics: myMetrics, userId }),
      });
      const data: AiResult = await res.json();
      setAiResult(data);
      // Pre-confirm all high-confidence metrics
      const initConfirmed: Record<number, boolean> = {};
      data.extractedMetrics.forEach((m, i) => { initConfirmed[i] = m.confidence >= 0.7; });
      setConfirmed(initConfirmed);
    } catch {
      setAiResult({
        extractedMetrics: [], blockers: [], crossTeamMentions: [],
        summary: rawResponse.slice(0, 100), overallConfidence: 0, _mockData: true,
      });
    }
    setParsing(false);
  };

  // ── STEP 3 → 4: submit everything ──────────────────────────
  const submit = async () => {
    if (!userId) return;
    setSubmitting(true);

    // Build confirmed metrics list with edited values
    const confirmedMetrics = (aiResult?.extractedMetrics ?? []).map((m, i) => ({
      ...m,
      confirmed: !!confirmed[i],
      newValue:  editVals[i] !== undefined ? parseFloat(editVals[i]) : m.newValue,
    }));

    // 1. Save check-in record
    const ciRes = await fetch("/api/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId, mood: mood?.label, moodEmoji: mood?.emoji,
        wins: rawResponse, rawResponse,
        aiSummary:           aiResult?.summary,
        aiExtractedMetrics:  confirmedMetrics,
        aiConfidenceScore:   aiResult?.overallConfidence ?? 0,
        aiFlags:             aiResult?.blockers ?? [],
        status:              "ai_processed",
      }),
    });
    const ciData = await ciRes.json();

    // 2. Apply confirmed metric updates
    if (ciData.data?.id) {
      await fetch(`/api/checkin/${ciData.data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, confirmedMetrics, status: "ai_processed" }),
      });
    }

    setStep(4);
    setSubmitting(false);
    onComplete?.(ciData.data);
    setTimeout(() => { reset(); onClose(); }, 2800);
  };

  if (!open) return null;

  const today = new Date().toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric" });

  return (
    <div
      style={{
        position:"fixed", inset:0, background:"rgba(0,0,0,0.6)",
        display:"flex", alignItems:"center", justifyContent:"center", zIndex:600,
        animation:"fadeIn .15s ease",
      }}
      onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div style={{
        background:"var(--bg-card)", border:"1px solid var(--border-card)",
        borderRadius:20, width:540, maxWidth:"96vw", maxHeight:"92vh",
        overflowY:"auto", padding:"24px 28px",
        animation:"scalePop .25s cubic-bezier(.34,1.56,.64,1)",
        boxShadow:"var(--shadow-modal)",
      }}>

        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:22 }}>
          <div style={{ fontSize:14, fontWeight:800, color:"var(--text-primary)" }}>Daily Check-In</div>
          {canDefer && step < 4 && (
            <button onClick={handleClose} style={{ background:"transparent", border:"none", color:"var(--text-secondary)", fontSize:22, cursor:"pointer", lineHeight:1, padding:0 }}>×</button>
          )}
        </div>

        {/* Progress stepper */}
        <div style={{ display:"flex", alignItems:"center", marginBottom:26 }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{ display:"flex", alignItems:"center", flex: i < STEPS.length - 1 ? 1 : undefined }}>
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                <div className={`step-circle ${i < step ? "done" : i === step ? "active" : "pending"}`}>
                  {i < step ? "✓" : i + 1}
                </div>
                <span style={{ fontSize:9, fontWeight:700, whiteSpace:"nowrap", color:i===step?"var(--accent)":"var(--text-muted)" }}>{s}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className="step-connector" style={{ background: i < step ? "var(--accent)" : "var(--border-divider)" }} />
              )}
            </div>
          ))}
        </div>

        {/* ── STEP 0: Welcome ──────────────────────────────── */}
        {step === 0 && (
          <div style={{ textAlign:"center", padding:"12px 0 20px" }} className="animate-fade-up">
            <div style={{ fontSize:52, marginBottom:12 }}>👋</div>
            <div style={{ fontSize:19, fontWeight:800, color:"var(--text-primary)", marginBottom:6, letterSpacing:"-0.02em" }}>
              Good to see you, {userName.split(" ")[0]}!
            </div>
            <div style={{ fontSize:12, color:"var(--text-secondary)", marginBottom:3 }}>{today}</div>
            <div style={{ fontSize:12, color:"var(--text-secondary)", marginBottom:24, maxWidth:340, margin:"8px auto 24px" }}>
              Your daily check-in keeps the team aligned. It takes about 2 minutes.
            </div>
            {!canDefer && (
              <div style={{ padding:"10px 16px", borderRadius:10, background:"var(--warning-bg)", border:"1px solid var(--warning)44", color:"var(--warning)", fontSize:12, fontWeight:600, marginBottom:18 }}>
                ⚠ Check-in required before accessing the dashboard today.
              </div>
            )}
            <button onClick={() => setStep(1)} style={{ padding:"11px 30px", borderRadius:10, background:"var(--accent)", color:"#fff", border:"none", fontSize:14, fontWeight:800, cursor:"pointer", letterSpacing:"-0.01em" }}>
              Start Check-In →
            </button>
          </div>
        )}

        {/* ── STEP 1: Context — member's assigned metrics ──── */}
        {step === 1 && (
          <div className="animate-fade-up">
            <div style={{ fontSize:15, fontWeight:800, color:"var(--text-primary)", marginBottom:4, letterSpacing:"-0.01em" }}>
              Your assignments today
            </div>
            <div style={{ fontSize:12, color:"var(--text-secondary)", marginBottom:14 }}>
              These are the metrics you're responsible for. Review current values before reporting.
            </div>

            {loadingM ? (
              <div style={{ textAlign:"center", padding:24, color:"var(--text-secondary)", fontSize:12 }}>
                <Loader2 size={18} style={{ animation:"spin 1s linear infinite", display:"inline-block", marginBottom:8 }} />
                <div>Loading your metrics…</div>
              </div>
            ) : myMetrics.length === 0 ? (
              <div style={{ padding:"20px 0", textAlign:"center", color:"var(--text-secondary)", fontSize:12 }}>
                No metrics assigned yet. Report your general progress below.
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:16, maxHeight:280, overflowY:"auto" }}>
                {myMetrics.map(m => (
                  <div key={m.id} style={{
                    display:"flex", alignItems:"center", gap:12, padding:"10px 14px",
                    borderRadius:10, background:"var(--bg-input)",
                    border:"1px solid var(--border-card)",
                  }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:12, fontWeight:700, color:"var(--text-primary)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{m.name}</div>
                      <div style={{ fontSize:10, color:"var(--text-muted)", marginTop:2 }}>
                        {m.departmentName} · {m.metricType.replace(/_/g," ")}
                      </div>
                    </div>
                    <div style={{ textAlign:"right", flexShrink:0 }}>
                      <div style={{ fontSize:16, fontWeight:800, color:"var(--accent)" }}>
                        {formatMetricValue(m.currentValue, m.unit)}
                      </div>
                      {m.targetValue && (
                        <div style={{ fontSize:10, color:"var(--text-muted)" }}>
                          Target: {formatMetricValue(m.targetValue ?? 0, m.unit)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Mood selector */}
            <div style={{ fontSize:13, fontWeight:700, color:"var(--text-primary)", marginBottom:10 }}>How are you feeling today?</div>
            <div style={{ display:"flex", gap:8, marginBottom:18, flexWrap:"wrap" }}>
              {MOODS.map(m => (
                <button key={m.label} onClick={() => setMood(m)} style={{
                  display:"flex", flexDirection:"column", alignItems:"center", gap:4,
                  padding:"8px 12px", borderRadius:10, cursor:"pointer",
                  border:`2px solid ${mood?.label === m.label ? m.color : "var(--border-card)"}`,
                  background: mood?.label === m.label ? `${m.color}12` : "var(--bg-input)",
                  transition:"all .15s", flex:1, minWidth:70,
                }}>
                  <span style={{ fontSize:22 }}>{m.emoji}</span>
                  <span style={{ fontSize:11, fontWeight:700, color: mood?.label === m.label ? m.color : "var(--text-secondary)" }}>{m.label}</span>
                </button>
              ))}
            </div>

            <NavRow onBack={() => setStep(0)} onNext={() => setStep(2)} nextDisabled={!mood} />
          </div>
        )}

        {/* ── STEP 2: Free-text report ──────────────────────── */}
        {step === 2 && (
          <div className="animate-fade-up">
            <div style={{ fontSize:15, fontWeight:800, color:"var(--text-primary)", marginBottom:4 }}>
              What did you accomplish today?
            </div>
            <div style={{ fontSize:12, color:"var(--text-secondary)", marginBottom:14 }}>
              Be specific with numbers. The AI will extract your metric updates automatically.
            </div>

            {myMetrics.length > 0 && (
              <div style={{ marginBottom:12, padding:"10px 14px", borderRadius:10, background:"var(--accent-bg)", border:"1px solid var(--accent)30", fontSize:11, color:"var(--accent)" }}>
                💡 Tip — mention numbers for: <strong>{myMetrics.slice(0,3).map(m => m.name.split(" ")[0]).join(", ")}</strong>
                {myMetrics.length > 3 && ` and ${myMetrics.length - 3} more`}
              </div>
            )}

            <textarea
              value={rawResponse}
              onChange={e => setRaw(e.target.value)}
              rows={7}
              placeholder={myMetrics.length > 0
                ? `Example:\n"Created 5 GMC accounts today, submitted 3 for review. 1 got approved, 2 still pending. Helped Tristan with store #412. Blocked by feed issue — waiting on Gauthier."`
                : "Describe what you worked on today, with any numbers or results…"}
              style={{
                width:"100%", background:"var(--bg-input)", border:"1px solid var(--border-card)",
                borderRadius:12, padding:"13px 15px", fontSize:13, color:"var(--text-primary)",
                outline:"none", resize:"vertical", fontFamily:"inherit", lineHeight:1.6,
                marginBottom:14, transition:"border-color .15s",
              }}
              onFocus={e => e.target.style.borderColor = "var(--accent)"}
              onBlur={e => e.target.style.borderColor = "var(--border-card)"}
            />

            <div style={{ fontSize:11, color:"var(--text-muted)", marginBottom:14 }}>
              {rawResponse.length} characters · AI will process this report
            </div>

            <NavRow onBack={() => setStep(1)} onNext={parseWithAI} nextLabel="Submit to AI →" nextDisabled={rawResponse.trim().length < 10} />
          </div>
        )}

        {/* ── STEP 3: AI review ─────────────────────────────── */}
        {step === 3 && (
          <div className="animate-fade-up">
            {parsing ? (
              <div style={{ textAlign:"center", padding:"40px 0" }}>
                <div style={{ fontSize:48, marginBottom:16 }}>🧠</div>
                <div style={{ fontSize:15, fontWeight:700, color:"var(--text-primary)", marginBottom:8 }}>AI is analyzing your report…</div>
                <div style={{ fontSize:12, color:"var(--text-secondary)", marginBottom:20 }}>Extracting metrics, detecting blockers…</div>
                <Loader2 size={24} style={{ animation:"spin 1s linear infinite", color:"var(--accent)", display:"inline-block" }} />
              </div>
            ) : aiResult && (
              <div>
                <div style={{ fontSize:15, fontWeight:800, color:"var(--text-primary)", marginBottom:4 }}>Review AI Extraction</div>
                <div style={{ fontSize:12, color:"var(--text-secondary)", marginBottom:16 }}>
                  Confirm, edit, or reject each extracted update. Only confirmed items will be applied.
                  {aiResult._mockData && <span style={{ color:"var(--warning)" }}> (No API key — mock data shown)</span>}
                </div>

                {/* AI Summary */}
                <div style={{ padding:"11px 14px", borderRadius:10, background:"var(--accentBg,var(--accent-bg))", border:"1px solid var(--accent)30", marginBottom:16 }}>
                  <div style={{ fontSize:10, fontWeight:800, color:"var(--accent)", letterSpacing:".07em", marginBottom:5 }}>AI SUMMARY</div>
                  <div style={{ fontSize:12, color:"var(--text-primary)", lineHeight:1.5 }}>{aiResult.summary}</div>
                  <div style={{ fontSize:10, color:"var(--text-secondary)", marginTop:6 }}>
                    Overall confidence: <strong style={{ color: aiResult.overallConfidence >= 0.7 ? "var(--success)" : "var(--warning)" }}>
                      {Math.round(aiResult.overallConfidence * 100)}%
                    </strong>
                  </div>
                </div>

                {/* Extracted metrics */}
                {aiResult.extractedMetrics.length > 0 ? (
                  <div style={{ marginBottom:14 }}>
                    <div style={{ fontSize:10, fontWeight:800, color:"var(--text-secondary)", letterSpacing:".07em", marginBottom:8 }}>EXTRACTED METRIC UPDATES</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                      {aiResult.extractedMetrics.map((m, i) => {
                        const isConf = !!confirmed[i];
                        const confColor = m.confidence >= 0.7 ? "var(--success)" : "var(--warning)";
                        return (
                          <div key={i} style={{
                            padding:"11px 14px", borderRadius:10,
                            border:`2px solid ${isConf ? "var(--accent)" : "var(--border-card)"}`,
                            background: isConf ? "var(--accent-bg)" : "var(--bg-input)",
                            transition:"all .15s",
                          }}>
                            <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
                              <input
                                type="checkbox"
                                checked={isConf}
                                onChange={e => setConfirmed(p => ({ ...p, [i]: e.target.checked }))}
                                style={{ marginTop:2, accentColor:"var(--accent)", cursor:"pointer", width:14, height:14, flexShrink:0 }}
                              />
                              <div style={{ flex:1 }}>
                                <div style={{ fontSize:12, fontWeight:700, color:"var(--text-primary)" }}>{m.metricName}</div>
                                <div style={{ display:"flex", gap:10, marginTop:4, flexWrap:"wrap" }}>
                                  {m.delta !== null && m.delta !== undefined && (
                                    <span style={{ fontSize:11, color: m.delta >= 0 ? "var(--success)" : "var(--danger)" }}>
                                      {m.delta >= 0 ? "+" : ""}{m.delta}
                                    </span>
                                  )}
                                  {m.newValue !== null && m.newValue !== undefined && (
                                    <span style={{ fontSize:11, color:"var(--text-secondary)" }}>→ {m.newValue}</span>
                                  )}
                                  <span style={{ fontSize:10, fontWeight:700, color:confColor }}>
                                    {Math.round(m.confidence * 100)}% confident
                                    {m.confidence < 0.7 && " ⚠ review"}
                                  </span>
                                </div>
                                {isConf && (
                                  <div style={{ marginTop:8, display:"flex", alignItems:"center", gap:8 }}>
                                    <span style={{ fontSize:11, color:"var(--text-secondary)" }}>New value:</span>
                                    <input
                                      type="number"
                                      value={editVals[i] ?? (m.newValue ?? "")}
                                      onChange={e => setEditVals(p => ({ ...p, [i]: e.target.value }))}
                                      placeholder={m.newValue?.toString() ?? "enter value"}
                                      style={{
                                        width:100, padding:"4px 8px", borderRadius:6, fontSize:12,
                                        background:"var(--bg-card)", border:"1px solid var(--border-card)",
                                        color:"var(--text-primary)", outline:"none",
                                      }}
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div style={{ padding:"16px", textAlign:"center", color:"var(--text-secondary)", fontSize:12, marginBottom:14, background:"var(--bg-input)", borderRadius:10 }}>
                    No metric updates extracted. Your report will be saved as a text note.
                  </div>
                )}

                {/* Blockers */}
                {aiResult.blockers.length > 0 && (
                  <div style={{ marginBottom:16 }}>
                    <div style={{ fontSize:10, fontWeight:800, color:"var(--text-secondary)", letterSpacing:".07em", marginBottom:8 }}>DETECTED BLOCKERS</div>
                    {aiResult.blockers.map((b, i) => (
                      <div key={i} style={{
                        padding:"9px 14px", borderRadius:9, marginBottom:6,
                        background: b.severity === "high" ? "var(--danger-bg)" : b.severity === "medium" ? "var(--warning-bg)" : "var(--bg-input)",
                        border: `1px solid ${b.severity === "high" ? "var(--danger)44" : b.severity === "medium" ? "var(--warning)44" : "var(--border-card)"}`,
                        display:"flex", alignItems:"center", gap:10,
                      }}>
                        <span style={{ fontSize:13 }}>{b.severity === "high" ? "🔴" : b.severity === "medium" ? "🟡" : "🟢"}</span>
                        <div>
                          <div style={{ fontSize:12, color:"var(--text-primary)" }}>{b.description}</div>
                          <div style={{ fontSize:10, color:"var(--text-secondary)", marginTop:2, textTransform:"capitalize" }}>{b.severity} severity · leader will be notified</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <NavRow onBack={() => setStep(2)} onNext={submit} nextLabel={submitting ? "Submitting…" : "Confirm & Submit ✓"} nextDisabled={submitting} />
              </div>
            )}
          </div>
        )}

        {/* ── STEP 4: Done ──────────────────────────────────── */}
        {step === 4 && (
          <div style={{ textAlign:"center", padding:"20px 0" }} className="animate-scale-pop">
            <div style={{ fontSize:60, marginBottom:14 }}>🎉</div>
            <div style={{ fontSize:19, fontWeight:800, color:"var(--success)", marginBottom:8, letterSpacing:"-0.02em" }}>Check-in complete!</div>
            <div style={{ fontSize:12, color:"var(--text-secondary)", marginBottom:6 }}>
              {aiResult?.extractedMetrics.filter((_, i) => confirmed[i]).length ?? 0} metric update{(aiResult?.extractedMetrics.filter((_, i) => confirmed[i]).length ?? 0) !== 1 ? "s" : ""} applied.
            </div>
            {aiResult?.blockers && aiResult.blockers.length > 0 && (
              <div style={{ fontSize:12, color:"var(--warning)", marginBottom:6 }}>⚠ {aiResult.blockers.length} blocker{aiResult.blockers.length > 1 ? "s" : ""} flagged for your leader.</div>
            )}
            <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:10 }}>Closing automatically…</div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
        @keyframes scalePop { 0%{transform:scale(.85);opacity:0} 60%{transform:scale(1.05)} 100%{transform:scale(1);opacity:1} }
      `}</style>
    </div>
  );
}

function NavRow({ onBack, onNext, nextLabel="Next →", nextDisabled, showBack=true }: {
  onBack?: () => void; onNext: () => void; nextLabel?: string;
  nextDisabled?: boolean; showBack?: boolean;
}) {
  return (
    <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:6 }}>
      {showBack && onBack && (
        <button onClick={onBack} style={{ padding:"9px 16px", borderRadius:9, border:"1px solid var(--border-card)", background:"var(--bg-input)", color:"var(--text-primary)", fontSize:13, fontWeight:600, cursor:"pointer" }}>← Back</button>
      )}
      <button onClick={onNext} disabled={nextDisabled} style={{ padding:"9px 22px", borderRadius:9, background:"var(--accent)", color:"#fff", border:"none", fontSize:13, fontWeight:800, cursor:"pointer", opacity:nextDisabled?.6:1, transition:"opacity .15s" }}>
        {nextLabel}
      </button>
    </div>
  );
}
