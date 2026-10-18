"use client";

import {
  ArrowDownWideNarrow,
  ArrowRight,
  Check,
  ChevronDown,
  ClipboardCheck,
  CalendarDays,
  FileText,
  FilePenLine,
  LockKeyhole,
  Sparkles,
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
  intakeCaseStages,
  intakeAiExtractionResponseSchema,
  intakeAiReviewResponseSchema,
  intakeListResponseSchema,
  intakeResponseSchema,
  intakeUrgencyFlags,
  type IntakeDTO,
} from "@/lib/intakes/validation";
import { getRiskAction, getRiskFromScore, suggestIntakeDetails } from "@/lib/intakes/triage";
import WorkspaceShell from "../workspace/workspace-shell";

type Risk = IntakeDTO["risk"];
type Intake = IntakeDTO;
type Decision = { intake: Intake; result: "accepted" | "declined" };
type IntakeReviewFactor = { score: number; rationale: string };
type IntakeReviewFactors = {
  temporalDeadlines: IntakeReviewFactor;
  caseRiskImpact: IntakeReviewFactor;
  proceduralStatus: IntakeReviewFactor;
  severityBonus: IntakeReviewFactor;
};
type IntakeReview = {
  intake: Intake;
  summary: string;
  signals: string[];
  source: "local" | "ai";
  provider?: "BatasBot";
  documentReview?: { processedCount: number; truncated: boolean; visionUsed: boolean };
  fieldSources?: IntakeFieldSources;
  factors?: IntakeReviewFactors;
};
type IntakeFieldSources = {
  title: { document: string | null; page: number | null };
  description: { document: string | null; page: number | null };
  domain: { document: string | null; page: number | null };
  deadlineAt: { document: string | null; page: number | null };
  caseStage: { document: string | null; page: number | null };
  urgencyFlags: { document: string | null; page: number | null };
};
type IntakeStage = "choose" | "upload" | "details" | "result";
type DecisionFilter = "all" | Decision["result"];
type RankedIntake = { intake: Intake; score: number; reasons: string[]; specialtyMatch: boolean };
type AiSummaryBlock = { type: "paragraph"; text: string } | { type: "list"; items: string[] };
type AiSummarySection = { heading: string; blocks: AiSummaryBlock[] };

const seenDecisionIdsStorageKey = "batasgo:triage:seen-decision-ids";

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

function AiSummaryContent({
  id,
  summary,
  shouldAnimate,
  onComplete,
}: {
  id: string;
  summary: string;
  shouldAnimate: boolean;
  onComplete: (id: string) => void;
}) {
  const [visibleCharacters, setVisibleCharacters] = useState<number | null>(shouldAnimate ? 0 : null);
  const isTyping = shouldAnimate && visibleCharacters !== null;
  let remainingCharacters = visibleCharacters ?? Number.POSITIVE_INFINITY;

  useEffect(() => {
    if (!shouldAnimate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisibleCharacters(null);
      if (shouldAnimate) onComplete(id);
      return;
    }

    let currentVisibleCharacters = 0;
    setVisibleCharacters(0);
    const interval = window.setInterval(() => {
      currentVisibleCharacters = Math.min(currentVisibleCharacters + 4, summary.length);
      if (currentVisibleCharacters >= summary.length) {
        setVisibleCharacters(null);
        window.clearInterval(interval);
        onComplete(id);
      } else {
        setVisibleCharacters(currentVisibleCharacters);
      }
    }, 40);

    return () => window.clearInterval(interval);
  }, [id, onComplete, shouldAnimate, summary]);

  const reveal = (text: string) => {
    const visibleText = text.slice(0, remainingCharacters);
    remainingCharacters = Math.max(0, remainingCharacters - text.length);
    return visibleText;
  };

  return (
    <>
      {isTyping && <span className="sr-only">{summary}</span>}
      <div
        className={`sample-ai-summary-content${isTyping ? " is-typing" : ""}`}
        aria-hidden={isTyping}
      >
        {parseAiSummary(summary).map((section, sectionIndex) => (
          <section className="sample-ai-summary-section" key={`${section.heading}-${sectionIndex}`}>
            {section.heading && <h4>{reveal(section.heading)}</h4>}
            {section.blocks.map((block, blockIndex) => block.type === "list" ? (
              <ul key={blockIndex}>
                {block.items.map((item, itemIndex) => <li key={itemIndex}>{reveal(item)}</li>)}
              </ul>
            ) : (
              <p key={blockIndex}>{reveal(block.text)}</p>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}

async function getResponseError(response: Response, fallback: string) {
  const payload: unknown = await response.json().catch(() => null);
  const parsed = apiErrorResponseSchema.safeParse(payload);
  return parsed.success ? parsed.data.error : fallback;
}

const riskRank: Record<Risk, number> = { Unassessed: 5, Critical: 4, High: 3, Medium: 2, Low: 1 };
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
    const riskPoints = { Unassessed: 40, Critical: 40, High: 28, Medium: 15, Low: 5 }[intake.risk];
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
  const [seenDecisionIds, setSeenDecisionIds] = useState<Set<string>>(() => new Set());
  const [warpingIntakeIds, setWarpingIntakeIds] = useState<Set<string>>(() => new Set());
  const [isLoadingIntakes, setIsLoadingIntakes] = useState(true);
  const [intakeLoadError, setIntakeLoadError] = useState("");
  const [busyIntakeId, setBusyIntakeId] = useState<string | null>(null);
  const [generatingSummaryId, setGeneratingSummaryId] = useState<string | null>(null);
  const [expandedAiSummaryIds, setExpandedAiSummaryIds] = useState<Set<string>>(() => new Set());
  const [typingSummaryId, setTypingSummaryId] = useState<string | null>(null);
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
  const [intakeDeadline, setIntakeDeadline] = useState("");
  const [intakeCaseStage, setIntakeCaseStage] = useState("");
  const [selectedUrgencyFlags, setSelectedUrgencyFlags] = useState<string[]>([]);
  const [aiFilledFields, setAiFilledFields] = useState<Set<keyof IntakeFieldSources>>(() => new Set());
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [intakeStage, setIntakeStage] = useState<IntakeStage>("choose");
  const [intakePath, setIntakePath] = useState<"documents" | "manual" | null>(null);
  const [maskIdentifiers, setMaskIdentifiers] = useState(true);
  const [documentConsent, setDocumentConsent] = useState(false);
  const [manualAiConsent, setManualAiConsent] = useState(false);
  const [intakeReview, setIntakeReview] = useState<IntakeReview | null>(null);
  const [isGeneratingIntakeReview, setIsGeneratingIntakeReview] = useState(false);
  const [intakeAiReviewError, setIntakeAiReviewError] = useState("");
  const queueToolbarRef = useRef<HTMLDivElement>(null);
  const decisionHistoryRef = useRef<HTMLDivElement>(null);
  const decisionHistoryButtonRef = useRef<HTMLButtonElement>(null);
  const intakeCardRefs = useRef(new Map<string, HTMLElement>());
  const intakeDialogRef = useRef<HTMLDialogElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const intakeReviewRequestRef = useRef<AbortController | null>(null);

  const handleSummaryTypingComplete = useCallback((id: string) => {
    setTypingSummaryId((current) => current === id ? null : current);
  }, []);

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
    try {
      const storedIds = window.localStorage.getItem(seenDecisionIdsStorageKey);
      if (storedIds === null) return;

      const parsed: unknown = JSON.parse(storedIds);
      if (!Array.isArray(parsed) || !parsed.every((id): id is string => typeof id === "string")) {
        throw new Error("Saved reviewed-matter status is invalid.");
      }
      setSeenDecisionIds(new Set(parsed));
    } catch (error) {
      console.error("Unable to restore reviewed-matter status.", error);
      setToast("Unread review status couldn't be restored from this browser.");
    }
  }, []);

  useEffect(() => {
    if (newIntakeOpen && intakeDialogRef.current && !intakeDialogRef.current.open) {
      intakeDialogRef.current.showModal();
    }
  }, [newIntakeOpen]);

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
  const unseenDecisionCount = decisions.reduce(
    (count, { intake }) => count + (seenDecisionIds.has(intake.id) ? 0 : 1),
    0,
  );
  const queueStats = useMemo(() => {
    const acceptedCount = decisions.filter(({ result }) => result === "accepted").length;
    const reviewedCount = decisions.length;
    const pendingCount = intakes.length;
    const activeCases = pendingCount + acceptedCount;
    const approvalRate = reviewedCount === 0 ? 0 : Math.round((acceptedCount / reviewedCount) * 100);

    return {
      pendingCount,
      activeCases,
      reviewedCount,
      approvalRate,
    };
  }, [decisions, intakes]);

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

  const animateIntakeToReviewed = (intakeId: string): Animation | null => {
    const card = intakeCardRefs.current.get(intakeId);
    const destination = decisionHistoryButtonRef.current;
    if (
      !card
      || !destination
      || typeof card.animate !== "function"
      || window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return null;
    }

    const cardBounds = card.getBoundingClientRect();
    const destinationBounds = destination.getBoundingClientRect();
    const translateX = destinationBounds.left + destinationBounds.width / 2
      - (cardBounds.left + cardBounds.width / 2);
    const translateY = destinationBounds.top + destinationBounds.height / 2
      - (cardBounds.top + cardBounds.height / 2);
    setWarpingIntakeIds((current) => new Set(current).add(intakeId));
    try {
      return card.animate([
        {
          transform: "translate3d(0, 0, 0) scale(1)",
          opacity: 1,
        },
        {
          transform: `translate3d(${translateX * 0.55}px, ${translateY * 0.55}px, 0) scale(.62) skewX(5deg)`,
          opacity: 0.7,
          offset: 0.45,
        },
        {
          transform: `translate3d(${translateX}px, ${translateY}px, 0) scale(.08) skewX(-8deg)`,
          opacity: 0,
        },
      ], {
        duration: 180,
        easing: "cubic-bezier(.22, .7, .3, 1)",
        fill: "forwards",
      });
    } catch (error) {
      console.error("Unable to animate the reviewed intake transition.", error);
      return null;
    }
  };

  const toggleDecisionHistory = () => {
    const opening = !decisionHistoryOpen;
    if (opening) {
      const nextSeenIds = new Set(seenDecisionIds);
      decisions.forEach(({ intake }) => nextSeenIds.add(intake.id));
      setSeenDecisionIds(nextSeenIds);
      try {
        window.localStorage.setItem(seenDecisionIdsStorageKey, JSON.stringify([...nextSeenIds]));
      } catch (error) {
        console.error("Unable to save reviewed-matter status.", error);
        showToast("Reviewed matters opened, but their seen status couldn't be saved in this browser.");
      }
    }
    setDecisionHistoryOpen(opening);
  };

  const decide = async (intake: Intake, result: Decision["result"]) => {
    setBusyIntakeId(intake.id);
    const animation = animateIntakeToReviewed(intake.id);
    try {
      const updated = await updateIntakeStatus(intake, result);
      if (animation) {
        await animation.finished.catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) throw error;
        });
      }
      setIntakes((current) => current.filter((item) => item.id !== intake.id));
      setDecisions((current) => [...current.filter(({ intake: item }) => item.id !== intake.id), {
        intake: updated,
        result,
      }]);
      const nextSeenIds = new Set(seenDecisionIds);
      const decisionWasSeen = nextSeenIds.delete(intake.id);
      setSeenDecisionIds(nextSeenIds);
      if (decisionWasSeen) {
        try {
          window.localStorage.setItem(seenDecisionIdsStorageKey, JSON.stringify([...nextSeenIds]));
        } catch (error) {
          console.error("Unable to update reviewed-matter status.", error);
          showToast(`${intake.reference} ${result}. Unread status couldn't be saved in this browser.`, true);
          decisionHistoryButtonRef.current?.focus({ preventScroll: true });
          return;
        }
      }
      decisionHistoryButtonRef.current?.focus({ preventScroll: true });
      showToast(`${intake.reference} ${result}.`, true);
    } catch (error) {
      animation?.cancel();
      showToast(error instanceof Error ? error.message : "Unable to save the intake decision.");
    } finally {
      setWarpingIntakeIds((current) => {
        const next = new Set(current);
        next.delete(intake.id);
        return next;
      });
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
      const nextSeenIds = new Set(seenDecisionIds);
      if (nextSeenIds.delete(last.intake.id)) {
        setSeenDecisionIds(nextSeenIds);
        try {
          window.localStorage.setItem(seenDecisionIdsStorageKey, JSON.stringify([...nextSeenIds]));
        } catch (error) {
          console.error("Unable to update reviewed-matter status.", error);
          showToast("Matter restored, but its unread status couldn't be updated in this browser.");
          return;
        }
      }
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
    setIntakeDeadline("");
    setIntakeCaseStage("");
    setSelectedUrgencyFlags([]);
    setAiFilledFields(new Set());
    setSelectedFiles([]);
    setIntakeStage("choose");
    setIntakePath(null);
    setMaskIdentifiers(true);
    setDocumentConsent(false);
    setManualAiConsent(false);
    setIntakeReview(null);
    setIntakeAiReviewError("");
    setIsGeneratingIntakeReview(false);
    setIsDraggingFiles(false);
  };

  const closeNewIntake = () => {
    intakeReviewRequestRef.current?.abort();
    intakeReviewRequestRef.current = null;
    if (intakeDialogRef.current?.open) intakeDialogRef.current.close();
    setNewIntakeOpen(false);
  };

  const openNewIntake = () => {
    setNewIntakeOpen(true);
  };

  const createIntakeDraft = (): Intake => ({
    id: "00000000-0000-4000-8000-000000000000",
    reference: "Intake preview",
    domain: intakeSpecialty || "Other",
    risk: "Unassessed",
    client: intakeTitle.trim() || "Untitled intake",
    summary: intakeDescription.trim() || "Details pending lawyer review.",
    received: "Just now",
    receivedOrder: 3,
    deadline: intakeDeadline ? `Due ${intakeDeadline}` : "No deadline set",
    deadlineOrder: 99,
    deadlineAt: intakeDeadline ? new Date(`${intakeDeadline}T12:00:00.000Z`).toISOString() : null,
    caseStage: intakeCaseStage,
    urgencyFlags: selectedUrgencyFlags,
    documents: selectedFiles.map((file) => file.name),
    priorityScore: null,
    status: "pending",
    isSample: false,
    aiSummary: null,
  });

  const addDocuments = (files: FileList | File[]) => {
    const incomingFiles = Array.from(files);
    const supportedExtensions = new Set(["pdf", "docx", "txt", "jpg", "jpeg", "png"]);
    const supportedFiles = incomingFiles.filter((file) => {
      if (supportedExtensions.has(file.name.toLowerCase().split(".").pop() ?? "")) return true;
      showToast(`${file.name} is not supported. Choose a PDF, DOCX, TXT, JPG, or PNG file.`);
      return false;
    });
    const sizeValidFiles = supportedFiles.filter((file) => {
      if (file.size <= 5 * 1024 * 1024) return true;
      showToast(`${file.name} is larger than the 5 MB per-file limit.`);
      return false;
    });
    const existingKeys = new Set(selectedFiles.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
    const newFiles = sizeValidFiles.filter((file) => !existingKeys.has(`${file.name}:${file.size}:${file.lastModified}`));
    const availableSlots = Math.max(0, 5 - selectedFiles.length);
    if (newFiles.length > availableSlots) {
      showToast("You can select up to 5 documents for one AI review.");
    }
    let totalSize = selectedFiles.reduce((size, file) => size + file.size, 0);
    const filesWithinTotalLimit = newFiles.slice(0, availableSlots).filter((file) => {
      if (totalSize + file.size > 10 * 1024 * 1024) {
        showToast("Selected documents cannot exceed 10 MB in total.");
        return false;
      }
      totalSize += file.size;
      return true;
    });
    setSelectedFiles((current) => [...current, ...filesWithinTotalLimit]);
  };

  const generateSampleSummary = async (intake: Intake) => {
    if (!intake.isSample || intake.aiSummary || generatingSummaryId === intake.id) return;
    setGeneratingSummaryId(intake.id);
    try {
      const response = await fetch(`/api/intakes/${intake.id}/summary`, {
        method: "POST",
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) throw new Error(await getResponseError(response, "Unable to generate summary."));
      const parsed = intakeResponseSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error("The summary service returned an invalid response.");
      const updated = parsed.data.intake;
      setIntakes((current) => current.map((item) => item.id === updated.id ? updated : item));
      setExpandedAiSummaryIds((current) => new Set(current).add(updated.id));
      setTypingSummaryId(updated.id);
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

  const requestIntakeAiReview = async (includeDocuments: boolean) => {
    if (isGeneratingIntakeReview || (includeDocuments && (!documentConsent || selectedFiles.length === 0))) return;
    const controller = new AbortController();
    intakeReviewRequestRef.current?.abort();
    intakeReviewRequestRef.current = controller;
    setIsGeneratingIntakeReview(true);
    setIntakeAiReviewError("");

    try {
      const formData = new FormData();
      formData.append("intake", JSON.stringify({
        title: intakeTitle,
        description: intakeDescription,
        domain: intakeSpecialty,
        deadlineAt: intakeDeadline || null,
        caseStage: intakeCaseStage,
        urgencyFlags: selectedUrgencyFlags,
        documents: includeDocuments ? selectedFiles.map((file) => file.name) : [],
      }));
      formData.append("maskIdentifiers", String(maskIdentifiers));
      formData.append("mode", includeDocuments ? "extract" : "score");
      formData.append("aiConsent", String(intakePath === "documents" ? documentConsent : manualAiConsent));
      if (includeDocuments) {
        selectedFiles.forEach((file) => formData.append("files", file, file.name));
      }
      const response = await fetch("/api/intakes/review", {
        method: "POST",
        body: formData,
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]),
      });
      if (!response.ok) throw new Error(await getResponseError(response, "Unable to generate an AI review."));
      const payload: unknown = await response.json();
      if (controller.signal.aborted) return;

      const previousReview = intakeReview;
      if (includeDocuments) {
        const parsed = intakeAiExtractionResponseSchema.safeParse(payload);
        if (!parsed.success) throw new Error("The document extraction service returned an invalid response.");
        const { extraction: review } = parsed.data;
        setIntakeTitle(review.title);
        setIntakeDescription(review.description);
        setIntakeSpecialty(review.domain);
        setIntakeDeadline(review.deadlineAt ?? "");
        setIntakeCaseStage(review.caseStage);
        setSelectedUrgencyFlags(review.urgencyFlags);
        const filledFields = new Set<keyof IntakeFieldSources>();
        if (review.title) filledFields.add("title");
        if (review.description) filledFields.add("description");
        if (review.domain) filledFields.add("domain");
        if (review.deadlineAt) filledFields.add("deadlineAt");
        if (review.caseStage) filledFields.add("caseStage");
        if (review.urgencyFlags.length) filledFields.add("urgencyFlags");
        setAiFilledFields(filledFields);
        setIntakeReview({
          intake: {
            ...createIntakeDraft(),
            client: review.title,
            domain: review.domain,
            deadline: review.deadlineAt ? `Due ${review.deadlineAt}` : "No deadline set",
            deadlineAt: review.deadlineAt ? new Date(`${review.deadlineAt}T12:00:00.000Z`).toISOString() : null,
            caseStage: review.caseStage,
            urgencyFlags: review.urgencyFlags,
          },
          summary: review.summary,
          signals: review.signals.length ? review.signals : ["No immediate urgency signals stated"],
          source: "ai",
          provider: review.provider,
          documentReview: review.documentReview,
          fieldSources: review.fieldSources,
        });
        setIntakeStage("details");
      } else {
        const parsed = intakeAiReviewResponseSchema.safeParse(payload);
        if (!parsed.success) throw new Error("The AI scoring service returned an invalid assessment.");
        const { review } = parsed.data;
        const draft = previousReview?.intake ?? createIntakeDraft();
        setIntakeReview({
          intake: {
            ...draft,
            client: intakeTitle.trim() || "Untitled intake",
            domain: intakeSpecialty || "Other",
            summary: intakeDescription.trim() || "Details pending lawyer review.",
            deadline: intakeDeadline ? `Due ${intakeDeadline}` : "No deadline set",
            deadlineAt: intakeDeadline ? new Date(`${intakeDeadline}T12:00:00.000Z`).toISOString() : null,
            caseStage: intakeCaseStage,
            urgencyFlags: selectedUrgencyFlags,
            documents: selectedFiles.map((file) => file.name),
            priorityScore: review.priorityScore,
            risk: review.risk,
          },
          summary: review.summary,
          signals: review.signals.length ? review.signals : ["No immediate urgency signals stated"],
          source: "ai",
          provider: review.provider,
          documentReview: previousReview?.documentReview,
          fieldSources: previousReview?.fieldSources,
          factors: review.factors,
        });
        setIntakeStage("result");
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
        setIntakeAiReviewError(timedOut
          ? includeDocuments
            ? "BatasBot took too long to read this file. You can try again or switch to manual entry; your selected files are still here."
            : "BatasBot took too long to score these details. Your work is still here; try again."
          : error instanceof Error ? error.message : "Unable to generate an AI review.");
      }
    } finally {
      if (intakeReviewRequestRef.current === controller) {
        intakeReviewRequestRef.current = null;
        setIsGeneratingIntakeReview(false);
      }
    }
  };

  const submitIntakeDetails = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (intakePath === "manual" && !manualAiConsent) return;
    void requestIntakeAiReview(false);
  };

  const clearAiFieldSource = (field: keyof IntakeFieldSources) => {
    setAiFilledFields((current) => {
      const next = new Set(current);
      next.delete(field);
      return next;
    });
    setIntakeReview((current) => {
      if (!current?.fieldSources) return current;
      return {
        ...current,
        fieldSources: {
          ...current.fieldSources,
          [field]: { document: null, page: null },
        },
      };
    });
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
          deadlineAt: intakeDeadline || null,
          caseStage: intakeCaseStage,
          urgencyFlags: selectedUrgencyFlags,
          priorityScore: intakeReview.intake.priorityScore,
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
      clearManualIntake();
      showToast("Intake saved to your workspace.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to save intake.");
    } finally {
      setIsSavingIntake(false);
    }
  };

  const unavailable = (label: string) => showToast(`${label} is not part of this demo yet.`);
  const calculatedIntakeScore = intakeReview?.factors
    ? Math.min(100,
        intakeReview.factors.temporalDeadlines.score
          + intakeReview.factors.caseRiskImpact.score
          + intakeReview.factors.proceduralStatus.score
          + intakeReview.factors.severityBonus.score,
      )
    : null;
  const scoreManuallyOverridden = calculatedIntakeScore !== null
    && intakeReview?.intake.priorityScore !== calculatedIntakeScore;
  const hasUnsavedIntakeDraft = Boolean(
    intakeTitle.trim()
      || intakeDescription.trim()
      || intakeSpecialty
      || intakeDeadline
      || intakeCaseStage
      || selectedUrgencyFlags.length
      || selectedFiles.length
      || intakePath
      || intakeReview
      || intakeStage !== "choose",
  );

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
                  ref={decisionHistoryButtonRef}
                  className="reviewed-button"
                  type="button"
                  aria-controls="reviewed-matters-panel"
                  aria-expanded={decisionHistoryOpen}
                  aria-label={decisionHistoryOpen
                    ? "Show intake queue"
                    : `Show reviewed matters${unseenDecisionCount > 0 ? `, ${unseenDecisionCount} unseen` : ""}`}
                  onClick={toggleDecisionHistory}
                >
                  <ClipboardCheck aria-hidden="true" size={10.72} />
                  {decisionHistoryOpen ? "Queue" : "Reviewed"}
                  <span className="reviewed-count">{decisions.length}</span>
                  {unseenDecisionCount > 0 && (
                    <span className="reviewed-unseen-count" aria-hidden="true">
                      {unseenDecisionCount > 99 ? "99+" : unseenDecisionCount}
                    </span>
                  )}
                  <span className="sr-only" aria-live="polite">
                    {unseenDecisionCount > 0 ? `${unseenDecisionCount} reviewed matters not yet seen.` : ""}
                  </span>
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
                      { value: "Low", label: "Low Risk" },
                      { value: "Unassessed", label: "Needs Review" },
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
                    className={`intake-card${warpingIntakeIds.has(intake.id) ? " is-warping" : ""}`}
                    id={`intake-${intake.id}`}
                    key={intake.id}
                    ref={(element) => {
                      if (element) intakeCardRefs.current.set(intake.id, element);
                      else intakeCardRefs.current.delete(intake.id);
                    }}
                  >
                    <div className="intake-card-top">
                      <div className="intake-tags">
                        <span className="intake-id">{intake.reference}</span>
                        {intake.isSample && <span className="intake-sample-badge">SAMPLE</span>}
                        <span className="domain-tag">{intake.domain}</span>
                      </div>
                      <span className={`risk-label risk-label--${intake.risk.toLowerCase()}`}>
                        <span />{intake.risk === "Critical"
                          ? "Critical Alert"
                          : intake.risk === "Unassessed" ? "Needs Review" : `${intake.risk} Priority`}
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
                          <details
                            className="sample-ai-summary-details"
                            open={expandedAiSummaryIds.has(intake.id)}
                            onToggle={(event) => {
                              const isOpen = event.currentTarget.open;
                              setExpandedAiSummaryIds((current) => {
                                const next = new Set(current);
                                if (isOpen) next.add(intake.id);
                                else next.delete(intake.id);
                                return next;
                              });
                            }}
                          >
                            <summary>
                              <span className="sample-ai-summary-title">
                                <Sparkles aria-hidden="true" size={13.4} fill="currentColor" strokeWidth={1.7} />
                                <strong>AI Summary</strong>
                              </span>
                              <ChevronDown aria-hidden="true" size={12} />
                            </summary>
                            <AiSummaryContent
                              id={intake.id}
                              summary={intake.aiSummary}
                              shouldAnimate={typingSummaryId === intake.id}
                              onComplete={handleSummaryTypingComplete}
                            />
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
                <div className="rail-panel-heading"><h2>Queue Diagnostics</h2></div>
                <div className="stat-grid">
                  <div className="stat-tile"><strong>{queueStats.pendingCount}</strong><span>Pending intake</span></div>
                  <div className="stat-tile"><strong>{queueStats.activeCases}</strong><span>Active cases</span></div>
                  <div className="stat-tile"><strong>{queueStats.reviewedCount}</strong><span>Reviewed matters</span></div>
                  <div className="stat-tile"><strong>{queueStats.approvalRate}%</strong><span>Acceptance rate</span></div>
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
          aria-labelledby="new-intake-heading"
          onCancel={(event) => {
            event.preventDefault();
            closeNewIntake();
          }}
          onClose={() => setNewIntakeOpen(false)}
          onClick={(event) => {
            if (event.target === event.currentTarget) closeNewIntake();
          }}
        >
          <div className="new-intake-dialog-content">
            <header className="new-intake-dialog-header">
              <div className="new-intake-heading-copy">
                <h2 id="new-intake-heading">New intake</h2>
                <p>Capture the facts first. BatasBot scores only after you confirm them. Close anytime; your draft stays in this tab.</p>
              </div>
              <div className="new-intake-dialog-actions">
                {hasUnsavedIntakeDraft && (
                  <button
                    className="intake-discard-draft"
                    type="button"
                    onClick={() => {
                      if (!window.confirm("Discard this unsaved intake draft?")) return;
                      closeNewIntake();
                      clearManualIntake();
                    }}
                  >
                    Discard draft
                  </button>
                )}
                <button className="quiet-icon-button" type="button" aria-label="Close new intake" onClick={closeNewIntake}>
                  <X aria-hidden="true" size={13.4} />
                </button>
              </div>
              <ol className="intake-progress" aria-label="Intake progress">
                {[
                  ["choose", "Choose"],
                  ["details", "Details"],
                  ["result", "Score"],
                ].map(([step, label], index) => {
                  const currentStep = intakeStage === "choose" ? 0
                    : intakeStage === "result" ? 2 : 1;
                  return (
                    <li className={index === currentStep ? "is-current" : index < currentStep ? "is-complete" : ""} key={step}>
                      <span>{index < currentStep ? <Check aria-hidden="true" size={10} /> : index + 1}</span>
                      {label}
                    </li>
                  );
                })}
              </ol>
            </header>

            {intakeStage === "choose" && (
              <section className="intake-method-screen" aria-labelledby="intake-method-heading">
                <div className="intake-method-intro">
                  <h3 id="intake-method-heading">How would you like to start?</h3>
                  <p>Choose the path that fits the information you have.</p>
                </div>
                <button
                  className="intake-method-option intake-method-option--documents"
                  type="button"
                  onClick={() => {
                    setIntakePath("documents");
                    setIntakeStage("upload");
                  }}
                >
                  <span className="intake-method-icon"><FileText aria-hidden="true" size={19} /></span>
                  <span className="intake-method-copy">
                    <strong>Start from documents</strong>
                    <small>Let BatasBot extract key facts for you to review.</small>
                  </span>
                  <ArrowRight aria-hidden="true" size={15} />
                </button>
                <button
                  className="intake-method-option intake-method-option--manual"
                  type="button"
                  onClick={() => {
                    setIntakePath("manual");
                    setIntakeStage("details");
                  }}
                >
                  <span className="intake-method-icon"><FilePenLine aria-hidden="true" size={18} /></span>
                  <span className="intake-method-copy">
                    <strong>Enter details manually</strong>
                    <small>Nothing is sent to BatasBot until you ask it to score the details.</small>
                  </span>
                  <ArrowRight aria-hidden="true" size={15} />
                </button>
                <p className="intake-privacy-footnote">
                  <LockKeyhole aria-hidden="true" size={13} />
                  You review every fact before a score is generated.
                </p>
              </section>
            )}

            {intakeStage === "upload" && (
              <div className="intake-board">
                <section
                  className={`intake-board-main${isGeneratingIntakeReview ? " is-ai-generating" : ""}`}
                  aria-labelledby="intake-upload-heading"
                  aria-busy={isGeneratingIntakeReview}
                >
                  <div className="intake-section-heading">
                    <div>
                      <h3 id="intake-upload-heading">Add matter documents</h3>
                      <p>Upload a clear PDF, Word file, text file, or image.</p>
                    </div>
                    <span className="intake-step-label">DOCUMENTS</span>
                  </div>

                  <div className="intake-consent">
                    <label>
                      <input
                        type="checkbox"
                        checked={documentConsent}
                        onChange={(event) => setDocumentConsent(event.target.checked)}
                      />
                      <span>
                        <strong>I consent to AI document review</strong>
                        <small>Document contents are sent to BatasBot. When masking is on, detectable identifiers in readable text are replaced before sending.</small>
                      </span>
                    </label>
                    <p>
                      When this site uses HTTPS, the request is encrypted in transit. BatasGO does not save uploaded contents.
                      BatasBot processes document contents to generate the requested extraction. Applicable data handling and retention terms apply.
                    </p>
                  </div>

                  <input
                    ref={documentInputRef}
                    className="intake-file-input"
                    type="file"
                    accept=".pdf,.docx,.txt,.jpg,.jpeg,.png"
                    multiple
                    disabled={!documentConsent || isGeneratingIntakeReview}
                    onChange={(event) => {
                      if (event.currentTarget.files) addDocuments(event.currentTarget.files);
                      event.currentTarget.value = "";
                    }}
                  />
                  <button
                    className={`intake-dropzone${isDraggingFiles ? " is-dragging" : ""}`}
                    type="button"
                    disabled={!documentConsent || isGeneratingIntakeReview}
                    onClick={() => documentInputRef.current?.click()}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setIsDraggingFiles(true);
                    }}
                    onDragLeave={() => setIsDraggingFiles(false)}
                    onDrop={(event) => {
                      event.preventDefault();
                      setIsDraggingFiles(false);
                      if (documentConsent) addDocuments(event.dataTransfer.files);
                    }}
                  >
                    <span className="intake-dropzone-icon"><Upload aria-hidden="true" size={16} /></span>
                    <span><strong>Choose documents</strong><small>PDF, DOCX, TXT, JPG, PNG · up to 5 files, 10 MB total</small></span>
                    <span className="intake-dropzone-action">Browse</span>
                  </button>
                  {selectedFiles.length > 0 && (
                    <ul className="intake-file-list" aria-label="Selected documents">
                      {selectedFiles.map((file) => (
                        <li key={`${file.name}-${file.size}-${file.lastModified}`}>
                          <FileText aria-hidden="true" size={14} />
                          <span title={file.name}>{file.name}</span>
                          <small>{file.size < 1024 * 1024 ? `${Math.max(1, Math.round(file.size / 1024))} KB` : `${(file.size / (1024 * 1024)).toFixed(1)} MB`}</small>
                          <button
                            type="button"
                            aria-label={`Remove ${file.name}`}
                            disabled={isGeneratingIntakeReview}
                            onClick={() => setSelectedFiles((current) => current.filter((item) => item !== file))}
                          >
                            <X aria-hidden="true" size={12} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {intakeAiReviewError && (
                    <div className="intake-error-recovery" role="alert">
                      <p>{intakeAiReviewError}</p>
                      <button type="button" onClick={() => {
                        setIntakePath("manual");
                        setIntakeStage("details");
                      }}>
                        Switch to manual entry <ArrowRight aria-hidden="true" size={13} />
                      </button>
                    </div>
                  )}

                  <footer className="intake-board-footer">
                    <button className="intake-cancel-button" type="button" onClick={() => setIntakeStage("choose")}>Back</button>
                    <button
                      className="intake-submit-button"
                      type="button"
                      disabled={!documentConsent || selectedFiles.length === 0 || isGeneratingIntakeReview}
                      onClick={() => void requestIntakeAiReview(true)}
                    >
                      {isGeneratingIntakeReview ? <><Sparkles aria-hidden="true" size={13} /> Reading documents…</> : <>Upload &amp; extract <ArrowRight aria-hidden="true" size={13} /></>}
                    </button>
                  </footer>
                  <span className="sr-only" role="status" aria-live="polite">
                    {isGeneratingIntakeReview ? "BatasBot is reading the selected documents." : ""}
                  </span>
                </section>

                <aside className="intake-board-rail" aria-label="Privacy options">
                  <div className="intake-rail-heading"><h4>Privacy choices</h4></div>
                  <label className="intake-toggle-row">
                    <input
                      type="checkbox"
                      checked={maskIdentifiers}
                      onChange={(event) => setMaskIdentifiers(event.target.checked)}
                    />
                    <span><strong>Mask identifiers where detected</strong><small>Names, phone numbers, addresses, and ID numbers in readable text.</small></span>
                  </label>
                  <p className="intake-rail-note">This is partial risk reduction, not anonymization. Masking cannot be reliably applied to scanned images; you can turn it off only if you approve full-image AI review.</p>
                </aside>
              </div>
            )}

            {intakeStage === "details" && (
              <form className="intake-board" onSubmit={submitIntakeDetails}>
                <section
                  className={`intake-board-main${isGeneratingIntakeReview ? " is-ai-generating" : ""}`}
                  aria-labelledby="intake-details-heading"
                  aria-busy={isGeneratingIntakeReview}
                >
                  <div className="intake-section-heading">
                    <div>
                      <h3 id="intake-details-heading">{intakePath === "documents" ? "Review extracted details" : "Enter matter details"}</h3>
                      <p>{intakePath === "documents" ? "BatasBot's suggestions are marked. Verify every date before scoring." : "Add the key facts BatasBot should consider."}</p>
                    </div>
                    {intakePath === "documents" && <span className="intake-ai-badge"><Sparkles aria-hidden="true" size={12} /> AI draft</span>}
                  </div>

                  {intakePath === "documents" && intakeReview?.documentReview && (
                    <div className="intake-extraction-status">
                      <Check aria-hidden="true" size={14} />
                      <span>
                        Read {intakeReview.documentReview.processedCount} file{intakeReview.documentReview.processedCount === 1 ? "" : "s"}.
                        {intakeReview.documentReview.visionUsed ? " BatasBot reviewed image content." : ""}
                        {intakeReview.documentReview.truncated ? " Some text was shortened." : ""}
                      </span>
                    </div>
                  )}

                  {intakePath === "documents" && !intakeDeadline && (
                    <div className="intake-missing-fact">
                      <CalendarDays aria-hidden="true" size={15} />
                      <p><strong>No deadline found.</strong> Add the next deadline or hearing date if known.</p>
                    </div>
                  )}

                  <div className="intake-form-fields">
                    <label className="intake-form-field" htmlFor="manual-intake-title">
                      <span>Matter title {aiFilledFields.has("title") && <small className="intake-ai-field-tag"><Sparkles aria-hidden="true" size={10} /> AI-filled</small>}</span>
                      {aiFilledFields.has("title") && intakeReview?.fieldSources?.title?.document && (
                        <small className="intake-field-source">From {intakeReview.fieldSources.title.document}{intakeReview.fieldSources.title.page ? ` · page ${intakeReview.fieldSources.title.page}` : ""}</small>
                      )}
                      <input
                        id="manual-intake-title"
                        autoFocus
                        maxLength={120}
                        placeholder="e.g. Unpaid wages and dismissal"
                        value={intakeTitle}
                        onChange={(event) => {
                          setIntakeTitle(event.target.value);
                          clearAiFieldSource("title");
                        }}
                      />
                    </label>
                    <label className="intake-form-field" htmlFor="manual-intake-specialty">
                      <span>Practice area {aiFilledFields.has("domain") && <small className="intake-ai-field-tag"><Sparkles aria-hidden="true" size={10} /> AI-filled</small>}</span>
                      {aiFilledFields.has("domain") && intakeReview?.fieldSources?.domain?.document && (
                        <small className="intake-field-source">From {intakeReview.fieldSources.domain.document}{intakeReview.fieldSources.domain.page ? ` · page ${intakeReview.fieldSources.domain.page}` : ""}</small>
                      )}
                      <select
                        id="manual-intake-specialty"
                        value={intakeSpecialty}
                        onChange={(event) => {
                          setIntakeSpecialty(event.target.value);
                          clearAiFieldSource("domain");
                        }}
                      >
                        <option value="">Select a legal specialty</option>
                        {specialtyOptions.map((specialty) => <option value={specialty} key={specialty}>{specialty}</option>)}
                      </select>
                    </label>
                    <label className="intake-form-field intake-form-field--wide" htmlFor="manual-intake-description">
                      <span>What happened? {aiFilledFields.has("description") && <small className="intake-ai-field-tag"><Sparkles aria-hidden="true" size={10} /> AI-filled</small>}</span>
                      {aiFilledFields.has("description") && intakeReview?.fieldSources?.description?.document && (
                        <small className="intake-field-source">From {intakeReview.fieldSources.description.document}{intakeReview.fieldSources.description.page ? ` · page ${intakeReview.fieldSources.description.page}` : ""}</small>
                      )}
                      <textarea
                        id="manual-intake-description"
                        rows={4}
                        maxLength={1200}
                        placeholder="Summarize the client's situation, key dates, and requested help."
                        value={intakeDescription}
                        onChange={(event) => {
                          setIntakeDescription(event.target.value);
                          clearAiFieldSource("description");
                        }}
                      />
                    </label>
                    <label className="intake-form-field" htmlFor="intake-next-deadline">
                      <span>Next deadline or hearing {aiFilledFields.has("deadlineAt") && <small className="intake-ai-field-tag"><Sparkles aria-hidden="true" size={10} /> AI-filled</small>}</span>
                      {aiFilledFields.has("deadlineAt") && intakeReview?.fieldSources?.deadlineAt?.document && (
                        <small className="intake-field-source">From {intakeReview.fieldSources.deadlineAt.document}{intakeReview.fieldSources.deadlineAt.page ? ` · page ${intakeReview.fieldSources.deadlineAt.page}` : ""}</small>
                      )}
                      <input
                        id="intake-next-deadline"
                        type="date"
                        value={intakeDeadline}
                        onChange={(event) => {
                          setIntakeDeadline(event.target.value);
                          clearAiFieldSource("deadlineAt");
                        }}
                      />
                    </label>
                    <label className="intake-form-field" htmlFor="intake-case-stage">
                      <span>Case stage {aiFilledFields.has("caseStage") && <small className="intake-ai-field-tag"><Sparkles aria-hidden="true" size={10} /> AI-filled</small>}</span>
                      {intakePath === "documents" && !intakeCaseStage && <small className="intake-field-source">No case stage found. Add one if known.</small>}
                      {aiFilledFields.has("caseStage") && intakeReview?.fieldSources?.caseStage?.document && (
                        <small className="intake-field-source">From {intakeReview.fieldSources.caseStage.document}{intakeReview.fieldSources.caseStage.page ? ` · page ${intakeReview.fieldSources.caseStage.page}` : ""}</small>
                      )}
                      <select
                        id="intake-case-stage"
                        value={intakeCaseStage}
                        onChange={(event) => {
                          setIntakeCaseStage(event.target.value);
                          clearAiFieldSource("caseStage");
                        }}
                      >
                        <option value="">Not stated</option>
                        {intakeCaseStages.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
                      </select>
                    </label>
                    <fieldset className="intake-urgency-fieldset intake-form-field--wide">
                      <legend>Urgency flags {aiFilledFields.has("urgencyFlags") && <small className="intake-ai-field-tag"><Sparkles aria-hidden="true" size={10} /> AI-filled</small>}</legend>
                      {intakePath === "documents" && !selectedUrgencyFlags.length && <small className="intake-field-source">No urgency flags found. Add any that apply.</small>}
                      {aiFilledFields.has("urgencyFlags") && intakeReview?.fieldSources?.urgencyFlags?.document && (
                        <small className="intake-field-source">From {intakeReview.fieldSources.urgencyFlags.document}{intakeReview.fieldSources.urgencyFlags.page ? ` · page ${intakeReview.fieldSources.urgencyFlags.page}` : ""}</small>
                      )}
                      <div className="intake-urgency-options">
                        {intakeUrgencyFlags.map((flag) => (
                          <label key={flag}>
                            <input
                              type="checkbox"
                              checked={selectedUrgencyFlags.includes(flag)}
                              onChange={(event) => {
                                setSelectedUrgencyFlags((current) => event.target.checked
                                  ? [...current, flag]
                                  : current.filter((item) => item !== flag));
                                clearAiFieldSource("urgencyFlags");
                              }}
                            />
                            {flag}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  </div>

                  {intakePath === "manual" && (
                    <section className="intake-manual-privacy">
                      <label className="intake-toggle-row">
                        <input type="checkbox" checked={manualAiConsent} onChange={(event) => setManualAiConsent(event.target.checked)} />
                        <span><strong>Send these confirmed details to BatasBot for scoring</strong><small>BatasBot scores only after you check this and choose the scoring action.</small></span>
                      </label>
                      <label className="intake-toggle-row">
                        <input type="checkbox" checked={maskIdentifiers} onChange={(event) => setMaskIdentifiers(event.target.checked)} />
                        <span><strong>Mask identifiers before AI review</strong><small>Pattern checks replace some names, phone numbers, addresses, and ID numbers with tokens.</small></span>
                      </label>
                            <p>This is partial risk reduction, not anonymization. Your details stay in this form until you choose “Score with AI”; that action sends them to BatasBot.</p>
                    </section>
                  )}

                  {intakeAiReviewError && <p className="intake-ai-review-error" role="alert">{intakeAiReviewError}</p>}
                  <footer className="intake-board-footer">
                    <button className="intake-cancel-button" type="button" onClick={() => setIntakeStage(intakePath === "documents" ? "upload" : "choose")}>Back</button>
                    <div>
                      <button className="intake-submit-button" type="submit" disabled={isGeneratingIntakeReview || (!intakeTitle.trim() && !intakeDescription.trim()) || (intakePath === "manual" && !manualAiConsent)}>
                        {isGeneratingIntakeReview ? <><Sparkles aria-hidden="true" size={13} /> Scoring details…</> : <>Looks good — score with AI <ArrowRight aria-hidden="true" size={13} /></>}
                      </button>
                    </div>
                  </footer>
                  <span className="sr-only" role="status" aria-live="polite">
                    {isGeneratingIntakeReview ? "BatasBot is scoring the confirmed intake details." : ""}
                  </span>
                </section>

                <aside className="intake-board-rail" aria-label="Review guidance">
                  <div className="intake-rail-heading"><h4>Check before scoring</h4></div>
                  <p>Confirm the names, dates, and facts against the original. AI suggestions can be wrong; they are not legal advice.</p>
                  {intakePath === "documents" && (
                    <>
                      <div className="intake-rail-divider" />
                      <h4>Files reviewed</h4>
                      <ul className="intake-reviewed-files">
                        {selectedFiles.map((file) => <li key={`${file.name}-${file.size}-${file.lastModified}`}><FileText aria-hidden="true" size={13} /><span>{file.name}</span></li>)}
                      </ul>
                    </>
                  )}
                  <div className="intake-provider-note">
                    <span>{intakePath === "documents"
                      ? "The confirmed fields—not the original file—are sent for scoring."
                      : "Nothing is sent to BatasBot until you choose the scoring action."}</span>
                  </div>
                </aside>
              </form>
            )}

            {intakeStage === "result" && intakeReview && (
              <section className="intake-score-board" aria-labelledby="intake-score-heading">
                <div className="intake-score-main">
                  <header className="intake-review-header">
                    <div>
                      <h3 id="intake-score-heading">AI urgency score</h3>
                      <p>{intakeReview.intake.client} · {intakeReview.intake.domain}</p>
                    </div>
                    <div className={`intake-review-rating intake-review-rating--${intakeReview.intake.risk.toLowerCase()}`}>
                      <span className={`intake-review-risk intake-review-risk--${intakeReview.intake.risk.toLowerCase()}`}>{intakeReview.intake.risk}</span>
                      <small>{getRiskAction(intakeReview.intake.risk)}</small>
                    </div>
                  </header>

                  <section className={`intake-review-score intake-review-score--${intakeReview.intake.risk.toLowerCase()}`} aria-label="Priority score">
                    <div className="intake-score-value-row">
                      <strong>{intakeReview.intake.priorityScore ?? "—"}</strong>
                      <span>/100</span>
                      {scoreManuallyOverridden && <small>Manual override</small>}
                    </div>
                    {intakeReview.intake.priorityScore !== null && (
                      <div className="intake-review-meter" role="progressbar" aria-label="Urgency score" aria-valuemin={0} aria-valuemax={100} aria-valuenow={intakeReview.intake.priorityScore}>
                        <span style={{ width: `${intakeReview.intake.priorityScore}%` }} />
                      </div>
                    )}
                    <label className="intake-score-override" htmlFor="intake-score-override">
                      <span>Adjust score</span>
                      <input
                        id="intake-score-override"
                        type="range"
                        min="0"
                        max="100"
                        value={intakeReview.intake.priorityScore ?? 0}
                        style={{ "--score-progress": `${intakeReview.intake.priorityScore ?? 0}%` } as CSSProperties}
                        onChange={(event) => {
                          const score = Number(event.target.value);
                          setIntakeReview((current) => current ? {
                            ...current,
                            intake: { ...current.intake, priorityScore: score, risk: getRiskFromScore(score) },
                          } : current);
                        }}
                      />
                    </label>
                  </section>

                  {intakeReview.factors && (
                    <details className="intake-review-breakdown" aria-labelledby="intake-review-breakdown-heading">
                      <summary>
                        <span id="intake-review-breakdown-heading">Score breakdown</span>
                        <ChevronDown aria-hidden="true" size={14} />
                      </summary>
                      <div className="intake-review-breakdown-content">
                        <dl>
                          {([
                            ["Temporal deadlines", intakeReview.factors.temporalDeadlines, 50],
                            ["Case risk & impact", intakeReview.factors.caseRiskImpact, 30],
                            ["Procedural status", intakeReview.factors.proceduralStatus, 20],
                            ["AI severity bonus", intakeReview.factors.severityBonus, 10],
                          ] as const).map(([label, factor, maximum]) => (
                            <div className="intake-review-factor" key={label}>
                              <dt>{label}<span>{factor.score}/{maximum}</span></dt>
                              <dd>{factor.rationale}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    </details>
                  )}
                  <section className="intake-result-summary">
                    <div className="intake-result-summary-header">
                      <div className="intake-result-summary-label">
                        <span className="intake-result-summary-badge" aria-hidden="true">
                          <Sparkles size={9.38} fill="currentColor" strokeWidth={1.7} />
                        </span>
                        <h4>BatasBot Summary</h4>
                      </div>
                    </div>
                    <p>{intakeReview.summary}</p>
                  </section>
                </div>

                <aside className="intake-score-rail">
                  <div className="intake-rail-heading"><ClipboardCheck aria-hidden="true" size={16} /><h4>Confirmed details</h4></div>
                  <dl>
                    <div><dt>Next date</dt><dd>{intakeDeadline || "No deadline set"}</dd></div>
                    <div><dt>Case stage</dt><dd>{intakeCaseStage || "Not stated"}</dd></div>
                    <div><dt>Urgency flags</dt><dd>{selectedUrgencyFlags.length ? selectedUrgencyFlags.join(", ") : "None selected"}</dd></div>
                    <div><dt>Signals</dt><dd>{intakeReview.signals.length}</dd></div>
                  </dl>

                  {intakeReview.documentReview && (
                    <small className="intake-review-document-note">Read {intakeReview.documentReview.processedCount} file{intakeReview.documentReview.processedCount === 1 ? "" : "s"}{intakeReview.documentReview.truncated ? " · some text shortened" : ""}.</small>
                  )}
                </aside>

                <footer className="intake-board-footer intake-board-footer--result">
                  <button className="intake-cancel-button" type="button" disabled={isSavingIntake} onClick={() => setIntakeStage("details")}>Edit details &amp; rescore</button>
                  <button className="intake-submit-button" type="button" disabled={isSavingIntake} onClick={() => void proceedWithManualIntake()}>
                    {isSavingIntake ? "Saving…" : "Save intake"} <ArrowRight aria-hidden="true" size={13} />
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
