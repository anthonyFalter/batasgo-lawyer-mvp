"use client";

import {
  ArrowDownWideNarrow,
  ArrowRight,
  Check,
  ChevronDown,
  ClipboardCheck,
  FileText,
  FilePenLine,
  Sparkles,
  LoaderCircle,
  Clock3,
  Inbox,
  Mail,
  Paperclip,
  ShieldAlert,
  Upload,
  X,
} from "lucide-react";
import { type CSSProperties, type FormEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  apiErrorResponseSchema,
  intakeListResponseSchema,
  intakeResponseSchema,
  type IntakeDTO,
} from "@/lib/intakes/validation";
import { getRiskFromScore, suggestIntakeDetails } from "@/lib/intakes/triage";
import WorkspaceShell from "../workspace/workspace-shell";

type Risk = IntakeDTO["risk"];
type Intake = IntakeDTO;
type Decision = { intake: Intake; result: "accepted" | "declined" };
type IntakeReview = { intake: Intake; summary: string; signals: string[] };
type DecisionFilter = "all" | Decision["result"];
type RankedIntake = { intake: Intake; score: number; reasons: string[]; specialtyMatch: boolean };
type AiSummaryBlock = { type: "paragraph"; text: string } | { type: "list"; items: string[] };
type AiSummarySection = { heading: string; blocks: AiSummaryBlock[] };

const aiSummaryHeadings = [
  "Reported issue",
  "Time-sensitive facts",
  "Key unknowns",
  "Triage note",
] as const;

function parseAiSummary(summary: string): AiSummarySection[] {
  const sections: AiSummarySection[] = [];

  for (const line of summary.split(/\r?\n/)) {
    const headingMatch = line.match(
      /^\s*\**\s*(Reported issue|Time-sensitive facts|Key unknowns|Triage note)\s*\**\s*:?\s*(.*)$/i,
    );

    if (headingMatch) {
      const heading = aiSummaryHeadings.find(
        (item) => item.toLowerCase() === headingMatch[1].toLowerCase(),
      );
      if (!heading) continue;
      sections.push({ heading, blocks: [] });
      if (headingMatch[2]) {
        sections[sections.length - 1].blocks.push({ type: "paragraph", text: headingMatch[2] });
      }
      continue;
    }

    const text = line.trim();
    if (!text) continue;

    const section = sections[sections.length - 1];
    if (!section) {
      sections.push({ heading: "", blocks: [{ type: "paragraph", text }] });
      continue;
    }

    const bulletMatch = text.match(/^(?:[-*•]|\d+[.)])\s+(.+)$/);
    if (bulletMatch) {
      const lastBlock = section.blocks[section.blocks.length - 1];
      if (lastBlock?.type === "list") lastBlock.items.push(bulletMatch[1]);
      else section.blocks.push({ type: "list", items: [bulletMatch[1]] });
    } else {
      const lastBlock = section.blocks[section.blocks.length - 1];
      if (lastBlock?.type === "paragraph") lastBlock.text += ` ${text}`;
      else section.blocks.push({ type: "paragraph", text });
    }
  }

  return sections;
}

async function getResponseError(response: Response, fallback: string) {
  const payload: unknown = await response.json().catch(() => null);
  const parsed = apiErrorResponseSchema.safeParse(payload);
  return parsed.success ? parsed.data.error : fallback;
}

const riskRank: Record<Risk, number> = { Critical: 3, High: 2, Medium: 1 };
const profileSpecialty = "Labor & Employment litigation";
const specialtyOptions = [
  "Labor & Employment",
  "Family Law",
  "Civil Disputes",
  "Criminal Defense",
  "Immigration",
  "Corporate & Commercial",
  "Other",
];

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
        <ChevronDown aria-hidden="true" size={10.05} />
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
              {option.value === value && <Check aria-hidden="true" size={9.38} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TriageDashboard() {
  const [intakes, setIntakes] = useState<Intake[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [isLoadingIntakes, setIsLoadingIntakes] = useState(true);
  const [intakeLoadError, setIntakeLoadError] = useState("");
  const [busyIntakeId, setBusyIntakeId] = useState<string | null>(null);
  const [generatingSummaryId, setGeneratingSummaryId] = useState<string | null>(null);
  const [isSavingIntake, setIsSavingIntake] = useState(false);
  const [domainFilter, setDomainFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [sortBy, setSortBy] = useState("risk");
  const [order, setOrder] = useState("default");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [toastUndoable, setToastUndoable] = useState(false);
  const [decisionHistoryOpen, setDecisionHistoryOpen] = useState(false);
  const [decisionFilter, setDecisionFilter] = useState<DecisionFilter>("all");
  const [recommendationOffset, setRecommendationOffset] = useState(0);
  const [newIntakeOpen, setNewIntakeOpen] = useState(false);
  const [intakeTitle, setIntakeTitle] = useState("");
  const [intakeDescription, setIntakeDescription] = useState("");
  const [intakeSpecialty, setIntakeSpecialty] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [intakeStage, setIntakeStage] = useState<"form" | "calculating" | "review">("form");
  const [intakeReview, setIntakeReview] = useState<IntakeReview | null>(null);
  const queueToolbarRef = useRef<HTMLDivElement>(null);
  const decisionHistoryRef = useRef<HTMLDivElement>(null);
  const intakeDialogRef = useRef<HTMLDialogElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);

  const loadIntakes = useCallback(async () => {
    setIsLoadingIntakes(true);
    setIntakeLoadError("");

    try {
      const response = await fetch("/api/intakes", { cache: "no-store" });
      if (!response.ok) throw new Error(await getResponseError(response, "Unable to load intakes."));
      const parsed = intakeListResponseSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error("The intake service returned an invalid response.");

      const allIntakes = parsed.data.intakes;
      setIntakes(allIntakes.filter(({ status }) => status === "pending"));
      setDecisions(allIntakes
        .filter((intake): intake is Intake & { status: Decision["result"] } => intake.status !== "pending")
        .map((intake) => ({ intake, result: intake.status })));
    } catch (error) {
      setIntakeLoadError(error instanceof Error ? error.message : "Unable to load intakes.");
    } finally {
      setIsLoadingIntakes(false);
    }
  }, []);

  useEffect(() => {
    void loadIntakes();
  }, [loadIntakes]);

  useEffect(() => {
    if (newIntakeOpen && intakeDialogRef.current && !intakeDialogRef.current.open) {
      intakeDialogRef.current.showModal();
    }
  }, [newIntakeOpen]);

  useEffect(() => {
    if (!newIntakeOpen || intakeStage !== "calculating") return;
    const timer = window.setTimeout(() => setIntakeStage("review"), 2000);
    return () => window.clearTimeout(timer);
  }, [intakeStage, newIntakeOpen]);

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

  useEffect(() => {
    if (!decisionHistoryOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!decisionHistoryRef.current?.contains(event.target as Node)) setDecisionHistoryOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDecisionHistoryOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [decisionHistoryOpen]);

  const visibleIntakes = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = intakes.filter((intake) => {
      const matchesDomain = domainFilter === "all" || intake.domain === domainFilter;
      const matchesRisk = riskFilter === "all" || intake.risk === riskFilter;
      const matchesSearch =
        !query ||
        `${intake.reference} ${intake.domain} ${intake.client} ${intake.summary}`
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
  const visibleDecisions = decisions.filter(({ result }) => decisionFilter === "all" || result === decisionFilter);

  const showToast = (message: string, undoable = false) => {
    setToast(message);
    setToastUndoable(undoable);
  };

  const updateIntakeStatus = async (intake: Intake, status: Intake["status"]) => {
    const response = await fetch(`/api/intakes/${intake.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) throw new Error(await getResponseError(response, "Unable to update intake."));
    const parsed = intakeResponseSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error("The intake service returned an invalid response.");
    return parsed.data.intake;
  };

  const decide = async (intake: Intake, result: Decision["result"]) => {
    setBusyIntakeId(intake.id);
    try {
      const updated = await updateIntakeStatus(intake, result);
      setIntakes((current) => current.filter((item) => item.id !== intake.id));
      setDecisions((current) => [...current.filter(({ intake: item }) => item.id !== intake.id), {
        intake: updated,
        result,
      }]);
      showToast(`${intake.reference} ${result}.`, true);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to save the intake decision.");
    } finally {
      setBusyIntakeId(null);
    }
  };

  const undoDecision = async () => {
    const last = decisions[decisions.length - 1];
    if (!last) return;
    setBusyIntakeId(last.intake.id);
    try {
      const restored = await updateIntakeStatus(last.intake, "pending");
      setIntakes((current) => [restored, ...current]);
      setDecisions((current) => current.filter(({ intake }) => intake.id !== last.intake.id));
      showToast(`Restored ${last.intake.reference} to the queue.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to undo the intake decision.");
    } finally {
      setBusyIntakeId(null);
    }
  };

  const importAcceptedMatter = (intake: Intake) => {
    try {
      window.sessionStorage.setItem("batasgo-accepted-intake", JSON.stringify({
        id: intake.reference,
        client: intake.client,
        domain: intake.domain,
        risk: intake.risk,
        summary: intake.summary,
        result: "accepted",
      }));
    } catch {
      showToast("This browser could not pass the accepted intake to Document Assembly.");
      return;
    }

    window.location.assign("/documents?source=accepted-intake");
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
        id: recommendation.intake.reference,
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

  const clearManualIntake = () => {
    setIntakeTitle("");
    setIntakeDescription("");
    setIntakeSpecialty("");
    setSelectedFiles([]);
    setIntakeStage("form");
    setIntakeReview(null);
    setIsDraggingFiles(false);
  };

  const closeNewIntake = () => {
    if (intakeDialogRef.current?.open) intakeDialogRef.current.close();
    setNewIntakeOpen(false);
    clearManualIntake();
  };

  const openNewIntake = () => {
    clearManualIntake();
    setNewIntakeOpen(true);
  };

  const addDocuments = (files: FileList | File[]) => {
    const incomingFiles = Array.from(files);
    setSelectedFiles((current) => {
      const existingFiles = new Set(current.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
      return [
        ...current,
        ...incomingFiles.filter((file) => !existingFiles.has(`${file.name}:${file.size}:${file.lastModified}`)),
      ];
    });
  };

  const generateIntakeSuggestions = () => {
    const suggestions = suggestIntakeDetails(
      intakeTitle,
      intakeDescription,
      selectedFiles.map((file) => file.name),
    );
    setIntakeTitle(suggestions.title);
    setIntakeDescription(suggestions.description);
    setIntakeSpecialty(suggestions.specialty);
  };

  const generateSampleSummary = async (intake: Intake) => {
    if (!intake.isSample || intake.aiSummary || generatingSummaryId === intake.id) return;
    setGeneratingSummaryId(intake.id);
    try {
      const response = await fetch(`/api/intakes/${intake.id}/summary`, {
        method: "POST",
        signal: AbortSignal.timeout(40_000),
      });
      if (!response.ok) throw new Error(await getResponseError(response, "Unable to generate summary."));
      const parsed = intakeResponseSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error("The summary service returned an invalid response.");
      const updated = parsed.data.intake;
      setIntakes((current) => current.map((item) => item.id === updated.id ? updated : item));
      showToast("AI summary generated.");
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      showToast(timedOut
        ? "AI summary generation timed out. Please try again."
        : error instanceof Error ? error.message : "Unable to generate summary.");
    } finally {
      setGeneratingSummaryId(null);
    }
  };

  const submitManualIntake = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const suggestions = suggestIntakeDetails(
      intakeTitle,
      intakeDescription,
      selectedFiles.map((file) => file.name),
    );
    const specialty = intakeSpecialty || suggestions.specialty;
    const newIntake: Intake = {
      id: "00000000-0000-4000-8000-000000000000",
      reference: "Intake preview",
      domain: specialty,
      risk: getRiskFromScore(suggestions.score),
      client: intakeTitle.trim() || suggestions.title,
      summary: intakeDescription.trim() || suggestions.description,
      received: "Just now",
      receivedOrder: 3,
      deadline: "No deadline set",
      deadlineOrder: 99,
      deadlineAt: null,
      documents: selectedFiles.map((file) => file.name),
      priorityScore: suggestions.score,
      status: "pending",
      isSample: false,
      aiSummary: null,
    };

    setIntakeReview({ intake: newIntake, summary: suggestions.summary, signals: suggestions.signals });
    setIntakeStage("calculating");
  };

  const proceedWithManualIntake = async () => {
    if (!intakeReview) return;
    setIsSavingIntake(true);
    try {
      const response = await fetch("/api/intakes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: intakeTitle,
          description: intakeDescription,
          domain: intakeSpecialty,
          documents: selectedFiles.map((file) => file.name),
        }),
      });
      if (!response.ok) throw new Error(await getResponseError(response, "Unable to save intake."));
      const parsed = intakeResponseSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error("The intake service returned an invalid response.");

      setIntakes((current) => [parsed.data.intake, ...current]);
      setDecisionHistoryOpen(false);
      resetFilters();
      setSortBy("newest");
      closeNewIntake();
      showToast("Intake saved to your workspace.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to save intake.");
    } finally {
      setIsSavingIntake(false);
    }
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
        <main className="dashboard" ref={decisionHistoryRef}>
          <div className="dashboard-heading">
            <div>
              <h1>Case Overview</h1>
            </div>
            <div className="dashboard-heading-actions">
              <div className="decision-history-anchor" ref={decisionHistoryRef}>
                <button
                  className="reviewed-button"
                  type="button"
                  aria-controls="reviewed-matters-panel"
                  aria-expanded={decisionHistoryOpen}
                  aria-label={decisionHistoryOpen ? "Show intake queue" : "Show reviewed matters"}
                  onClick={() => setDecisionHistoryOpen((open) => !open)}
                >
                  <ClipboardCheck aria-hidden="true" size={10.72} />
                  {decisionHistoryOpen ? "Queue" : "Reviewed"}
                  <span className="reviewed-count">{decisions.length}</span>
                </button>
              </div>
              <button className="new-intake-button" type="button" onClick={openNewIntake}>
                <span aria-hidden="true">+</span> New intake
              </button>
            </div>
          </div>

          {intakeLoadError && (
            <div className="intake-load-error" role="alert">
              <span>{intakeLoadError}</span>
              <button type="button" onClick={() => void loadIntakes()}>Retry</button>
            </div>
          )}

          {decisionHistoryOpen && (
            <section className="decision-history-panel" id="reviewed-matters-panel" aria-label="Reviewed matters">
              <div className="decision-history-heading">
                <div>
                  <h2>Reviewed matters</h2>
                  <span>Saved in your workspace</span>
                </div>
                <strong>{decisions.length}</strong>
              </div>
              <div className="decision-history-filters" role="group" aria-label="Filter reviewed matters">
                {([
                  ["all", "All", decisions.length],
                  ["accepted", "Accepted", decisions.filter(({ result }) => result === "accepted").length],
                  ["declined", "Declined", decisions.filter(({ result }) => result === "declined").length],
                ] as const).map(([filter, label, count]) => (
                  <button
                    type="button"
                    key={filter}
                    aria-pressed={decisionFilter === filter}
                    onClick={() => setDecisionFilter(filter)}
                  >
                    {label} <span>{count}</span>
                  </button>
                ))}
              </div>
              <div className="decision-history-list">
                {visibleDecisions.length > 0 ? visibleDecisions.map(({ intake, result }) => (
                  <article className="decision-history-item" key={intake.id}>
                    <div className="decision-history-item-heading">
                      <strong>{intake.reference}</strong>
                      <span className={`decision-history-status decision-history-status--${result}`}>
                        {result === "accepted" ? "Accepted" : "Declined"}
                      </span>
                      {intake.isSample && <span className="intake-sample-badge">SAMPLE</span>}
                    </div>
                    <p className="decision-history-client">{intake.client}</p>
                    <p className="decision-history-context">{intake.domain} · {intake.risk} risk</p>
                    <p className="decision-history-summary">{intake.summary}</p>
                    {result === "accepted" && (
                      <button className="decision-import-button" type="button" onClick={() => importAcceptedMatter(intake)}>
                        <FilePenLine aria-hidden="true" size={10.72} />
                        Import to Document Assembly
                      </button>
                    )}
                  </article>
                )) : (
                  <p className="decision-history-empty">
                    {decisions.length === 0 ? "Accepted and declined matters will appear here." : `No ${decisionFilter} matters yet.`}
                  </p>
                )}
              </div>
            </section>
          )}

          <div className="dashboard-grid" hidden={decisionHistoryOpen}>
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
                      ...specialtyOptions.map((domain) => ({ value: domain, label: domain })),
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
                  <ArrowDownWideNarrow aria-hidden="true" size={10.05} />
                  {visibleIntakes.length} requests
                </div>
              </div>

              <div className="intake-list" aria-live="polite">
              {isLoadingIntakes && <p className="intake-loading" role="status">Loading your workspace intakes…</p>}
              {visibleIntakes.map((intake) => (
                  <article
                    className="intake-card"
                    id={`intake-${intake.id}`}
                    key={intake.id}
                  >
                    <div className="intake-card-top">
                      <div className="intake-tags">
                        <span className="intake-id">{intake.reference}</span>
                        {intake.isSample && <span className="intake-sample-badge">SAMPLE</span>}
                        <span className="domain-tag">{intake.domain}</span>
                      </div>
                      <span className={`risk-label risk-label--${intake.risk.toLowerCase()}`}>
                        <span />{intake.risk === "Critical" ? "Critical Alert" : `${intake.risk} Priority`}
                      </span>
                    </div>
                    <h3>{intake.client}</h3>
                    <p className="intake-summary">{intake.summary}</p>
                    {intake.isSample && (
                      <section
                        className={`sample-ai-summary${generatingSummaryId === intake.id ? " is-generating" : ""}`}
                        aria-label="Synthetic sample AI summary"
                        aria-busy={generatingSummaryId === intake.id}
                      >
                        {intake.aiSummary ? (
                          <details className="sample-ai-summary-details">
                            <summary>
                              <span className="sample-ai-summary-title">
                                <Sparkles aria-hidden="true" size={13.4} fill="currentColor" strokeWidth={1.7} />
                                <strong>AI Summary</strong>
                              </span>
                              <ChevronDown aria-hidden="true" size={12} />
                            </summary>
                            <div className="sample-ai-summary-content">
                              {parseAiSummary(intake.aiSummary).map((section, sectionIndex) => (
                                <section className="sample-ai-summary-section" key={`${section.heading}-${sectionIndex}`}>
                                  {section.heading && <h4>{section.heading}</h4>}
                                  {section.blocks.map((block, blockIndex) => block.type === "list" ? (
                                    <ul key={blockIndex}>
                                      {block.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}
                                    </ul>
                                  ) : (
                                    <p key={blockIndex}>{block.text}</p>
                                  ))}
                                </section>
                              ))}
                            </div>
                            <small>AI-generated from synthetic text only. Verify all facts.</small>
                          </details>
                        ) : (
                          <button
                            type="button"
                            disabled={generatingSummaryId === intake.id}
                            onClick={() => void generateSampleSummary(intake)}
                          >
                            <Sparkles aria-hidden="true" size={9.38} />
                            {generatingSummaryId === intake.id ? "Generating summary…" : "AI Summary"}
                          </button>
                        )}
                      </section>
                    )}
                    {intake.documents && intake.documents.length > 0 && (
                      <div className="intake-document-summary" title={intake.documents.join(", ")}>
                        <Paperclip aria-hidden="true" size={9.38} />
                        {intake.documents.length} selected file {intake.documents.length === 1 ? "name" : "names"}
                      </div>
                    )}
                    <div className="intake-card-footer">
                      <div className="intake-timing">
                        <span><Clock3 size={10.05} aria-hidden="true" /> {intake.received}</span>
                        {intake.deadlineOrder <= 1 && (
                          <span className="deadline-urgent">
                            {intake.deadlineOrder === 0
                              ? <ShieldAlert size={9.38} aria-hidden="true" />
                              : <Clock3 size={9.38} aria-hidden="true" />}
                            {intake.deadline}
                          </span>
                        )}
                      </div>
                      <div className="decision-actions">
                        <button className="decision-button decision-button--decline" type="button" disabled={busyIntakeId === intake.id} onClick={() => void decide(intake, "declined")}>
                          <X size={10.05} aria-hidden="true" /> Decline
                        </button>
                        <button className="decision-button decision-button--accept" type="button" disabled={busyIntakeId === intake.id} onClick={() => void decide(intake, "accepted")}>
                          <Check size={10.05} aria-hidden="true" /> Accept matter
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
                {!isLoadingIntakes && !intakeLoadError && visibleIntakes.length === 0 && (
                  <div className="empty-queue">
                    <span className="empty-icon"><Inbox size={14.74} /></span>
                    <h3>{intakes.length === 0 ? "Your queue is clear" : "No matching requests"}</h3>
                    <p>
                      {intakes.length === 0
                        ? "Create an intake to start building your workspace queue."
                        : "Try another search or adjust your filters to see more matters."}
                    </p>
                    {(search || domainFilter !== "all" || riskFilter !== "all") && (
                      <button type="button" onClick={resetFilters}>Clear search and filters</button>
                    )}
                  </div>
                )}
              </div>
              {intakes.some(({ isSample }) => isSample) && (
                <div className="sample-note">Synthetic sample records are for demonstration only and do not represent real clients.</div>
              )}
            </section>

            <aside
              className="insights-rail"
              aria-label="Practice overview"
              style={{ "--triage-recommendation-offset": `${recommendationOffset}px` } as CSSProperties}
            >
              <section className="rail-panel triage-ai-panel" aria-labelledby="triage-ai-title">
                <div className="triage-ai-heading">
                  <span className="triage-ai-icon"><Sparkles aria-hidden="true" size={13.4} fill="currentColor" strokeWidth={1.7} /></span>
                  <div>
                    <h2 id="triage-ai-title">BatasBot recommendation</h2>
                  </div>
                </div>
                {recommendation ? (
                  <>
                    <div className="triage-ai-client">
                      <h3>{recommendation.intake.client}</h3>
                      <p>{recommendation.intake.reference} · {recommendation.intake.domain}</p>
                    </div>
                    <div className="triage-ai-reasons">
                      <h4>Why review this intake first</h4>
                      <ul>
                        {recommendation.reasons.map((reason) => <li key={reason}><Check aria-hidden="true" size={10.05} />{reason}</li>)}
                      </ul>
                    </div>
                    <div className="triage-ai-footer">
                      <button type="button" onClick={reviewRecommendedIntake}>
                        Review intake <ArrowRight aria-hidden="true" size={10.72} />
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
                  <button className="text-link" type="button" onClick={() => window.location.assign("/calendar")}>
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
                  <button className="quiet-icon-button" type="button" aria-label="Open messages" onClick={() => window.location.assign("/messages")}>
                    <Mail size={10.72} />
                  </button>
                </div>
                <div className="message-list">
                  {[
                    ["Client Case #0847", "4m ago", "U-upload ko po ba ito dito?"],
                    ["Atty. Clara Ocampo", "1h ago", "The Cebu Court hearing has been moved to March 1st morning."],
                    ["Client Case #0839", "3h ago", "They sent another demand letter today. Screenshot attached."],
                  ].map(([name, time, preview]) => (
                    <button className="message-item" key={name} type="button" onClick={() => window.location.assign("/messages")}>
                      <span className="message-meta"><strong>{name}</strong><time>{time}</time></span>
                      <span className="message-preview">{preview}</span>
                    </button>
                  ))}
                </div>
              </section>
            </aside>
          </div>
        </main>
      {newIntakeOpen && (
        <dialog
          ref={intakeDialogRef}
          className="new-intake-dialog"
          aria-labelledby={intakeStage === "form" ? "new-intake-heading" : intakeStage === "calculating" ? "intake-calculating-heading" : "intake-review-heading"}
          onClose={() => setNewIntakeOpen(false)}
          onClick={(event) => {
            if (event.target === event.currentTarget) closeNewIntake();
          }}
        >
          <div className="new-intake-dialog-content">
            {intakeStage === "form" && (
              <header className="new-intake-dialog-header">
                <div>
                  <h2 id="new-intake-heading">Create an intake</h2>
                  <p>Enter matter details. Selected file names are saved; file contents are not uploaded.</p>
                </div>
                <button className="quiet-icon-button" type="button" aria-label="Close new intake" onClick={closeNewIntake}>
                  <X aria-hidden="true" size={13.4} />
                </button>
              </header>
            )}
            {intakeStage === "form" ? (
              <form className="new-intake-form" onSubmit={submitManualIntake}>
              <section className="intake-upload-section" aria-labelledby="intake-upload-label">
                <div className="intake-form-label" id="intake-upload-label">Documents</div>
                <input
                  ref={documentInputRef}
                  className="intake-file-input"
                  type="file"
                  accept=".pdf,.doc,.docx,.txt,.rtf,.jpg,.jpeg,.png"
                  multiple
                  onChange={(event) => {
                    if (event.currentTarget.files) addDocuments(event.currentTarget.files);
                    event.currentTarget.value = "";
                  }}
                />
                <button
                  className={`intake-dropzone${isDraggingFiles ? " is-dragging" : ""}`}
                  type="button"
                  onClick={() => documentInputRef.current?.click()}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsDraggingFiles(true);
                  }}
                  onDragLeave={() => setIsDraggingFiles(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setIsDraggingFiles(false);
                    addDocuments(event.dataTransfer.files);
                  }}
                >
                  <span className="intake-dropzone-icon"><Upload aria-hidden="true" size={13.4} /></span>
                  <span><strong>Choose documents</strong><small>Names only · file contents stay in your browser</small></span>
                </button>
                {selectedFiles.length > 0 && (
                  <ul className="intake-file-list" aria-label="Selected documents">
                    {selectedFiles.map((file) => (
                      <li key={`${file.name}-${file.size}-${file.lastModified}`}>
                        <FileText aria-hidden="true" size={12.06} />
                        <span title={file.name}>{file.name}</span>
                        <small>{file.size < 1024 * 1024 ? `${Math.max(1, Math.round(file.size / 1024))} KB` : `${(file.size / (1024 * 1024)).toFixed(1)} MB`}</small>
                        <button
                          type="button"
                          aria-label={`Remove ${file.name}`}
                          onClick={() => {
                            setSelectedFiles((current) => current.filter((item) => item !== file));
                          }}
                        >
                          <X aria-hidden="true" size={10.72} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <div className="intake-form-fields">
                <label className="intake-form-field" htmlFor="manual-intake-title">
                  <span>Title</span>
                  <input
                    id="manual-intake-title"
                    autoFocus
                    maxLength={120}
                    placeholder="e.g. Unpaid wages and dismissal"
                    value={intakeTitle}
                    onChange={(event) => setIntakeTitle(event.target.value)}
                  />
                </label>
                <label className="intake-form-field" htmlFor="manual-intake-specialty">
                  <span>Specialty</span>
                  <select
                    id="manual-intake-specialty"
                    value={intakeSpecialty}
                    onChange={(event) => setIntakeSpecialty(event.target.value)}
                  >
                    <option value="" disabled>Select a legal specialty</option>
                    {specialtyOptions.map((specialty) => <option value={specialty} key={specialty}>{specialty}</option>)}
                  </select>
                </label>
                <label className="intake-form-field intake-form-field--wide" htmlFor="manual-intake-description">
                  <span>Description</span>
                  <textarea
                    id="manual-intake-description"
                    rows={4}
                    maxLength={1200}
                    placeholder="Summarize the client's situation, key dates, and requested help."
                    value={intakeDescription}
                    onChange={(event) => setIntakeDescription(event.target.value)}
                  />
                </label>
              </div>

              <section className="intake-ai-assist" aria-label="Optional BatasBot suggestions">
                <button className="intake-ai-button" type="button" onClick={generateIntakeSuggestions}>
                  <Sparkles aria-hidden="true" size={10.72} /> Suggest with BatasBot
                </button>
              </section>

              <footer className="new-intake-form-footer">
                <p>Fields can be left blank. Let BatasBot do the heavy lifting.</p>
                <div className="new-intake-form-actions">
                  <button className="intake-cancel-button" type="button" onClick={closeNewIntake}>Cancel</button>
                  <button className="intake-submit-button" type="submit"><Check aria-hidden="true" size={12.06} /> Add to queue</button>
                </div>
              </footer>
              </form>
            ) : intakeStage === "calculating" ? (
              <section className="intake-calculating" role="status" aria-live="polite">
                <span className="intake-calculating-icon"><LoaderCircle aria-hidden="true" size={24.12} /></span>
                <h2 id="intake-calculating-heading">Calculating metrics</h2>
                <div className="intake-calculating-track" aria-hidden="true"><span /></div>
                <p>Assessing urgency and key signals</p>
              </section>
            ) : intakeReview && (
              <section className="intake-review" aria-labelledby="intake-review-heading">
                <header className="intake-review-header">
                  <div>
                    <h2 id="intake-review-heading">Urgency overview</h2>
                    <p>{intakeReview.intake.client} <span aria-hidden="true">·</span> {intakeReview.intake.domain}</p>
                  </div>
                  <span className={`intake-review-risk intake-review-risk--${intakeReview.intake.risk.toLowerCase()}`}>
                    {intakeReview.intake.risk}
                  </span>
                </header>

                <div className="intake-review-metrics">
                  <section className="intake-review-score" aria-label="Priority score">
                    <span>Priority score</span>
                    <div className="intake-review-score-value">
                      <strong>{intakeReview.intake.priorityScore}</strong><small>/100</small>
                    </div>
                    <div
                      className="intake-review-meter"
                      role="progressbar"
                      aria-label="Urgency score"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={intakeReview.intake.priorityScore}
                    >
                      <span style={{ width: `${intakeReview.intake.priorityScore}%` }} />
                    </div>
                  </section>
                  <div className="intake-review-stat">
                    <span>Signals</span>
                    <strong>{intakeReview.signals.length}</strong>
                  </div>
                  <div className="intake-review-stat">
                    <span>Selected file names</span>
                    <strong>{intakeReview.intake.documents?.length ?? 0}</strong>
                  </div>
                </div>

                <div className="intake-review-signals" aria-label="Urgency signals">
                  {intakeReview.signals.map((signal) => <span key={signal}>{signal}</span>)}
                </div>

                <section className="intake-review-summary" aria-labelledby="intake-review-summary-heading">
                  <div>
                    <Sparkles aria-hidden="true" size={12.06} />
                    <h3 id="intake-review-summary-heading">BatasBot summary</h3>
                  </div>
                  <p>{intakeReview.summary}</p>
                </section>

                <footer className="intake-review-footer">
                  <button className="intake-cancel-button" type="button" onClick={() => setIntakeStage("form")}>Edit details</button>
                  <button className="intake-submit-button" type="button" disabled={isSavingIntake} onClick={() => void proceedWithManualIntake()}>
                    {isSavingIntake ? "Saving…" : "Save intake"} <ArrowRight aria-hidden="true" size={12.06} />
                  </button>
                </footer>
              </section>
            )}
          </div>
        </dialog>
      )}
      {toast && (
        <div className="toast" role="status">
          <span className="toast-check"><Check size={10.72} /></span>
          <span>{toast}</span>
          {toastUndoable && <button type="button" onClick={undoDecision}>Undo</button>}
          <button className="toast-close" type="button" aria-label="Dismiss notification" onClick={() => setToast("")}>
            <X size={10.72} />
          </button>
        </div>
      )}
    </WorkspaceShell>
  );
}
