"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import AppLayout from "@/components/Layout";
import { Avatar, FormField, HubInput, HubSelect, HubTextarea, useToast, ToastList } from "@/components/ui/shared";
import { getInitials } from "@/lib/types";

const TZONES = ["America/Toronto", "America/New_York", "America/Chicago", "America/Los_Angeles", "Europe/Paris", "Asia/Manila"];

interface Profile {
  id: string;
  email: string;
  name: string;
  role: string;
  timezone?: string;
  birthday?: string | null;
  jobTitle?: string | null;
  address?: string | null;
  phone?: string | null;
  skills?: string | null;
  hobbies?: string | null;
  favoriteQuote?: string | null;
  bio?: string | null;
  pronouns?: string | null;
  mustChangePassword?: boolean;
  departments?: Array<{ id: string; name: string; color?: string; roleInDept?: string }>;
}

export default function ProfilePageWrapper() {
  // useSearchParams() in an app-router client component requires a Suspense
  // boundary. Wrap the inner page in one so the build doesn't bail out of
  // SSG with "missing suspense with CSR bailout".
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)" }}>Loading…</div>}>
      <ProfilePage />
    </Suspense>
  );
}

function ProfilePage() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const forceChange = searchParams.get("force") === "1";

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const { ts, toast } = useToast();

  const load = () => {
    setLoading(true);
    fetch("/api/profile")
      .then(r => r.json())
      .then(d => { setProfile(d.data ?? null); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!profile) return;
    setSaving(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: profile.name,
        email: profile.email,
        timezone: profile.timezone,
        birthday: profile.birthday,
        jobTitle: profile.jobTitle,
        address: profile.address,
        phone: profile.phone,
        skills: profile.skills,
        hobbies: profile.hobbies,
        favoriteQuote: profile.favoriteQuote,
        bio: profile.bio,
        pronouns: profile.pronouns,
      }),
    });
    setSaving(false);
    if (!res.ok) { const e = await res.json().catch(() => ({})); toast(e.error || "Save failed", "er"); return; }
    toast("Profile saved");
    load();
  };

  const changePassword = async () => {
    if (newPw.length < 6) return toast("Password must be at least 6 characters", "er");
    if (newPw !== confirmPw) return toast("Passwords do not match", "er");
    setPwSaving(true);
    const res = await fetch("/api/profile/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
    });
    setPwSaving(false);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      return toast(e.error || "Password change failed", "er");
    }
    toast("Password updated");
    setCurrentPw(""); setNewPw(""); setConfirmPw("");
    // Refresh the session so mustChangePassword clears and middleware stops
    // redirecting us back here.
    await update();
    if (forceChange) router.push("/dashboard");
  };

  // ── FORCED PASSWORD CHANGE SCREEN ───────────────────────────
  // Shown when the user lands on /profile?force=1 (first login after
  // creation or after an admin reset). We hide the normal profile form
  // completely — they must change the password before doing anything else.
  if (forceChange || session?.user?.mustChangePassword) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "var(--bg-base)", padding: 20 }}>
        <ToastList ts={ts} />
        <div className="hub-card" style={{ maxWidth: 420, width: "100%", padding: 28 }}>
          <div style={{ textAlign: "center", marginBottom: 18 }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🔐</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)", marginBottom: 6 }}>Change Your Password</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
              You need to set a new password before continuing. This is required on first login and after an admin password reset.
            </div>
          </div>
          <FormField label="New Password">
            <HubInput type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="At least 6 characters" autoFocus />
          </FormField>
          <FormField label="Confirm New Password">
            <HubInput type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} />
          </FormField>
          <button
            onClick={changePassword}
            disabled={pwSaving}
            style={{ width: "100%", padding: "10px 14px", borderRadius: 8, background: "var(--accent)", color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: pwSaving ? "not-allowed" : "pointer", opacity: pwSaving ? 0.6 : 1 }}
          >
            {pwSaving ? "Saving…" : "Change Password"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <AppLayout title="My Profile">
      <ToastList ts={ts} />
      {loading || !profile ? (
        <div className="skeleton" style={{ height: 400, borderRadius: 12 }} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14, maxWidth: 820 }}>
          {/* Identity card */}
          <div className="hub-card" style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
              <Avatar s={getInitials(profile.name)} size={56} />
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)" }}>{profile.name}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", textTransform: "capitalize" }}>{profile.role.replace("_", " ")} · {profile.email}</div>
                {profile.departments && profile.departments.length > 0 && (
                  <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                    {profile.departments.map(d => (
                      <span key={d.id} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 5, background: (d.color ?? "#5b8ef8") + "22", color: d.color ?? "var(--accent)", fontWeight: 700 }}>
                        {d.name}{d.roleInDept === "lead" ? " · Lead" : ""}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <FormField label="Full Name">
                <HubInput value={profile.name} onChange={e => setProfile(p => p ? { ...p, name: e.target.value } : p)} />
              </FormField>
              <FormField label="Email">
                <HubInput type="email" value={profile.email} onChange={e => setProfile(p => p ? { ...p, email: e.target.value } : p)} />
              </FormField>
              <FormField label="Job Title">
                <HubInput value={profile.jobTitle ?? ""} onChange={e => setProfile(p => p ? { ...p, jobTitle: e.target.value } : p)} />
              </FormField>
              <FormField label="Pronouns">
                <HubInput value={profile.pronouns ?? ""} onChange={e => setProfile(p => p ? { ...p, pronouns: e.target.value } : p)} placeholder="e.g. they/them" />
              </FormField>
              <FormField label="Birthday">
                <HubInput type="date" value={profile.birthday ?? ""} onChange={e => setProfile(p => p ? { ...p, birthday: e.target.value } : p)} />
              </FormField>
              <FormField label="Timezone">
                <HubSelect value={profile.timezone ?? "America/Toronto"} onChange={e => setProfile(p => p ? { ...p, timezone: e.target.value } : p)}>
                  {TZONES.map(t => <option key={t} value={t}>{t}</option>)}
                </HubSelect>
              </FormField>
              <FormField label="Phone">
                <HubInput value={profile.phone ?? ""} onChange={e => setProfile(p => p ? { ...p, phone: e.target.value } : p)} />
              </FormField>
              <FormField label="Address">
                <HubInput value={profile.address ?? ""} onChange={e => setProfile(p => p ? { ...p, address: e.target.value } : p)} />
              </FormField>
            </div>

            <FormField label="Bio">
              <HubTextarea rows={3} value={profile.bio ?? ""} onChange={e => setProfile(p => p ? { ...p, bio: e.target.value } : p)} placeholder="A short introduction…" />
            </FormField>
            <FormField label="Skills">
              <HubTextarea rows={2} value={profile.skills ?? ""} onChange={e => setProfile(p => p ? { ...p, skills: e.target.value } : p)} placeholder="TypeScript, product design, …" />
            </FormField>
            <FormField label="Hobbies">
              <HubTextarea rows={2} value={profile.hobbies ?? ""} onChange={e => setProfile(p => p ? { ...p, hobbies: e.target.value } : p)} placeholder="Cycling, cooking, board games…" />
            </FormField>
            <FormField label="Favorite Quote">
              <HubTextarea rows={2} value={profile.favoriteQuote ?? ""} onChange={e => setProfile(p => p ? { ...p, favoriteQuote: e.target.value } : p)} />
            </FormField>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
              <button
                onClick={save}
                disabled={saving}
                style={{ padding: "8px 16px", borderRadius: 8, background: "var(--accent)", color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1 }}
              >
                {saving ? "Saving…" : "Save Profile"}
              </button>
            </div>
          </div>

          {/* Password change card */}
          <div className="hub-card" style={{ padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)", marginBottom: 4 }}>Change Password</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 14 }}>
              You'll need your current password. A new password must be at least 6 characters.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <FormField label="Current Password">
                <HubInput type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} />
              </FormField>
              <FormField label="New Password">
                <HubInput type="password" value={newPw} onChange={e => setNewPw(e.target.value)} />
              </FormField>
              <FormField label="Confirm New Password">
                <HubInput type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} />
              </FormField>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={changePassword}
                disabled={pwSaving || !currentPw || !newPw}
                style={{ padding: "8px 16px", borderRadius: 8, background: "var(--accent)", color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: pwSaving ? "not-allowed" : "pointer", opacity: pwSaving || !currentPw || !newPw ? 0.6 : 1 }}
              >
                {pwSaving ? "Saving…" : "Change Password"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
