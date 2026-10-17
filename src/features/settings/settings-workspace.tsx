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
import { useMemo, useState } from "react";
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
              <div className="settings-card settings-card--wide">
                <div className="settings-card-header">
                  <div>
                    <p className="eyebrow">Profile</p>
                    <h2>Lawyer account</h2>
                  </div>
                  <button type="button" className="text-button" onClick={() => unavailable("Profile management")}>
                    Edit profile
                  </button>
                </div>

                <div className="profile-summary">
                  <div className="profile-avatar" aria-label="Lawyer initial">J</div>
                  <div className="profile-copy">
                    <strong>Atty. Juan Dela Cruz</strong>
                    <span>Managing partner · BatasGO workspace</span>
                  </div>
                  <div className="profile-badge">Active</div>
                </div>

                <div className="detail-grid">
                  <div>
                    <label>Email</label>
                    <p>juan.delacruz@batasgo.ph</p>
                  </div>
                  <div>
                    <label>Primary specialization</label>
                    <p>Labor &amp; employment litigation</p>
                  </div>
                  <div>
                    <label>Default intake queue</label>
                    <p>Priority review · 24h turnaround</p>
                  </div>
                </div>
              </div>
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
