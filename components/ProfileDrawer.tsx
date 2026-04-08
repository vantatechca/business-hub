"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { X } from "lucide-react";
import { Avatar, FormField, HubInput, HubSelect, HubTextarea, useToast, ToastList } from "@/components/ui/shared";
import { getInitials } from "@/lib/types";
import type { UserProfile } from "@/lib/types";

// Client-side copies of the role predicates. lib/authz.ts imports
// server-only helpers (getServerSession, NextResponse), so importing it here
// would pull those into the client bundle. The predicates are pure anyway.
const canViewOthersProfile = (role: string | undefined | null) =>
  role === "manager" || role === "leader" || role === "admin" || role === "super_admin";
const canEditOthersProfile = (role: string | undefined | null) =>
  role === "super_admin";

const TZONES = ["America/Toronto", "America/New_York", "America/Chicago", "America/Los_Angeles", "Europe/Paris", "Asia/Manila"];

interface MinimalHint {
  name: string;
  email: string;
  role: string;
  initials: string;
  departments?: Array<{ id: string; name: string; color?: string; roleInDept?: string }>;
}

interface Props {
  userId: string | null;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  // For leads clicking on a team card — they can't view the full profile,
  // but we still show the basic public info (name, role, departments) from
  // the already-loaded team row.
  minimalHint?: MinimalHint;
}

// Slide-out profile drawer used from the Team and Users pages. Role-gated:
//
//   super_admin → full profile + edit
//   admin       → full profile, read-only
//   manager     → full profile, read-only
//   lead        → minimal card only (name + role + departments)
//   member      → no drawer (parent shouldn't render it)
//
// The parent page decides whether to open the drawer at all; this component
// just enforces the view/edit distinction once it's rendered.
export default function ProfileDrawer({ userId, open, onClose, onSaved, minimalHint }: Props) {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role ?? "member";
  const canView = canViewOthersProfile(role);
  const canEdit = canEditOthersProfile(role);
  // Leads get a minimal card (name/role/departments) with no body fields.
  const minimalOnly = !canView && role === "lead";

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { ts, toast } = useToast();

  useEffect(() => {
    if (!open || !userId) return;
    // Even leads fetch the profile — the API filters down to a minimal row
    // for them (404 for full fields, 200 for the basics via the team list).
    // For simplicity we only hit the profile endpoint when the viewer has
    // canView, and otherwise rely on the parent to pass a minimal summary.
    if (!canView && !canEdit) return;
    setLoading(true);
    fetch(`/api/users/${userId}/profile`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { toast(d.error, "er"); return; }
        setProfile(d.data);
      })
      .finally(() => setLoading(false));
  }, [open, userId, canView, canEdit, toast]);

  const save = async () => {
    if (!profile || !canEdit) return;
    setSaving(true);
    const res = await fetch(`/api/users/${profile.id}/profile`, {
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
        requiresCheckin: profile.requiresCheckin,
        birthdayNotifications: profile.birthdayNotifications,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      return toast(e.error || "Save failed", "er");
    }
    toast("Profile saved");
    onSaved?.();
  };

  if (!open) return null;

  return (
    <>
      <ToastList ts={ts} />
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 500 }}
      />
      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 460,
          maxWidth: "100vw",
          background: "var(--bg-card)",
          borderLeft: "1px solid var(--border-card)",
          boxShadow: "var(--shadow-modal)",
          zIndex: 600,
          display: "flex",
          flexDirection: "column",
          animation: "drawerSlide .18s ease-out",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid var(--border-divider)" }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)" }}>
            {minimalOnly ? "Team Member" : canEdit ? "Edit Profile" : "Profile"}
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", display: "flex" }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px" }}>
          {minimalOnly && (
            <div>
              {minimalHint && (
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
                  <Avatar s={minimalHint.initials} size={52} />
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>{minimalHint.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", textTransform: "capitalize" }}>
                      {minimalHint.role.replace("_", " ")}
                    </div>
                    {minimalHint.departments && minimalHint.departments.length > 0 && (
                      <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                        {minimalHint.departments.map(d => (
                          <span key={d.id} style={{ fontSize: 9, padding: "2px 7px", borderRadius: 5, background: (d.color ?? "#5b8ef8") + "22", color: d.color ?? "var(--accent)", fontWeight: 700 }}>
                            {d.name}{d.roleInDept === "lead" ? " · Lead" : ""}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div style={{ padding: "14px 16px", borderRadius: 10, background: "var(--bg-input)", border: "1px solid var(--border-card)", fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                <div style={{ fontSize: 13 }}>🔒 <strong style={{ color: "var(--text-primary)" }}>Limited view</strong></div>
                <div style={{ marginTop: 4 }}>
                  Only managers, admins, and the super admin can see full profile details (bio, skills, address, etc.). Ask your admin if you need to see more.
                </div>
              </div>
            </div>
          )}

          {(canView || canEdit) && loading && (
            <div className="skeleton" style={{ height: 360, borderRadius: 10 }} />
          )}

          {(canView || canEdit) && !loading && profile && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
                <Avatar s={getInitials(profile.name)} size={52} />
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>{profile.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", textTransform: "capitalize" }}>
                    {profile.role.replace("_", " ")} · {profile.email}
                  </div>
                  {profile.departments && profile.departments.length > 0 && (
                    <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                      {profile.departments.map(d => (
                        <span key={d.id} style={{ fontSize: 9, padding: "2px 7px", borderRadius: 5, background: (d.color ?? "#5b8ef8") + "22", color: d.color ?? "var(--accent)", fontWeight: 700 }}>
                          {d.name}{d.roleInDept === "lead" ? " · Lead" : ""}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {canEdit ? (
                <>
                  <FormField label="Full Name">
                    <HubInput value={profile.name} onChange={e => setProfile(p => p ? { ...p, name: e.target.value } : p)} />
                  </FormField>
                  <FormField label="Email">
                    <HubInput type="email" value={profile.email} onChange={e => setProfile(p => p ? { ...p, email: e.target.value } : p)} />
                  </FormField>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <FormField label="Job Title">
                      <HubInput value={profile.jobTitle ?? ""} onChange={e => setProfile(p => p ? { ...p, jobTitle: e.target.value } : p)} />
                    </FormField>
                    <FormField label="Pronouns">
                      <HubInput value={profile.pronouns ?? ""} onChange={e => setProfile(p => p ? { ...p, pronouns: e.target.value } : p)} />
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
                    <HubTextarea rows={3} value={profile.bio ?? ""} onChange={e => setProfile(p => p ? { ...p, bio: e.target.value } : p)} />
                  </FormField>
                  <FormField label="Skills">
                    <HubTextarea rows={2} value={profile.skills ?? ""} onChange={e => setProfile(p => p ? { ...p, skills: e.target.value } : p)} />
                  </FormField>
                  <FormField label="Hobbies">
                    <HubTextarea rows={2} value={profile.hobbies ?? ""} onChange={e => setProfile(p => p ? { ...p, hobbies: e.target.value } : p)} />
                  </FormField>
                  <FormField label="Favorite Quote">
                    <HubTextarea rows={2} value={profile.favoriteQuote ?? ""} onChange={e => setProfile(p => p ? { ...p, favoriteQuote: e.target.value } : p)} />
                  </FormField>

                  <div style={{ marginTop: 10, marginBottom: 12, padding: "12px 14px", borderRadius: 10, background: "var(--bg-input)", border: "1px solid var(--border-card)" }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)", letterSpacing: ".07em", marginBottom: 8 }}>PREFERENCES</div>
                    <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12, color: "var(--text-primary)", marginBottom: 6, cursor: "pointer" }}>
                      <input type="checkbox" checked={!!profile.requiresCheckin} onChange={e => setProfile(p => p ? { ...p, requiresCheckin: e.target.checked } : p)} />
                      Requires daily check-in
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12, color: "var(--text-primary)", cursor: "pointer" }}>
                      <input type="checkbox" checked={!!profile.birthdayNotifications} onChange={e => setProfile(p => p ? { ...p, birthdayNotifications: e.target.checked } : p)} />
                      Show in birthday notifications
                    </label>
                  </div>
                </>
              ) : (
                // Read-only view for admin + manager
                <>
                  <ReadOnlyField label="Job Title" value={profile.jobTitle} />
                  <ReadOnlyField label="Pronouns"  value={profile.pronouns} />
                  <ReadOnlyField label="Birthday"  value={profile.birthday} />
                  <ReadOnlyField label="Timezone"  value={profile.timezone} />
                  <ReadOnlyField label="Phone"     value={profile.phone} />
                  <ReadOnlyField label="Address"   value={profile.address} />
                  <ReadOnlyField label="Bio"       value={profile.bio} multiline />
                  <ReadOnlyField label="Skills"    value={profile.skills} multiline />
                  <ReadOnlyField label="Hobbies"   value={profile.hobbies} multiline />
                  <ReadOnlyField label="Favorite Quote" value={profile.favoriteQuote} multiline />
                </>
              )}
            </>
          )}
        </div>

        {canEdit && profile && (
          <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border-divider)", display: "flex", justifyContent: "flex-end", gap: 9 }}>
            <button onClick={onClose} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
            <button
              onClick={save}
              disabled={saving}
              style={{ padding: "7px 14px", borderRadius: 8, background: "var(--accent)", color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1 }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </div>
      <style>{`@keyframes drawerSlide { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>
    </>
  );
}

function ReadOnlyField({ label, value, multiline }: { label: string; value?: string | null; multiline?: boolean }) {
  if (!value) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text-muted)", letterSpacing: ".07em", marginBottom: 4 }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 12, color: "var(--text-primary)", whiteSpace: multiline ? "pre-wrap" : "normal" }}>{value}</div>
    </div>
  );
}
