"use client";

import {
  Bell,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  FileText,
  Palette,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import WorkspaceShell from "../workspace/workspace-shell";
import "./settings-workspace.css";

type ToggleKey = "new-intake" | "calendar" | "digest" | "weekly" | "autosave" | "review" | "mfa";
type SectionKey = "profile" | "appearance" | "notifications" | "documents" | "security";

type SettingSection = {
  key: SectionKey;
  title: string;
  description: string;
  icon: typeof Bell;
};

const sections: SettingSection[] = [
  { key: "profile", title: "Workspace profile", description: "Lawyer identity and default matter context", icon: BriefcaseBusiness },
  { key: "appearance", title: "Appearance", description: "Readability, density, and review comfort", icon: Palette },
  { key: "notifications", title: "Notifications", description: "Alerts for new intake, schedule, and digest", icon: Bell },
  { key: "documents", title: "Document defaults", description: "Drafting workflow and save preferences", icon: FileText },
  { key: "security", title: "Security", description: "Account protection and session controls", icon: ShieldCheck },
];

export default function SettingsWorkspace() {
  const [search, setSearch] = useState("");
  const [activeSection, setActiveSection] = useState<SectionKey>("profile");
  const [toast, setToast] = useState("");
  const [identity, setIdentity] = useState<{ displayName: string; email: string | null; imageUrl: string } | null>(null);
  const [specialty, setSpecialty] = useState("");
  const [bio, setBio] = useState("");
  const [listed, setListed] = useState(false);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const [toggles, setToggles] = useState<Record<ToggleKey, boolean>>({
    "new-intake": true,
    calendar: true,
    digest: false,
    weekly: true,
    autosave: true,
    review: true,
    mfa: true,
  });

  const filteredSections = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sections;

    return sections.filter(({ title, description }) =>
      [title, description].join(" ").toLowerCase().includes(query),
    );
  }, [search]);

  const currentSection = filteredSections.find(({ key }) => key === activeSection) ?? filteredSections[0] ?? sections[0];

  const toggleSetting = (key: ToggleKey) => {
    setToggles((current) => ({ ...current, [key]: !current[key] }));
  };

  const unavailable = (label: string) => setToast(`${label} is not part of this demo yet.`);

  useEffect(() => {
    let active = true;
    fetch("/api/citizen/directory-profile", { cache: "no-store" })
      .then((response) => response.json().then((body) => ({ ok: response.ok, body })))
      .then(({ ok, body }) => {
        if (!active) return;
        if (!ok) throw new Error(body?.error ?? "Unable to load your profile.");
        setIdentity(body.identity ?? null);
        setSpecialty(body.profile?.specialty ?? "");
        setBio(body.profile?.bio ?? "");
        setListed(Boolean(body.profile?.listed));
      })
      .catch((error: unknown) => {
        if (active) setToast(error instanceof Error ? error.message : "Unable to load your profile.");
      })
      .finally(() => { if (active) setIsProfileLoading(false); });
    return () => { active = false; };
  }, []);

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsProfileSaving(true);
    try {
      const response = await fetch("/api/citizen/directory-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specialty, bio, listed }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Unable to save your profile.");
      setSpecialty(body.profile.specialty);
      setBio(body.profile.bio);
      setToast("Profile saved.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to save your profile.");
    } finally {
      setIsProfileSaving(false);
    }
  };

  return (
    <WorkspaceShell
      activePage="Settings"
      search={search}
      onSearchChange={setSearch}
      onUnavailable={unavailable}
      searchPlaceholder="Search settings..."
      searchLabel="Search settings"
    >
      <main className="dashboard settings-page">
        <div className="settings-header">
          <div>
            <p className="eyebrow">Workspace preferences</p>
            <h1>Settings</h1>
          </div>
          <div className="settings-actions">
            <button type="button" className="secondary-button" onClick={() => unavailable("Reset to defaults")}>
              Reset to defaults
            </button>
            <button type="button" className="primary-button" onClick={() => unavailable("Save settings")}>
              Save changes
            </button>
          </div>
        </div>

        <div className="settings-layout">
          <aside className="settings-nav" aria-label="Settings categories">
            {filteredSections.length > 0 ? (
              filteredSections.map(({ key, title, description, icon: Icon }) => (
                <button
                  type="button"
                  key={key}
                  className={`settings-nav-item${activeSection === key ? " is-active" : ""}`}
                  onClick={() => setActiveSection(key)}
                >
                  <span className="settings-nav-icon"><Icon aria-hidden="true" size={10.05} /></span>
                  <span>
                    <strong>{title}</strong>
                    <small>{description}</small>
                  </span>
                  <ChevronRight aria-hidden="true" size={10.05} />
                </button>
              ))
            ) : (
              <div className="settings-empty">
                <Sparkles aria-hidden="true" size={11.39} />
                <p>No matching settings.</p>
              </div>
            )}
          </aside>

          <section className="settings-content" aria-label="Account settings">
            {currentSection.key === "profile" && (
              <form className="settings-card settings-card--wide" onSubmit={saveProfile}>
                <div className="settings-card-header">
                  <div>
                    <p className="eyebrow">Profile</p>
                    <h2>Lawyer account</h2>
                  </div>
                </div>

                <div className="profile-summary">
                  {identity?.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="profile-avatar" src={identity.imageUrl} alt="" />
                  ) : (
                    <div className="profile-avatar" aria-hidden="true">{(identity?.displayName || "L").charAt(0).toUpperCase()}</div>
                  )}
                  <div className="profile-copy">
                    <strong>{isProfileLoading ? "Loading..." : identity?.displayName || "Unnamed account"}</strong>
                    <span>{identity?.email ?? "Signed in with Clerk"}</span>
                  </div>
                </div>
                <p className="profile-note">
                  Your name, email, and photo come from your Clerk account. Change them from the account menu
                  (Manage account) and they update here and in the citizen directory.
                </p>

                <div className="profile-form">
                  <label>
                    <span>Specialty <small>(required to open Messages)</small></span>
                    <input
                      required
                      minLength={2}
                      maxLength={100}
                      value={specialty}
                      disabled={isProfileLoading}
                      onChange={(event) => setSpecialty(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Short introduction</span>
                    <textarea
                      maxLength={600}
                      rows={3}
                      value={bio}
                      disabled={isProfileLoading}
                      onChange={(event) => setBio(event.target.value)}
                    />
                  </label>
                  <button type="submit" className="primary-button" disabled={isProfileLoading || isProfileSaving}>
                    {isProfileSaving ? "Saving..." : "Save profile"}
                  </button>
                </div>
              </form>
            )}

            {currentSection.key === "appearance" && (
              <div className="settings-card">
                <div className="settings-card-header">
                  <div>
                    <p className="eyebrow">Appearance</p>
                    <h2>Readability and layout</h2>
                  </div>
                </div>

                <div className="appearance-list">
                  <div className="appearance-row">
                    <div>
                      <strong>Workspace density</strong>
                      <small>Comfortable spacing for deep queue review</small>
                    </div>
                    <span className="pill-control">Comfort</span>
                  </div>
                  <div className="appearance-row">
                    <div>
                      <strong>Text emphasis</strong>
                      <small>Keep matter details crisp and easy to scan</small>
                    </div>
                    <span className="pill-control">Balanced</span>
                  </div>
                  <div className="appearance-row">
                    <div>
                      <strong>Review focus</strong>
                      <small>Reduced visual noise for intake triage</small>
                    </div>
                    <span className="pill-control">On</span>
                  </div>
                </div>
              </div>
            )}

            {currentSection.key === "notifications" && (
              <div className="settings-card">
                <div className="settings-card-header">
                  <div>
                    <p className="eyebrow">Notifications</p>
                    <h2>Alerts</h2>
                  </div>
                </div>

                <div className="toggle-list">
                  <label className="toggle-row">
                    <span>
                      <strong>New intake alerts</strong>
                      <small>Notify when a new matter enters the queue</small>
                    </span>
                    <button type="button" className={`toggle-switch${toggles["new-intake"] ? " is-on" : ""}`} aria-pressed={toggles["new-intake"]} onClick={() => toggleSetting("new-intake")}>
                      <span />
                    </button>
                  </label>

                  <label className="toggle-row">
                    <span>
                      <strong>Calendar reminders</strong>
                      <small>Upcoming consults, deadlines, and hearings</small>
                    </span>
                    <button type="button" className={`toggle-switch${toggles.calendar ? " is-on" : ""}`} aria-pressed={toggles.calendar} onClick={() => toggleSetting("calendar")}>
                      <span />
                    </button>
                  </label>

                  <label className="toggle-row">
                    <span>
                      <strong>Digest summaries</strong>
                      <small>Daily summary for queue churn and client activity</small>
                    </span>
                    <button type="button" className={`toggle-switch${toggles.digest ? " is-on" : ""}`} aria-pressed={toggles.digest} onClick={() => toggleSetting("digest")}>
                      <span />
                    </button>
                  </label>

                  <label className="toggle-row">
                    <span>
                      <strong>Weekly review email</strong>
                      <small>Performance notes and workstream highlights</small>
                    </span>
                    <button type="button" className={`toggle-switch${toggles.weekly ? " is-on" : ""}`} aria-pressed={toggles.weekly} onClick={() => toggleSetting("weekly")}>
                      <span />
                    </button>
                  </label>
                </div>
              </div>
            )}

            {currentSection.key === "documents" && (
              <div className="settings-card">
                <div className="settings-card-header">
                  <div>
                    <p className="eyebrow">Document defaults</p>
                    <h2>Drafting workflow</h2>
                  </div>
                </div>

                <div className="toggle-list">
                  <label className="toggle-row">
                    <span>
                      <strong>Autosave drafts</strong>
                      <small>Keep assembly progress updated every few minutes</small>
                    </span>
                    <button type="button" className={`toggle-switch${toggles.autosave ? " is-on" : ""}`} aria-pressed={toggles.autosave} onClick={() => toggleSetting("autosave")}>
                      <span />
                    </button>
                  </label>

                  <label className="toggle-row">
                    <span>
                      <strong>Review before finalizing</strong>
                      <small>Prompt before sending or exporting a draft</small>
                    </span>
                    <button type="button" className={`toggle-switch${toggles.review ? " is-on" : ""}`} aria-pressed={toggles.review} onClick={() => toggleSetting("review")}>
                      <span />
                    </button>
                  </label>
                </div>
              </div>
            )}

            {currentSection.key === "security" && (
              <div className="settings-card">
                <div className="settings-card-header">
                  <div>
                    <p className="eyebrow">Security</p>
                    <h2>Account protection</h2>
                  </div>
                </div>

                <div className="security-panel">
                  <div className="security-row">
                    <div>
                      <strong>Multi-factor authentication</strong>
                      <small>Required for privileged access and billing changes</small>
                    </div>
                    <button type="button" className={`toggle-switch${toggles.mfa ? " is-on" : ""}`} aria-pressed={toggles.mfa} onClick={() => toggleSetting("mfa")}>
                      <span />
                    </button>
                  </div>

                  <div className="security-row">
                    <div>
                      <strong>Session timeout</strong>
                      <small>30 minutes of inactivity</small>
                    </div>
                    <button type="button" className="text-button" onClick={() => unavailable("Session timeout")}>Edit</button>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>

      {toast && (
        <div className="toast" role="status">
          <span className="toast-check"><Check size={10.72} /></span>
          <span>{toast}</span>
          <button className="toast-close" type="button" aria-label="Dismiss notification" onClick={() => setToast("")}>
            <X size={10.72} />
          </button>
        </div>
      )}
    </WorkspaceShell>
  );
}
