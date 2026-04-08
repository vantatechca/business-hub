"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import CheckInModal from "./CheckInModal";

interface CheckInGateProps {
  children: React.ReactNode;
}

const DEFER_KEY = (userId: string, date: string) => `ci_deferred_${userId}_${date}`;
const DONE_KEY  = (userId: string, date: string) => `ci_done_${userId}_${date}`;

export default function CheckInGate({ children }: CheckInGateProps) {
  const { data: session, status } = useSession();
  const [showModal,   setShowModal]   = useState(false);
  const [canDefer,    setCanDefer]    = useState(true);
  const [ready,       setReady]       = useState(false);

  const userId = (session?.user as { id?: string })?.id;
  const role   = (session?.user as { role?: string })?.role;
  const requiresCheckin = (session?.user as { requiresCheckin?: boolean })?.requiresCheckin;
  const today  = new Date().toISOString().slice(0, 10);

  // Roles that NEVER get the check-in prompt regardless of the per-user
  // requires_checkin flag. Admins / super admins are excluded by design —
  // they're not the ones doing daily reports.
  const exemptRole = role === "super_admin" || role === "admin";
  // For everyone else, the prompt only fires if requires_checkin is true
  // on their user row. (Manager defaults to true; member/lead default to
  // false unless an admin flips it.)
  const shouldGate = !exemptRole && requiresCheckin === true;

  useEffect(() => {
    if (status !== "authenticated" || !userId) return;
    if (!shouldGate) {
      setReady(true);
      return;
    }

    const doneKey   = DONE_KEY(userId, today);
    const deferKey  = DEFER_KEY(userId, today);

    // Already checked in today
    if (typeof window !== "undefined" && localStorage.getItem(doneKey)) {
      setReady(true);
      return;
    }

    // Check with server if they've already checked in
    fetch(`/api/checkin?userId=${userId}&date=${today}`)
      .then(r => r.json())
      .then(d => {
        if (d.data && d.data.length > 0) {
          // Already checked in — save locally and skip modal
          if (typeof window !== "undefined") localStorage.setItem(doneKey, "1");
          setReady(true);
          return;
        }
        // Not checked in — check if they've deferred once already today
        const alreadyDeferred = typeof window !== "undefined" && localStorage.getItem(deferKey);
        setCanDefer(!alreadyDeferred); // second time = mandatory
        setShowModal(true);
        setReady(true);
      })
      .catch(() => {
        // Can't reach server — allow access but show modal
        setReady(true);
        setShowModal(true);
      });
  }, [status, userId, today, shouldGate]);

  const handleDefer = () => {
    if (!userId) return;
    // Record that they've used their one deferral
    if (typeof window !== "undefined") localStorage.setItem(DEFER_KEY(userId, today), "1");
    setShowModal(false);
  };

  const handleComplete = () => {
    if (!userId) return;
    if (typeof window !== "undefined") localStorage.setItem(DONE_KEY(userId, today), "1");
    setShowModal(false);
  };

  // Not authenticated — just render children (middleware handles redirect)
  if (status === "loading" || !ready) {
    return (
      <div style={{ display:"flex", height:"100vh", alignItems:"center", justifyContent:"center", background:"var(--bg-base)" }}>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:32, marginBottom:12 }}>⚡</div>
          <div style={{ fontSize:13, color:"var(--text-secondary)" }}>Loading Business Hub…</div>
        </div>
      </div>
    );
  }

  return (
    <>
      {children}
      <CheckInModal
        open={showModal}
        onClose={canDefer ? handleDefer : () => {}} // if mandatory, close does nothing
        onComplete={handleComplete}
        canDefer={canDefer}
      />
    </>
  );
}
