"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Bell,
  Bot,
  CalendarDays,
  ChevronDown,
  Clock3,
  FilePenLine,
  Inbox,
  Mail,
  Menu,
  Search,
  Settings,
  UserRound,
  ListChecks,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import logo from "../../../assets/batasgo_logo.png";
import collapsedLogo from "../../../assets/batasgo_collapsed.png";
import "../triage/triage-dashboard.css";

const navItems = [
  { label: "Case Overview", icon: Inbox, href: "/dashboard" },
  { label: "Messages", icon: Mail, href: "/messages" },
  { label: "Calendar", icon: CalendarDays, href: "/calendar" },
  { label: "Tasks", icon: ListChecks, href: "/tasks" },
  { label: "Document Assembly", icon: FilePenLine, href: "/documents" },
  { label: "BatasBot", icon: Bot, href: "/batasbot" },
  { label: "Settings", icon: Settings, href: "/settings" },
];

type WorkspacePage = "Case Overview" | "BatasBot" | "Document Assembly" | "Calendar" | "Messages" | "Tasks" | "Settings";
type Popover = "notifications" | "profile" | null;

export default function WorkspaceShell({
  activePage,
  children,
  search,
  onSearchChange,
  onUnavailable,
  searchPlaceholder = "Search matters and messages...",
  searchLabel = "Search matters and messages",
  compactNavigation = false,
}: {
  activePage: WorkspacePage;
  children: React.ReactNode;
  search: string;
  onSearchChange: (value: string) => void;
  onUnavailable: (label: string) => void;
  searchPlaceholder?: string;
  searchLabel?: string;
  compactNavigation?: boolean;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [popover, setPopover] = useState<Popover>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className={`workspace${compactNavigation ? " workspace--compact-navigation" : ""}`}>
      <button
        className={`mobile-scrim${sidebarOpen ? " is-visible" : ""}`}
        aria-label="Close navigation"
        onClick={closeSidebar}
        tabIndex={sidebarOpen ? 0 : -1}
      />
      <aside className={`sidebar${sidebarOpen ? " sidebar--open" : ""}`}>
        <Link className="brand" href="/dashboard" aria-label="BatasGO home" onClick={closeSidebar} title="BatasGO">
          <Image src={compactNavigation ? collapsedLogo : logo} alt="BatasGO" priority />
        </Link>
        <nav className="primary-nav" aria-label="Main navigation">
          {navItems.map(({ label, icon: Icon, href }) => {
            const active = label === activePage;
            const className = `nav-item${active ? " nav-item--active" : ""}`;

            return href ? (
              <Link
                className={className}
                href={href}
                key={label}
                aria-current={active ? "page" : undefined}
                onClick={closeSidebar}
                title={compactNavigation ? label : undefined}
              >
                <Icon aria-hidden="true" size={18} strokeWidth={2.5} />
                <span>{label}</span>
              </Link>
            ) : (
              <button
                className={className}
                key={label}
                type="button"
                title={compactNavigation ? label : undefined}
                onClick={() => {
                  closeSidebar();
                  onUnavailable(label);
                }}
              >
                <Icon aria-hidden="true" size={18} strokeWidth={2.5} />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>
        <section className="subscription">
          <div className="subscription-copy">
            <strong>Bataser Pro</strong>
            <span>Next renewal: Mar 12, 2024</span>
          </div>
          <button className="subscription-button" type="button" onClick={() => onUnavailable("Subscription management")}>
            Manage Subscription
          </button>
        </section>
      </aside>

      <div className="app-column">
        <header className="topbar">
          <button className="icon-button mobile-menu" type="button" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}>
            <Menu size={20} />
          </button>
          <label className="global-search">
            <Search aria-hidden="true" size={18} />
            <span className="sr-only">{searchLabel}</span>
            <input
              ref={searchInputRef}
              type="search"
              placeholder={searchPlaceholder}
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
            />
            <kbd>Ctrl K</kbd>
          </label>
          <div className="topbar-actions">
            <div className="popover-anchor">
              <button
                className="icon-button notification-button"
                type="button"
                aria-label="Notifications, 3 unread"
                aria-expanded={popover === "notifications"}
                onClick={() => setPopover(popover === "notifications" ? null : "notifications")}
              >
                <Bell size={19} />
                <span className="notification-count">3</span>
              </button>
              {popover === "notifications" && (
                <div className="popover notification-popover" role="region" aria-label="Notifications">
                  <div className="popover-heading"><strong>Notifications</strong><span>3 new</span></div>
                  <p><b>New urgent intake</b><span>Labor &amp; Employment · 3 minutes ago</span></p>
                  <p><b>Consultation reminder</b><span>Contract Mediation · Today, 2:30 PM</span></p>
                  <p><b>New client message</b><span>Client Case #0847 · 4 minutes ago</span></p>
                </div>
              )}
            </div>
            <div className="popover-anchor">
              <button
                className="profile-button"
                type="button"
                aria-expanded={popover === "profile"}
                onClick={() => setPopover(popover === "profile" ? null : "profile")}
              >
                <span className="profile-avatar"><UserRound size={17} /></span>
                <span>Atty. Juan Dela Cruz</span>
                <ChevronDown aria-hidden="true" size={15} />
              </button>
              {popover === "profile" && (
                <div className="popover profile-popover" role="region" aria-label="Account menu">
                  <strong>Atty. Juan Dela Cruz</strong>
                  <span>Sample lawyer account</span>
                  <button type="button" onClick={() => { setPopover(null); onUnavailable("Account settings"); }}>
                    <Settings size={15} /> Account settings
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
