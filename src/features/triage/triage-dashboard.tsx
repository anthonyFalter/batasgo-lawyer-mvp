"use client";

import {
  ArrowDownWideNarrow,
  ArrowRight,
  Check,
  ChevronDown,
  Sparkles,
  Clock3,
  Inbox,
  Mail,
  ShieldAlert,
  X,
} from "lucide-react";
import { type CSSProperties, useEffect, useId, useMemo, useRef, useState } from "react";
import WorkspaceShell from "../workspace/workspace-shell";

type Risk = "Critical" | "High" | "Medium";
type Intake = {
  id: string;
  domain: string;
  risk: Risk;
  client: string;
  summary: string;
  received: string;
  receivedOrder: number;
  deadline: string;
  deadlineOrder: number;
};
type Decision = { intake: Intake; result: "accepted" | "declined" };
type RankedIntake = { intake: Intake; score: number; reasons: string[]; specialtyMatch: boolean };
const initialIntakes: Intake[] = [
  {
    id: "INTAKE-2024-0847",
    domain: "Labor & Employment",
    risk: "Critical",
    client: "Anonymized Client (OFW / placeholder)",
    summary:
      "Unpaid compensation, passport withholding, and constructive dismissal by an employer under a placement-based agency. Seeking urgent legal counsel.",
    received: "3 minutes ago",
    receivedOrder: 3,
    deadline: "Review now",
    deadlineOrder: 0,
  },
  {
    id: "INTAKE-2024-0932",
    domain: "Family Law",
    risk: "Medium",
    client: "Anonymized Client",
    summary:
      "Request for guidance on a family property matter and the documents needed before an initial consultation.",
    received: "21 minutes ago",
    receivedOrder: 2,
    deadline: "Closing in 3 hours",
    deadlineOrder: 3,
  },
  {
    id: "INTAKE-2024-0918",
    domain: "Civil Disputes",
    risk: "High",
    client: "Anonymized Client",
    summary:
      "A payment dispute is approaching a filing deadline. The client has shared a contract and requests an urgent case assessment.",
    received: "1 hour ago",
    receivedOrder: 1,
    deadline: "Closing in 1 hour",
    deadlineOrder: 1,
  },
];

const riskRank: Record<Risk, number> = { Critical: 3, High: 2, Medium: 1 };
const profileSpecialty = "Labor & Employment litigation";

function rankIntakesForReview(intakes: Intake[]): RankedIntake | null {
  const needSignals = [
    { pattern: /passport withholding|withheld passport/i, points: 28, reason: "Passport withholding reported" },
    { pattern: /unpaid compensation|unpaid wages|wage arrears/i, points: 24, reason: "Unpaid compensation reported" },
    { pattern: /constructive dismissal|wrongful termination|job loss/i, points: 20, reason: "Employment loss reported" },
    { pattern: /filing deadline|approaching.{0,20}deadline|due date/i, points: 24, reason: "Filing deadline approaching" },
    { pattern: /safety risk|threat|violence|eviction/i, points: 24, reason: "Immediate personal impact reported" },
  ];
  const deadlinePoints = (intake: Intake) => {
    const deadlineCopy = `${intake.deadline} ${intake.summary}`.toLowerCase();
    if (intake.deadlineOrder === 0 || /\b(now|immediate|overdue|due today)\b/.test(deadlineCopy)) return 35;
    if (intake.deadlineOrder <= 1 || /(?:within|closing in)\s+(?:1|one|2|two)\s+hours?/.test(deadlineCopy)) return 28;
    if (intake.deadlineOrder <= 3 || /filing deadline|due date|by end of day/.test(deadlineCopy)) return 15;
    return 5;
  };
  const urgencyPoints = (intake: Intake) => {
    const riskPoints = { Critical: 40, High: 28, Medium: 15 }[intake.risk];
    const recencyPoints = Math.min(intake.receivedOrder, 3) * 2;
    return riskPoints + deadlinePoints(intake) + recencyPoints;
  };
  const ranked = intakes.map((intake) => {
    const needReasons = needSignals.filter(({ pattern }) => pattern.test(intake.summary)).map(({ reason }) => reason);
    const needPoints = needSignals
      .filter(({ pattern }) => pattern.test(intake.summary))
      .reduce((total, signal) => total + signal.points, 0);
    const specialtyMatch = intake.domain.toLowerCase().includes("labor & employment");
    const needSummary = needReasons.length
      ? needReasons.slice(0, 2).join(" · ")
      : "No immediate need signals found in the summary";
    const reasons = [
      `${intake.risk} risk indicators`,
      intake.deadlineOrder === 0 ? "Review deadline: now" : intake.deadlineOrder <= 1 ? intake.deadline : "Time-sensitive follow-up",
      needSummary,
      specialtyMatch ? `Fits ${profileSpecialty}` : `Outside profile specialty: ${profileSpecialty}`,
    ];

    return {
      intake,
      score: urgencyPoints(intake) + needPoints + (specialtyMatch ? 20 : 0),
      reasons,
      specialtyMatch,
    };
  });

  return ranked.sort((a, b) =>
    b.score - a.score
    || riskRank[b.intake.risk] - riskRank[a.intake.risk]
    || a.intake.deadlineOrder - b.intake.deadlineOrder,
  )[0] ?? null;
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  tone,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  tone: "blue" | "red" | "yellow" | "neutral";
}) {
  const id = useId();
  const selectedIndex = options.findIndex((option) => option.value === value);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(Math.max(selectedIndex, 0));
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    if (!open) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);

  useEffect(() => {
    if (open) optionRefs.current[activeIndex]?.focus();
  }, [activeIndex, open]);

  const selectOption = (index: number) => {
    onChange(options[index].value);
    setActiveIndex(index);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const moveActiveOption = (index: number, direction: -1 | 1) => {
    setActiveIndex((index + direction + options.length) % options.length);
  };

  return (
    <div className={`filter-control filter-control--${tone}`} ref={rootRef}>
      <button
        ref={triggerRef}
        className="filter-trigger"
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setActiveIndex(Math.max(selectedIndex, 0));
          setOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) {
              setActiveIndex(Math.max(selectedIndex, 0));
              setOpen(true);
            } else {
              moveActiveOption(activeIndex, event.key === "ArrowDown" ? 1 : -1);
            }
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      >
        <span>{options[Math.max(selectedIndex, 0)]?.label}</span>
        <ChevronDown aria-hidden="true" size={15} />
      </button>
      {open && (
        <div
          className="filter-menu"
          id={id}
          role="listbox"
          aria-label={label}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
              triggerRef.current?.focus();
            }
          }}
        >
          {options.map((option, index) => (
            <div
              aria-selected={option.value === value}
              className={`filter-option${option.value === value ? " is-selected" : ""}`}
              key={option.value}
              onClick={() => selectOption(index)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  moveActiveOption(index, event.key === "ArrowDown" ? 1 : -1);
                } else if (event.key === "Home" || event.key === "End") {
                  event.preventDefault();
                  setActiveIndex(event.key === "Home" ? 0 : options.length - 1);
                } else if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  selectOption(index);
                }
              }}
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              role="option"
              tabIndex={activeIndex === index ? 0 : -1}
            >
              <span>{option.label}</span>
              {option.value === value && <Check aria-hidden="true" size={14} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TriageDashboard() {
  const [intakes, setIntakes] = useState(initialIntakes);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [domainFilter, setDomainFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [sortBy, setSortBy] = useState("risk");
  const [order, setOrder] = useState("default");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [toastUndoable, setToastUndoable] = useState(false);
  const [recommendationOffset, setRecommendationOffset] = useState(0);
  const queueToolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const toolbar = queueToolbarRef.current;
    if (!toolbar) return;

    const updateOffset = () => {
      const toolbarHeight = toolbar.getBoundingClientRect().height;
      const toolbarMargin = Number.parseFloat(window.getComputedStyle(toolbar).marginBottom) || 0;
      setRecommendationOffset(toolbarHeight + toolbarMargin);
    };

    updateOffset();
    const observer = new ResizeObserver(updateOffset);
    observer.observe(toolbar);
    return () => observer.disconnect();
  }, []);

  const visibleIntakes = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = intakes.filter((intake) => {
      const matchesDomain = domainFilter === "all" || intake.domain === domainFilter;
      const matchesRisk = riskFilter === "all" || intake.risk === riskFilter;
      const matchesSearch =
        !query ||
        `${intake.id} ${intake.domain} ${intake.client} ${intake.summary}`
          .toLowerCase()
          .includes(query);
      return matchesDomain && matchesRisk && matchesSearch;
    });
    const direction = order === "ascending" ? 1 : -1;
    return filtered.sort((a, b) => {
      if (sortBy === "newest") return (a.receivedOrder - b.receivedOrder) * direction;
      if (sortBy === "deadline") return (a.deadlineOrder - b.deadlineOrder) * direction;
      return (riskRank[a.risk] - riskRank[b.risk]) * direction;
    });
  }, [domainFilter, intakes, order, riskFilter, search, sortBy]);

  const recommendation = useMemo(() => rankIntakesForReview(intakes), [intakes]);

  const showToast = (message: string, undoable = false) => {
    setToast(message);
    setToastUndoable(undoable);
  };

  const decide = (intake: Intake, result: Decision["result"]) => {
    setIntakes((current) => current.filter((item) => item.id !== intake.id));
    setDecisions((current) => [...current, { intake, result }]);
    showToast(`${intake.id} ${result}.`, true);
  };

  const undoDecision = () => {
    const last = decisions[decisions.length - 1];
    if (!last) return;
    setIntakes((current) => [...current, last.intake]);
    setDecisions((current) => current.slice(0, -1));
    showToast(`Restored ${last.intake.id} to the queue.`);
  };

  const resetFilters = () => {
    setSearch("");
    setDomainFilter("all");
    setRiskFilter("all");
    setSortBy("risk");
    setOrder("default");
  };

  const reviewRecommendedIntake = () => {
    if (!recommendation) return;

    try {
      window.sessionStorage.setItem("batasbot-triage-handoff", JSON.stringify({
        id: recommendation.intake.id,
        domain: recommendation.intake.domain,
        risk: recommendation.intake.risk,
        deadline: recommendation.intake.deadline,
        summary: recommendation.intake.summary,
        reasons: recommendation.reasons,
        specialty: profileSpecialty,
      }));
    } catch {
      showToast("BatasBot could not start a local chat in this browser.");
      return;
    }

    window.location.assign("/batasbot?source=triage");
  };

  const unavailable = (label: string) => showToast(`${label} is not part of this demo yet.`);

  return (
    <WorkspaceShell
      activePage="Case Overview"
      search={search}
      onSearchChange={setSearch}
      onUnavailable={unavailable}
      searchPlaceholder="Search intake IDs, messages..."
      searchLabel="Search intake IDs, messages, and matters"
    >
        <main className="dashboard">
          <div className="dashboard-heading">
            <div>
              <h1>Case Overview</h1>
            </div>
            <button className="new-intake-button" type="button" onClick={() => unavailable("New intake creation")}>
              <span aria-hidden="true">+</span> New intake
            </button>
          </div>

          <div className="dashboard-grid">
            <section className="queue-section" aria-labelledby="queue-heading">
              <div className="queue-toolbar" ref={queueToolbarRef}>
                <h2 id="queue-heading" className="sr-only">Incoming intake requests</h2>
                <div className="filters">
                  <FilterSelect
                    label="Filter by legal domain"
                    value={domainFilter}
                    onChange={setDomainFilter}
                    tone="blue"
                    options={[
                      { value: "all", label: "All Domains" },
                      ...Array.from(new Set(initialIntakes.map(({ domain }) => domain))).map((domain) => ({ value: domain, label: domain })),
                    ]}
                  />
                  <FilterSelect
                    label="Filter by risk level"
                    value={riskFilter}
                    onChange={setRiskFilter}
                    tone="neutral"
                    options={[
                      { value: "all", label: "All Risk Levels" },
                      { value: "Critical", label: "Critical Risk" },
                      { value: "High", label: "High Risk" },
                      { value: "Medium", label: "Medium Risk" },
                    ]}
                  />
                  <FilterSelect
                    label="Sort intake requests by"
                    value={sortBy}
                    onChange={setSortBy}
                    tone="red"
                    options={[
                      { value: "risk", label: "Sort by: Risk" },
                      { value: "newest", label: "Sort by: Newest" },
                      { value: "deadline", label: "Sort by: Deadline" },
                    ]}
                  />
                  <FilterSelect
                    label="Sort order"
                    value={order}
                    onChange={setOrder}
                    tone="yellow"
                    options={[
                      { value: "default", label: "Order by: Default" },
                      { value: "ascending", label: "Order: Low to high" },
                      { value: "descending", label: "Order: High to low" },
                    ]}
                  />
                </div>
                <div className="results-count" aria-live="polite">
                  <ArrowDownWideNarrow aria-hidden="true" size={15} />
                  {visibleIntakes.length} requests
                </div>
              </div>

              <div className="intake-list" aria-live="polite">
                {visibleIntakes.map((intake) => (
                  <article
                    className="intake-card"
                    id={`intake-${intake.id}`}
                    key={intake.id}
                  >
                    <div className="intake-card-top">
                      <div className="intake-tags">
                        <span className="intake-id">{intake.id}</span>
                        <span className="domain-tag">{intake.domain}</span>
                      </div>
                      <span className={`risk-label risk-label--${intake.risk.toLowerCase()}`}>
                        <span />{intake.risk === "Critical" ? "Critical Alert" : `${intake.risk} Priority`}
                      </span>
                    </div>
                    <h3>{intake.client}</h3>
                    <p className="intake-summary">{intake.summary}</p>
                    <div className="intake-card-footer">
                      <div className="intake-timing">
                        <span><Clock3 size={15} aria-hidden="true" /> {intake.received}</span>
                        {intake.deadlineOrder <= 1 && (
                          <span className="deadline-urgent">
                            {intake.deadlineOrder === 0
                              ? <ShieldAlert size={14} aria-hidden="true" />
                              : <Clock3 size={14} aria-hidden="true" />}
                            {intake.deadline}
                          </span>
                        )}
                      </div>
                      <div className="decision-actions">
                        <button className="decision-button decision-button--decline" type="button" onClick={() => decide(intake, "declined")}>
                          <X size={15} aria-hidden="true" /> Decline
                        </button>
                        <button className="decision-button decision-button--accept" type="button" onClick={() => decide(intake, "accepted")}>
                          <Check size={15} aria-hidden="true" /> Accept matter
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
                {visibleIntakes.length === 0 && (
                  <div className="empty-queue">
                    <span className="empty-icon"><Inbox size={22} /></span>
                    <h3>{intakes.length === 0 ? "Your queue is clear" : "No matching requests"}</h3>
                    <p>
                      {intakes.length === 0
                        ? "New client inquiries will appear here when they arrive."
                        : "Try another search or adjust your filters to see more matters."}
                    </p>
                    {(search || domainFilter !== "all" || riskFilter !== "all") && (
                      <button type="button" onClick={resetFilters}>Clear search and filters</button>
                    )}
                  </div>
                )}
              </div>
              <div className="sample-note">Showing sample records for interface preview. No client data is connected.</div>
            </section>

            <aside
              className="insights-rail"
              aria-label="Practice overview"
              style={{ "--triage-recommendation-offset": `${recommendationOffset}px` } as CSSProperties}
            >
              <section className="rail-panel triage-ai-panel" aria-labelledby="triage-ai-title">
                <div className="triage-ai-heading">
                  <span className="triage-ai-icon"><Sparkles aria-hidden="true" size={20} fill="currentColor" strokeWidth={1.7} /></span>
                  <div>
                    <h2 id="triage-ai-title">BatasBot recommendation</h2>
                  </div>
                </div>
                {recommendation ? (
                  <>
                    <div className="triage-ai-client">
                      <h3>{recommendation.intake.client}</h3>
                      <p>{recommendation.intake.id} · {recommendation.intake.domain}</p>
                    </div>
                    <div className="triage-ai-reasons">
                      <h4>Why review this intake first</h4>
                      <ul>
                        {recommendation.reasons.map((reason) => <li key={reason}><Check aria-hidden="true" size={15} />{reason}</li>)}
                      </ul>
                    </div>
                    <div className="triage-ai-footer">
                      <button type="button" onClick={reviewRecommendedIntake}>
                        Review intake <ArrowRight aria-hidden="true" size={16} />
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="triage-ai-empty">
                    <h3>No open intakes to rank</h3>
                    <p>New requests will appear in this local priority preview.</p>
                  </div>
                )}
              </section>
              <section className="rail-panel diagnostics-panel">
                <div className="rail-panel-heading"><h2>Queue Diagnostics</h2><span className="live-indicator"><span /> DEMO</span></div>
                <div className="stat-grid">
                  <div className="stat-tile"><strong>{Math.max(0, 12 - decisions.length)}</strong><span>Pending intake</span></div>
                  <div className="stat-tile"><strong>{34 + decisions.filter(({ result }) => result === "accepted").length}</strong><span>Active cases</span></div>
                  <div className="stat-tile"><strong>8</strong><span>This week consults</span></div>
                  <div className="stat-tile"><strong>94.8%</strong><span>Client satisfaction</span></div>
                </div>
              </section>
              <section className="rail-panel schedule-panel">
                <div className="rail-panel-heading">
                  <h2>Today&apos;s Schedule</h2>
                  <button className="text-link" type="button" onClick={() => unavailable("Calendar")}>
                    View calendar <span aria-hidden="true">→</span>
                  </button>
                </div>
                <div className="schedule-list">
                  <div className="schedule-item"><time><strong>10:00 AM</strong><span>Today</span></time><div><strong>DOLE Illegal Dismissal Prep</strong><span>M. Santos · Labor Code</span></div></div>
                  <div className="schedule-item"><time><strong>02:30 PM</strong><span>Today</span></time><div><strong>Contract Mediation Conference</strong><span>Fintrex Dev Corp · Civil Code</span></div></div>
                  <div className="schedule-item"><time><strong>04:00 PM</strong><span>Today</span></time><div><strong>RA 10175 Evidentiary Audit</strong><span>R. Alcantara · Cybercrime</span></div></div>
                </div>
              </section>
              <section className="rail-panel messages-panel">
                <div className="rail-panel-heading">
                  <h2>Recent Messages</h2>
                  <button className="quiet-icon-button" type="button" aria-label="Open messages" onClick={() => unavailable("Messages")}>
                    <Mail size={16} />
                  </button>
                </div>
                <div className="message-list">
                  {[
                    ["Client Case #0847", "4m ago", "U-upload ko po ba ito dito?"],
                    ["Atty. Clara Ocampo", "1h ago", "The Cebu Court hearing has been moved to March 1st morning."],
                    ["Client Case #0839", "3h ago", "They sent another demand letter today. Screenshot attached."],
                  ].map(([name, time, preview]) => (
                    <button className="message-item" key={name} type="button" onClick={() => unavailable("Messages")}>
                      <span className="message-meta"><strong>{name}</strong><time>{time}</time></span>
                      <span className="message-preview">{preview}</span>
                    </button>
                  ))}
                </div>
              </section>
            </aside>
          </div>
        </main>
      {toast && (
        <div className="toast" role="status">
          <span className="toast-check"><Check size={16} /></span>
          <span>{toast}</span>
          {toastUndoable && <button type="button" onClick={undoDecision}>Undo</button>}
          <button className="toast-close" type="button" aria-label="Dismiss notification" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </WorkspaceShell>
  );
}
