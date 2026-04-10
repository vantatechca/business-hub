"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import CheckInModal from "./CheckInModal";

interface CheckInGateProps {
  children: React.ReactNode;
}

const DEFER_KEY = (userId: string, date: string) => `ci_deferred_${userId}_${date}`;
const DONE_KEY  = (userId: string, date: string) => `ci_done_${userId}_${date}`;

/**
 * Check whether the user has completed their check-in today.
 * Used by both CheckInGate and Layout (for the logout prompt).
 */
export function hasCheckedInToday(userId: string | undefined): boolean {
  if (!userId || typeof window === "undefined") return true;
  const today = new Date().toISOString().slice(0, 10);
  return localStorage.getItem(DONE_KEY(userId, today)) === "1";
}

export default function CheckInGate({ children }: CheckInGateProps) {
  const { data: session, status } = useSession();
  const [showModal,   setShowModal]   = useState(false);
  const [canDefer,    setCanDefer]    = useState(true);
  const [ready,       setReady]       = useState(false);
  const [checkedIn,   setCheckedIn]   = useState(false);

  const userId = (session?.user as { id?: string })?.id;
  const role   = (session?.user as { role?: string })?.role;
  const requiresCheckin = (session?.user as { requiresCheckin?: boolean })?.requiresCheckin;
  const today  = new Date().toISOString().slice(0, 10);

  const exemptRole = role === "super_admin" || role === "admin";
  const shouldGate = !exemptRole && requiresCheckin === true;

  useEffect(() => {
    if (status !== "authenticated" || !userId) return;
    if (!shouldGate) {
      setReady(true);
      setCheckedIn(true);
      return;
    }

    const doneKey   = DONE_KEY(userId, today);
    const deferKey  = DEFER_KEY(userId, today);

    if (typeof window !== "undefined" && localStorage.getItem(doneKey)) {
      setReady(true);
      setCheckedIn(true);
      return;
    }

    fetch(`/api/checkin?userId=${userId}&date=${today}`)
      .then(r => r.json())
      .then(d => {
        if (d.data && d.data.length > 0) {
          if (typeof window !== "undefined") localStorage.setItem(doneKey, "1");
          setReady(true);
          setCheckedIn(true);
          return;
        }
        const alreadyDeferred = typeof window !== "undefined" && localStorage.getItem(deferKey);
        setCanDefer(!alreadyDeferred);
        setShowModal(true);
        setReady(true);
        // NOT checked in — leave checkedIn false
      })
      .catch(() => {
        setReady(true);
        setShowModal(true);
      });
  }, [status, userId, today, shouldGate]);

  // ── beforeunload: warn if leaving without check-in ──
  const handleBeforeUnload = useCallback((e: BeforeUnloadEvent) => {
    if (!checkedIn && shouldGate) {
      e.preventDefault();
      // Modern browsers show a generic "leave site?" dialog
    }
  }, [checkedIn, shouldGate]);

  useEffect(() => {
    if (!shouldGate || checkedIn) return;
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [shouldGate, checkedIn, handleBeforeUnload]);

  const handleDefer = () => {
    if (!userId) return;
    if (typeof window !== "undefined") localStorage.setItem(DEFER_KEY(userId, today), "1");
    setShowModal(false);
  };

  const handleComplete = () => {
    if (!userId) return;
    if (typeof window !== "undefined") localStorage.setItem(DONE_KEY(userId, today), "1");
    setCheckedIn(true);
    setShowModal(false);
  };

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
        onClose={canDefer ? handleDefer : () => {}}
        onComplete={handleComplete}
        canDefer={canDefer}
      />
    </>
  );
}
