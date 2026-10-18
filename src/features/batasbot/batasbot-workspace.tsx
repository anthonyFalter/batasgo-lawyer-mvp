"use client";

import {
  ArrowUp,
  Bot,
  BriefcaseBusiness,
  CalendarClock,
  Check,
  ChevronDown,
  Clock3,
  FileText,
  ListChecks,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import {
  createCitizenJournalTextFile,
  isCitizenJournalHandoffContext,
  type CitizenJournalHandoffContext,
} from "@/lib/citizen/journal-handoff-context";
import { intakeAiExtractionResponseSchema } from "@/lib/intakes/validation";
import { useTypingStream } from "@/hooks/use-typing-stream";
import WorkspaceShell from "../workspace/workspace-shell";
import ReactMarkdown from "react-markdown";
import "./batasbot-workspace.css";

type ChatLink = {
  label: string;
  href: string;
  icon: typeof FileText;
};

type ChatMessage = {
  id: string; // uuid from DB, or temp string for optimistic UI
  role: "assistant" | "user";
  content: string;
  links?: ChatLink[];
  intakeReview?: IntakeReviewVisual;
  journalReview?: JournalReviewVisual;
  attachmentName?: string;
};

type MatterTableRow = {
  reference: string;
  status: string;
  client: string;
  domain: string;
  risk: string;
  summary: string;
};

function parseMatterTable(content: string) {
  const match = content.match(/\[\[MATTER_TABLE\]\]\s*([\s\S]*?)\s*\[\[\/MATTER_TABLE\]\]/);
  if (!match) return null;
  try {
    const parsed: unknown = JSON.parse(match[1]);
    if (!parsed || typeof parsed !== "object" || !("rows" in parsed) || !Array.isArray(parsed.rows)) return null;
    const rows = parsed.rows.filter((row): row is MatterTableRow =>
      Boolean(row)
      && typeof row === "object"
      && ["reference", "status", "client", "domain", "risk", "summary"].every((key) =>
        key in row && typeof row[key as keyof MatterTableRow] === "string"),
    );
    return rows.length > 0 ? { before: content.slice(0, match.index), rows, after: content.slice((match.index ?? 0) + match[0].length) } : null;
  } catch {
    return null;
  }
}

function MatterTable({ rows }: { rows: MatterTableRow[] }) {
  return (
    <div className="batasbot-matter-table-wrap">
      <table className="batasbot-matter-table">
        <caption className="sr-only">Matching workspace matters</caption>
        <thead>
          <tr>
            <th scope="col">Matter Reference</th>
            <th scope="col">Status</th>
            <th scope="col">Client</th>
            <th scope="col">Domain</th>
            <th scope="col">Risk</th>
            <th scope="col">Issue Summary</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.reference}-${row.client}`}>
              <td>
                <div className="batasbot-matter-table-reference">
                  <strong>{row.reference}</strong>
                  <Link
                    className="batasbot-view-matter-button"
                    href={`/dashboard?matter=${encodeURIComponent(row.reference)}`}
                    aria-label={`Visit ${row.reference}`}
                  >
                    Visit
                  </Link>
                </div>
              </td>
              <td>{row.status}</td>
              <td>{row.client}</td>
              <td>{row.domain}</td>
              <td>{row.risk}</td>
              <td>{row.summary}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function isMatterReference(value: string) {
  return /^(?:DEMO-)?INTAKE-\d{4}-[A-Z0-9-]+$/i.test(value) || /^DEMO-INTAKE-\d{3}$/i.test(value);
}

function MatterMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      components={{
        strong: ({ children }: { children?: ReactNode }) => {
          const reference = typeof children === "string" ? children.trim() : "";
          if (!isMatterReference(reference)) return <strong>{children}</strong>;
          return (
            <span className="batasbot-matter-reference">
              <strong>{reference}</strong>
              <Link className="batasbot-view-matter-button" href={`/dashboard?matter=${encodeURIComponent(reference)}`}>
                View matter
              </Link>
            </span>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

type IntakeReviewVisual = {
  risk: string;
  deadline: string;
  signals: string[];
  specialty: string;
  specialtyMatch: boolean;
};

type JournalReviewVisual = {
  sourceFile: string;
  summary: string;
  domain: string;
  deadlineAt: string | null;
  caseStage: string;
  signals: string[];
  truncated: boolean;
};

function isIntakeReviewVisual(value: unknown): value is IntakeReviewVisual {
  if (!value || typeof value !== "object") return false;
  const review = value as Partial<IntakeReviewVisual>;
  return typeof review.risk === "string"
    && typeof review.deadline === "string"
    && Array.isArray(review.signals)
    && review.signals.every((signal) => typeof signal === "string")
    && typeof review.specialty === "string"
    && typeof review.specialtyMatch === "boolean";
}

function isJournalReviewVisual(value: unknown): value is JournalReviewVisual {
  if (!value || typeof value !== "object") return false;
  const review = value as Partial<JournalReviewVisual>;
  return typeof review.sourceFile === "string"
    && typeof review.summary === "string"
    && typeof review.domain === "string"
    && (review.deadlineAt === null || typeof review.deadlineAt === "string")
    && typeof review.caseStage === "string"
    && Array.isArray(review.signals)
    && review.signals.every((signal) => typeof signal === "string")
    && typeof review.truncated === "boolean";
}

function isCreatedChatSession(value: unknown): value is { id: string; title: string; updatedAt: string } {
  if (!value || typeof value !== "object") return false;
  return "id" in value
    && typeof value.id === "string"
    && "title" in value
    && typeof value.title === "string"
    && "updatedAt" in value
    && typeof value.updatedAt === "string";
}

type ChatSession = {
  id: string;
  title: string;
  updatedAt: string; // ISO string
  preview?: string;  // last message snippet
};

type TriageChatHandoff = {
  id: string;
  domain: string;
  risk: string;
  deadline: string;
  summary: string;
  reasons: string[];
  signals?: string[];
  specialty: string;
};

const STARTER_PROMPTS = [
  { label: "Help me draft a document", icon: FileText },
  { label: "Find a matter in my workspace", icon: Search },
];

function getSessionTitle(prompt: string) {
  const cleanPrompt = prompt
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[?.!]+$/, "");
  const prepareMatch = cleanPrompt.match(/^what should i prepare for\s+(.+)$/i);
  if (prepareMatch?.[1]) return `Preparing for ${prepareMatch[1]}`;

  const actionMatch = cleanPrompt.match(/^(?:please\s+)?(?:help me\s+)?(draft|find|review|create|prepare|explain|summarize|write|organize|plan)\b\s*(.*)$/i);
  if (actionMatch) {
    const [, verb, subject] = actionMatch;
    const gerund = verb.toLowerCase() === "write"
      ? "Writing"
      : verb.toLowerCase() === "plan"
        ? "Planning"
        : verb.toLowerCase().endsWith("e")
          ? `${verb.slice(0, -1)}ing`
          : `${verb}ing`;
    return `${gerund.charAt(0).toUpperCase()}${gerund.slice(1)}${subject ? ` ${subject}` : ""}`;
  }

  const words = cleanPrompt.split(" ");
  const concise = words.slice(0, 8).join(" ");
  return concise.length <= 48 ? concise : `${concise.slice(0, 45).trimEnd()}...`;
}

function cleanSessionTitle(title: string) {
  return title
    .replace(/\*\*/g, "")
    .replace(/[`#]/g, "")
    .replace(/^[-*]\s+/, "")
    .trim()
    .slice(0, 255);
}

function getExchangeTitle(prompt: string, reply: string) {
  const issueMatch = reply.match(/\bIssue\b\s*[:\-–]\s*(.+?)(?:\n|$)/i);
  if (issueMatch?.[1]) return cleanSessionTitle(issueMatch[1].replace(/[.!?]+$/, ""));
  if (/\bUPL\b|unauthorized practice of law/i.test(`${prompt}\n${reply}`)) {
    return "Unauthorized Practice Of Law";
  }
  return cleanSessionTitle(getSessionTitle(prompt));
}

function getIntakeReviewSessionTitle(handoff: TriageChatHandoff) {
  return `${handoff.id} · ${handoff.domain} · ${handoff.risk} risk`;
}

function normalizeSessions(sessionList: ChatSession[]) {
  const sessionsById = new Map<string, ChatSession>();
  for (const session of sessionList) {
    const normalizedSession = { ...session, title: cleanSessionTitle(session.title) };
    const existing = sessionsById.get(normalizedSession.id);
    sessionsById.set(normalizedSession.id, existing
      ? {
        ...existing,
        ...normalizedSession,
        preview: normalizedSession.preview ?? existing.preview,
      }
      : normalizedSession);
  }
  return [...sessionsById.values()];
}

function isTriageChatHandoff(value: unknown): value is TriageChatHandoff {
  if (!value || typeof value !== "object") return false;
  const handoff = value as Partial<TriageChatHandoff>;
  return typeof handoff.id === "string"
    && typeof handoff.domain === "string"
    && typeof handoff.risk === "string"
    && typeof handoff.deadline === "string"
    && typeof handoff.summary === "string"
    && Array.isArray(handoff.reasons)
    && handoff.reasons.every((reason) => typeof reason === "string")
    && (Array.isArray(handoff.signals) && handoff.signals.every((signal) => typeof signal === "string")
      || handoff.signals === undefined)
    && typeof handoff.specialty === "string";
}

function explainTriageHandoff(handoff: TriageChatHandoff) {
  const signals = handoff.signals
    ? handoff.signals.join(" · ")
    : handoff.reasons
      .filter((reason) => !/^(Fits|Outside profile specialty:)/.test(reason))
      .slice(0, 3)
      .join(" · ");
  const summaryText = handoff.summary.trim().replace(/\s*\.+\s*$/, "");
  const deadline = handoff.deadline && !/^no deadline set$/i.test(handoff.deadline)
    ? `Deadline: ${handoff.deadline}.`
    : "Deadline: not stated.";
  const signalText = signals ? `Signals: ${signals}.` : "Signals: none stated.";
  return `${handoff.id} | ${handoff.domain} | ${handoff.risk} risk. ${deadline} Summary: ${summaryText}. ${signalText}`;
}

function getIntakeReviewVisual(handoff: TriageChatHandoff): IntakeReviewVisual {
  const signals = handoff.signals ?? handoff.reasons
    .flatMap((reason) => reason.split(" · "))
    .filter((reason) => !/risk indicators$/i.test(reason)
      && !/^(review deadline:|closing in|time-sensitive follow-up)/i.test(reason)
      && !/^(fits|outside profile specialty:)/i.test(reason)
      && !/^no immediate need signals found/i.test(reason))
    .map((reason) => reason.replace(/ reported$/i, ""));

  return {
    risk: handoff.risk,
    deadline: handoff.deadline,
    signals,
    specialty: handoff.specialty,
    specialtyMatch: handoff.reasons.some((reason) => reason.startsWith("Fits ")),
  };
}

function IntakeReviewGrid({ review }: { review: IntakeReviewVisual }) {
  const normalizedRisk = review.risk.toLowerCase();
  const riskLevel = normalizedRisk === "critical" ? 4
    : normalizedRisk === "high" ? 3
      : normalizedRisk === "medium" ? 2 : normalizedRisk === "low" ? 1 : 0;
  const riskTone = normalizedRisk === "critical" || normalizedRisk === "high"
    || normalizedRisk === "medium" || normalizedRisk === "low"
    ? normalizedRisk
    : "medium";
  const normalizedDeadline = review.deadline.toLowerCase();
  const deadlineLevel = /now|immediate|overdue/.test(normalizedDeadline)
    ? 3
    : /hour/.test(normalizedDeadline) ? 2 : 1;
  const deadlineLabel = review.deadline.replace(/^Review\s+/i, "");

  return (
    <section className="batasbot-intake-review" aria-label="Intake review statistics">
      <h3>Intake snapshot</h3>
      <div className="batasbot-intake-review-grid">
        <div className={`batasbot-intake-stat batasbot-intake-stat--${riskTone}`}>
          <div className="batasbot-intake-stat-heading">
            <span><ShieldAlert aria-hidden="true" size={10.72} /> Risk level</span>
            <strong>{review.risk}</strong>
          </div>
          <div className="batasbot-intake-meter" aria-hidden="true">
            {[0, 1, 2, 3].map((segment) => <i className={segment < riskLevel ? "is-active" : ""} key={segment} />)}
          </div>
        </div>

        <div className={`batasbot-intake-stat batasbot-intake-stat--deadline${deadlineLevel === 3 ? " is-immediate" : ""}`}>
          <div className="batasbot-intake-stat-heading">
            <span><Clock3 aria-hidden="true" size={10.72} /> Review window</span>
            <strong>{deadlineLabel}</strong>
          </div>
          <div className="batasbot-intake-meter" aria-hidden="true">
            {[0, 1, 2].map((segment) => <i className={segment < deadlineLevel ? "is-active" : ""} key={segment} />)}
          </div>
        </div>

        <div className="batasbot-intake-stat">
          <div className="batasbot-intake-stat-heading">
            <span>Reported signals</span>
            <strong>{review.signals.length}</strong>
          </div>
          <ul className="batasbot-intake-signals">
            {review.signals.length > 0
              ? review.signals.map((signal) => <li key={signal}>{signal}</li>)
              : <li className="is-empty">No specific signals found</li>}
          </ul>
        </div>

        <div className={`batasbot-intake-stat batasbot-intake-stat--fit${review.specialtyMatch ? " is-match" : ""}`}>
          <div className="batasbot-intake-stat-heading">
            <span><BriefcaseBusiness aria-hidden="true" size={10.72} /> Practice fit</span>
          </div>
          <div className="batasbot-intake-fit-status">
            {review.specialtyMatch && <Check aria-hidden="true" size={10.72} />}
            <strong>{review.specialtyMatch ? "Profile match" : "Outside profile"}</strong>
          </div>
          <span className="batasbot-intake-specialty">{review.specialty}</span>
        </div>
      </div>
    </section>
  );
}

function JournalReviewCard({ review }: { review: JournalReviewVisual }) {
  return (
    <section className="batasbot-journal-review" aria-label="Journal review summary">
      <header className="batasbot-journal-review-heading">
        <div>
          <h3>Journal review</h3>
          <p><FileText aria-hidden="true" size={12} /> {review.sourceFile}</p>
        </div>
        <span>AI-assisted summary</span>
      </header>
      <p className="batasbot-journal-review-summary">{review.summary}</p>
      <div className="batasbot-journal-review-facts">
        <div>
          <span><BriefcaseBusiness aria-hidden="true" size={12} /> Practice area</span>
          <strong>{review.domain}</strong>
        </div>
        <div>
          <span><ListChecks aria-hidden="true" size={12} /> Case stage</span>
          <strong>{review.caseStage || "Not stated"}</strong>
        </div>
        <div>
          <span><CalendarClock aria-hidden="true" size={12} /> Legal deadline</span>
          <strong>{review.deadlineAt || "Not identified"}</strong>
        </div>
      </div>
      <div className="batasbot-journal-review-signals">
        <h4>Reported urgency signals</h4>
        {review.signals.length > 0 ? (
          <ul>{review.signals.map((signal) => <li key={signal}>{signal}</li>)}</ul>
        ) : (
          <p>No specific urgency signals were identified in the text.</p>
        )}
      </div>
      {review.truncated && (
        <p className="batasbot-journal-review-note" role="note">
          The text file exceeded the review limit; only the beginning was analyzed.
        </p>
      )}
      <p className="batasbot-journal-review-disclaimer">
        Based on client-reported information. Verify all facts and any deadlines against source documents.
      </p>
    </section>
  );
}


export default function BatasBotWorkspace() {
  const [search, setSearch] = useState("");
  const [input, setInput] = useState("");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsCollapsed, setSessionsCollapsed] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [sessionPendingDeletion, setSessionPendingDeletion] = useState<ChatSession | null>(null);
  const [sessionMenuId, setSessionMenuId] = useState<string | null>(null);
  const [sessionPendingRename, setSessionPendingRename] = useState<ChatSession | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [journalFile, setJournalFile] = useState<File | null>(null);
  const [journalAiConsent, setJournalAiConsent] = useState(false);
  const [isReviewingJournal, setIsReviewingJournal] = useState(false);
  // Messages for the active session are fetched from the DB, then updated optimistically
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const { text: streamedReply, phase: replyPhase, startTyping, startStream, cancelTyping } = useTypingStream();
  const isGenerating = isSending || replyPhase !== "idle";
  const [notice, setNotice] = useState("");
  const tempIdRef = useRef(0);
  const skipSessionLoadRef = useRef(new Set<string>());
  const triageHandoffRef = useRef<{
    sessionId: string;
    sessionTitle: string;
    userContent: string;
    assistantMessage: ChatMessage;
  } | null>(null);
  const triageBootstrapStartedRef = useRef(false);
  const newChatStartedRef = useRef(false);
  const sendInFlightRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sessionQuery = search.trim().toLowerCase();
  const visibleSessions = normalizeSessions(sessions).filter((session) =>
    !sessionQuery || `${session.title} ${session.preview ?? ""}`.toLowerCase().includes(sessionQuery),
  );
  const pendingIntakeReview = triageHandoffRef.current?.sessionId === activeSessionId
    ? triageHandoffRef.current.assistantMessage.intakeReview
    : undefined;
  const displayedMessages = messages.filter((message) =>
    !(replyPhase !== "idle"
      && triageHandoffRef.current
      && message.role === "assistant"
      && message.content === triageHandoffRef.current.assistantMessage.content),
  );

  // ── Load sessions on mount ─────────────────────────────────────────────
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/chat/sessions");
        if (res.ok) {
          const data = (await res.json()) as { id: string; title: string; updatedAt: string }[];
          setSessions((current) => normalizeSessions([
            ...current.filter((session) => session.id.startsWith("triage-") || session.id === "__new__"),
            ...data.map((s) => ({ id: s.id, title: s.title, updatedAt: s.updatedAt })),
          ]));
          if (data[0]
            && !newChatStartedRef.current
            && !["triage", "citizen-journal"].includes(new URLSearchParams(window.location.search).get("source") ?? "")) {
            setActiveSessionId((current) => current ?? data[0].id);
          }
        }
      } catch {
        // silently ignore — user will still be able to chat
      } finally {
        setSessionsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("source") !== "citizen-journal") return;

    let handoff: CitizenJournalHandoffContext | null = null;
    try {
      const rawHandoff = window.sessionStorage.getItem("batasbot-citizen-journal");
      const parsed: unknown = rawHandoff ? JSON.parse(rawHandoff) : null;
      if (isCitizenJournalHandoffContext(parsed)) handoff = parsed;
      window.sessionStorage.removeItem("batasbot-citizen-journal");
    } catch {
      handoff = null;
      setNotice("This browser could not read the journal handoff. Return to Messages and try again.");
    }

    window.history.replaceState(null, "", window.location.pathname);
    if (!handoff) {
      setNotice("No journal handoff was found. Return to Messages and open the journal again.");
      return;
    }

    newChatStartedRef.current = true;
    setJournalFile(createCitizenJournalTextFile(handoff));
    setJournalAiConsent(false);
    setInput("Review this citizen-shared journal. Summarize the reported facts, practice area, any explicitly stated legal deadline or case stage, and urgency signals. Do not treat incident dates as legal deadlines.");
    setNotice("Journal text is attached. Confirm AI review consent, then send it to BatasBot.");
  }, []);

  // ── Load messages when active session changes ──────────────────────────
  useEffect(() => {
    if (!activeSessionId) {
      setMessages([]);
      setMessagesLoading(false);
      return;
    }

    if (skipSessionLoadRef.current.delete(activeSessionId)) return;

    const controller = new AbortController();
    setMessagesLoading(true);
    setMessages([]);
    void (async () => {
      try {
        const res = await fetch(`/api/chat/sessions/${activeSessionId}`, { signal: controller.signal });
        if (res.ok) {
          const data = (await res.json()) as {
            id: string;
            role: "user" | "assistant";
            content: string;
            metadata?: unknown;
          }[];
          if (!controller.signal.aborted) {
            setMessages(data.map((m) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              intakeReview: isIntakeReviewVisual(m.metadata) ? m.metadata : undefined,
              journalReview: isJournalReviewVisual(m.metadata) ? m.metadata : undefined,
              attachmentName: m.role === "user"
                ? m.content.match(/^Attached journal text file: ([^\r\n]+)/)?.[1]
                : undefined,
            })));
          }
        }
      } catch {
        if (!controller.signal.aborted) setMessages([]);
      } finally {
        if (!controller.signal.aborted) setMessagesLoading(false);
      }
    })();
    return () => controller.abort();
  }, [activeSessionId]);

  // ── Scroll to bottom ───────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: replyPhase === "idle" ? "smooth" : "auto", block: "end" });
  }, [activeSessionId, isGenerating, messages, replyPhase, streamedReply]);

  // ── Triage handoff bootstrap ───────────────────────────────────────────
  useEffect(() => {
    if (triageBootstrapStartedRef.current) return;

    let handoffBootstrap = triageHandoffRef.current;
    const isTriageHandoffRoute = new URLSearchParams(window.location.search).get("source") === "triage";
    if (!handoffBootstrap && !isTriageHandoffRoute) return;

    if (!handoffBootstrap) {
      let handoff: TriageChatHandoff | null = null;
      try {
        const rawHandoff = window.sessionStorage.getItem("batasbot-triage-handoff");
        const parsed: unknown = rawHandoff ? JSON.parse(rawHandoff) : null;
        if (isTriageChatHandoff(parsed)) handoff = parsed;
      } catch {
        handoff = null;
      }

      if (!handoff) {
        window.sessionStorage.removeItem("batasbot-triage-handoff");
        window.history.replaceState(null, "", window.location.pathname);
        return;
      }

      const tempId = `triage-${Date.now()}`;
      const userContent = `Why should ${handoff.id} be reviewed now?`;
      const userMessage: ChatMessage = { id: `temp-u-${tempIdRef.current++}`, role: "user", content: userContent };
      const assistantMessage: ChatMessage = {
        id: `temp-a-${tempIdRef.current++}`,
        role: "assistant",
        content: explainTriageHandoff(handoff),
        intakeReview: getIntakeReviewVisual(handoff),
      };
      const triageSession: ChatSession = {
        id: tempId,
        title: getIntakeReviewSessionTitle(handoff),
        updatedAt: new Date().toISOString(),
      };

      handoffBootstrap = {
        sessionId: tempId,
        sessionTitle: getIntakeReviewSessionTitle(handoff),
        userContent,
        assistantMessage,
      };
      triageHandoffRef.current = handoffBootstrap;
      window.sessionStorage.removeItem("batasbot-triage-handoff");
      window.history.replaceState(null, "", window.location.pathname);
      setSessions((current) => normalizeSessions([triageSession, ...current]));
      setMessages([userMessage]);
      setNotice("");
    }

    triageBootstrapStartedRef.current = true;
    const activeHandoff = handoffBootstrap;
    setIsSending(true);
    void (async () => {
      try {
        const response = await fetch("/api/chat/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: activeHandoff.sessionTitle,
            handoff: {
              userContent: activeHandoff.userContent,
              assistantContent: activeHandoff.assistantMessage.content,
              assistantMetadata: activeHandoff.assistantMessage.intakeReview,
            },
          }),
        });
        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error || "Unable to save the intake review.");
        }

        const data = (await response.json()) as { id: string; title?: string; updatedAt?: string };
        skipSessionLoadRef.current.add(data.id);
        setActiveSessionId(data.id);
        setSessions((current) => {
          const hasTemporarySession = current.some((session) => session.id === activeHandoff.sessionId);
          const savedSession: ChatSession = {
            id: data.id,
            title: data.title || "Intake review",
            updatedAt: data.updatedAt || new Date().toISOString(),
            preview: activeHandoff.assistantMessage.content.slice(0, 80),
          };
          const withoutTemporary = current.filter((session) => session.id !== activeHandoff.sessionId);
          return normalizeSessions(hasTemporarySession
            ? [savedSession, ...withoutTemporary]
            : [savedSession, ...current]);
        });
        triageHandoffRef.current = { ...activeHandoff, sessionId: data.id };

        setIsSending(false);
        startTyping(activeHandoff.assistantMessage.content, () => {
          setMessages((current) => current.some((message) =>
            message.role === "assistant"
            && message.content === activeHandoff.assistantMessage.content,
          )
            ? current
            : [...current, activeHandoff.assistantMessage]);
          triageHandoffRef.current = null;
        });
      } catch (error) {
        setIsSending(false);
        setNotice(error instanceof Error ? error.message : "Unable to save the intake review.");
      }
    })();
  }, [startTyping]);

  const sendMessage = async (rawMessage: string) => {
    const content = rawMessage.trim();
    if (!content || isGenerating || sessionsLoading || sendInFlightRef.current) return;
    sendInFlightRef.current = true;

    try {
      const isNewSession = !activeSessionId || !sessions.some((s) => s.id === activeSessionId);
      const currentSessionId = activeSessionId;
      const title = getSessionTitle(content);

      // Optimistic user message
      const optimisticUserMsg: ChatMessage = { id: `temp-u-${tempIdRef.current++}`, role: "user", content };
      setMessages((current) => [...current, optimisticUserMsg]);

      if (isNewSession) {
        // Optimistic new session in sidebar
        const tempSession: ChatSession = { id: "__new__", title, updatedAt: new Date().toISOString(), preview: content };
        setSessions((current) => normalizeSessions([tempSession, ...current]));
      } else {
        // Bump updatedAt on existing session
        setSessions((current) => current.map((s) =>
          s.id === currentSessionId ? { ...s, updatedAt: new Date().toISOString(), preview: content } : s,
        ));
      }

      setInput("");
      setIsSending(true);

      let response: Response;
      try {
        response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: content,
            sessionId: isNewSession ? undefined : currentSessionId,
            title,
          }),
        });
      } catch {
        setIsSending(false);
        if (isNewSession) setSessions((current) => current.filter((session) => session.id !== "__new__"));
        const errorMsg: ChatMessage = { id: `temp-e-${tempIdRef.current++}`, role: "assistant", content: "BatasBot could not reach the server. Please check your connection and try again." };
        setMessages((current) => [...current, errorMsg]);
        return;
      }

      if (!response.ok) {
        setIsSending(false);
        if (isNewSession) setSessions((current) => current.filter((session) => session.id !== "__new__"));
        const errData = (await response.json().catch(() => ({}))) as { error?: string };
        const errorMsg: ChatMessage = { id: `temp-e-${tempIdRef.current++}`, role: "assistant", content: errData.error || "BatasBot encountered an error. Please try again shortly." };
        setMessages((current) => [...current, errorMsg]);
        return;
      }

      // If server created a new session, update the sidebar with the real ID
      const resolvedSessionId = response.headers.get("X-Session-Id") ?? currentSessionId ?? "";
      if (isNewSession && resolvedSessionId) {
        skipSessionLoadRef.current.add(resolvedSessionId);
        setActiveSessionId(resolvedSessionId);
        setSessions((current) => normalizeSessions(current.map((s) =>
          s.id === "__new__" ? { ...s, id: resolvedSessionId } : s,
        )));
      }

      startStream(response, (fullText) => {
      if (!fullText.trim()) {
        setMessages((current) => [...current, {
          id: `temp-e-${tempIdRef.current++}`,
          role: "assistant",
          content: "BatasBot returned an empty response. Please try again.",
        }]);
        return;
      }
      const assistantMsg: ChatMessage = { id: `temp-a-${tempIdRef.current++}`, role: "assistant", content: fullText };
      setMessages((current) => [...current, assistantMsg]);
      // Update sidebar preview
      setSessions((current) => normalizeSessions(current.map((s) =>
        s.id === resolvedSessionId
          ? {
            ...s,
            title: getExchangeTitle(content, fullText),
            preview: fullText.slice(0, 80),
            updatedAt: new Date().toISOString(),
          }
          : s,
      )));
      void (async () => {
        try {
          const sessionsResponse = await fetch("/api/chat/sessions");
          if (!sessionsResponse.ok) return;
          const sessionData = (await sessionsResponse.json()) as ChatSession[];
          setSessions((current) => {
            const localTitles = new Map(
              current
                .filter((session) => session.id === resolvedSessionId)
                .map((session) => [session.id, session.title]),
            );
            return normalizeSessions([
              ...current.filter((session) => session.id.startsWith("triage-") || session.id === "__new__"),
              ...sessionData.map((session) => {
                const localTitle = localTitles.get(session.id);
                return localTitle ? { ...session, title: localTitle } : session;
              }),
            ]);
          });
        } catch {
          // The response is already visible; the next session refresh will reconcile the title.
        }
      })();
      }, (_error, partialText) => {
      const content = partialText.trim()
        ? `${partialText.trim()}\n\n[BatasBot could not finish this response. Please try again.]`
        : "BatasBot could not generate a response. Please try again.";
      setMessages((current) => [...current, {
        id: `temp-e-${tempIdRef.current++}`,
        role: "assistant",
        content,
      }]);
      });
      setIsSending(false);
    } finally {
      sendInFlightRef.current = false;
    }
  };

  const reviewJournalAttachment = async () => {
    const file = journalFile;
    const requestText = input.trim();
    if (!file || !requestText || !journalAiConsent || isGenerating || sessionsLoading || sendInFlightRef.current) return;

    sendInFlightRef.current = true;
    setIsSending(true);
    setIsReviewingJournal(true);
    setNotice("");
    try {
      const formData = new FormData();
      formData.append("intake", JSON.stringify({
        title: "",
        description: requestText.slice(0, 1200),
        domain: "",
        documents: [file.name],
        deadlineAt: null,
        caseStage: "",
        urgencyFlags: [],
      }));
      formData.append("maskIdentifiers", "true");
      formData.append("mode", "extract");
      formData.append("aiConsent", "true");
      formData.append("files", file, file.name);

      const reviewResponse = await fetch("/api/intakes/review", {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(30_000),
      });
      const reviewPayload: unknown = await reviewResponse.json().catch(() => null);
      if (!reviewResponse.ok) {
        const message = reviewPayload && typeof reviewPayload === "object" && "error" in reviewPayload
          && typeof reviewPayload.error === "string"
          ? reviewPayload.error
          : "BatasBot could not review this journal file.";
        throw new Error(message);
      }

      const parsedReview = intakeAiExtractionResponseSchema.safeParse(reviewPayload);
      if (!parsedReview.success) throw new Error("BatasBot returned an invalid journal review.");
      const { extraction } = parsedReview.data;
      const journalReview: JournalReviewVisual = {
        sourceFile: file.name,
        summary: extraction.summary,
        domain: extraction.domain,
        deadlineAt: extraction.deadlineAt,
        caseStage: extraction.caseStage,
        signals: extraction.signals,
        truncated: extraction.documentReview.truncated,
      };
      const assistantContent = [
        `Summary: ${journalReview.summary}`,
        `Practice area: ${journalReview.domain}`,
        `Reported case stage: ${journalReview.caseStage || "Not stated"}`,
        `Explicit legal deadline: ${journalReview.deadlineAt || "Not identified"}`,
        `Reported urgency signals: ${journalReview.signals.length ? journalReview.signals.join("; ") : "None identified"}`,
      ].join("\n\n");
      const userContent = `Attached journal text file: ${file.name}\nReview request: ${requestText}`;
      const sessionTitle = `Journal review · ${extraction.title}`;
      const sessionResponse = await fetch("/api/chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: sessionTitle,
          handoff: {
            userContent,
            assistantContent,
            assistantMetadata: journalReview,
          },
        }),
      });
      const sessionPayload: unknown = await sessionResponse.json().catch(() => null);
      if (!sessionResponse.ok || !isCreatedChatSession(sessionPayload)) {
        const message = sessionPayload && typeof sessionPayload === "object" && "error" in sessionPayload
          && typeof sessionPayload.error === "string"
          ? sessionPayload.error
          : "BatasBot finished the review, but the conversation could not be saved.";
        throw new Error(message);
      }

      const userMessage: ChatMessage = {
        id: `journal-${tempIdRef.current++}-user`,
        role: "user",
        content: userContent,
        attachmentName: file.name,
      };
      const assistantMessage: ChatMessage = {
        id: `journal-${tempIdRef.current++}-assistant`,
        role: "assistant",
        content: assistantContent,
        journalReview,
      };
      skipSessionLoadRef.current.add(sessionPayload.id);
      newChatStartedRef.current = true;
      setActiveSessionId(sessionPayload.id);
      setSessions((current) => normalizeSessions([{
        id: sessionPayload.id,
        title: sessionPayload.title,
        updatedAt: sessionPayload.updatedAt,
        preview: extraction.summary.slice(0, 80),
      }, ...current]));
      setMessages([userMessage, assistantMessage]);
      setInput("");
      setJournalFile(null);
      setJournalAiConsent(false);
      setNotice("Journal review complete. The uploaded text file was processed for this review and was not saved as a file.");
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      setNotice(timedOut
        ? "Journal review timed out. Your file is still attached; try again."
        : error instanceof Error ? error.message : "Unable to review this journal file.");
    } finally {
      setIsSending(false);
      setIsReviewingJournal(false);
      sendInFlightRef.current = false;
    }
  };

  const submitComposer = () => {
    if (journalFile) {
      void reviewJournalAttachment();
      return;
    }
    void sendMessage(input);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitComposer();
  };

  const startNewChat = () => {
    newChatStartedRef.current = true;
    cancelTyping();
    setActiveSessionId(null);
    setMessages([]);
    setInput("");
    setJournalFile(null);
    setJournalAiConsent(false);
    setNotice("");
    inputRef.current?.focus();
  };

  const deleteChatSession = async (session: ChatSession) => {
    if (isGenerating || deletingSessionId) return;

    setDeletingSessionId(session.id);
    setSessionPendingDeletion(null);
    setNotice("");
    try {
      const response = await fetch(`/api/chat/sessions/${session.id}`, { method: "DELETE" });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const error = payload && typeof payload === "object" && "error" in payload
          && typeof payload.error === "string"
          ? payload.error
          : "Unable to delete this conversation right now.";
        setNotice(error);
        return;
      }

      setSessions((current) => current.filter(({ id }) => id !== session.id));
      if (activeSessionId === session.id) {
        cancelTyping();
        setActiveSessionId(null);
        setMessages([]);
        triageHandoffRef.current = null;
      }
    } catch {
      setNotice("Could not reach the server. Please try deleting the conversation again.");
    } finally {
      setDeletingSessionId(null);
    }
  };

  const renameChatSession = async () => {
    if (!sessionPendingRename || renamingSessionId) return;
    const title = renameTitle.replace(/\s+/g, " ").trim();
    if (!title) return;
    setRenamingSessionId(sessionPendingRename.id);
    setNotice("");
    try {
      const response = await fetch(`/api/chat/sessions/${sessionPendingRename.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const payload = (await response.json().catch(() => ({}))) as { title?: string; error?: string };
      if (!response.ok) {
        setNotice(payload.error || "Unable to rename this conversation right now.");
        return;
      }
      setSessions((current) => current.map((session) =>
        session.id === sessionPendingRename.id ? { ...session, title: payload.title || title } : session,
      ));
      setSessionPendingRename(null);
    } catch {
      setNotice("Could not reach the server. Please try renaming the conversation again.");
    } finally {
      setRenamingSessionId(null);
    }
  };

  return (
    <WorkspaceShell
      activePage="BatasBot"
      search={search}
      onSearchChange={setSearch}
      onUnavailable={(label) => setNotice(label === "Document Assembly"
        ? "This feature is not currently part of the MVP."
        : `${label} is not part of this demo yet.`)}
      searchPlaceholder="Search your workspace..."
      searchLabel="Search your workspace"
    >
      <main className={`batasbot-page${messages.length ? " batasbot-page--conversation" : ""}`}>
        <header className="batasbot-page-header">
          <div className="batasbot-page-brand">
            <span className="batasbot-page-mark"><Bot aria-hidden="true" size={12.73} /></span>
            <div>
              <h1>BatasBot</h1>
              <p>Your workspace assistant</p>
            </div>
          </div>
          <button className="batasbot-new-chat" type="button" onClick={startNewChat} disabled={isGenerating}>
            <Plus aria-hidden="true" size={10.05} />
            <span>New chat</span>
          </button>
        </header>

        <div className={`batasbot-content-grid${sessionsCollapsed ? " is-sessions-collapsed" : ""}`}>
          <div className="batasbot-main-column">
            <section className="batasbot-chat-area" aria-label="BatasBot conversation">
              {messagesLoading ? (
                <div className="batasbot-thread-loading" role="status" aria-label="Loading conversation">
                  <div className="batasbot-thread-typing">
                    <span aria-hidden="true"><i /><i /><i /></span>
                    <span className="sr-only">Loading conversation…</span>
                  </div>
                </div>
              ) : messages.length === 0 ? (
                <div className="batasbot-welcome">
                  <div className="batasbot-welcome-mark"><Bot aria-hidden="true" size={16.75} /></div>
                  <h2>What can I help you with?</h2>
                  <p>Ask about your workspace, get help preparing a draft, or find the right place to continue your work.</p>
                  <div className="batasbot-starters" aria-label="Suggested prompts">
                    {STARTER_PROMPTS.map(({ label, icon: Icon }) => (
                      <button type="button" key={label} onClick={() => sendMessage(label)}>
                        <Icon aria-hidden="true" size={10.72} />
                        <span>{label}</span>
                        <ArrowUp aria-hidden="true" className="batasbot-starter-arrow" size={9.38} />
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="batasbot-thread" role="log" aria-live="polite" aria-relevant="additions text" aria-label="Chat history">
                  <div className="batasbot-thread-content">
                    {displayedMessages.map((message) => (
                      <article className={`batasbot-thread-message batasbot-thread-message--${message.role}`} key={message.id}>
                        {message.role === "assistant" && <span className="batasbot-thread-avatar" aria-hidden="true"><Bot size={10.05} /></span>}
                        <div className="batasbot-thread-body">
                          {message.role === "user" ? (
                            <>
                              {message.attachmentName && (
                                <span className="batasbot-message-file">
                                  <FileText aria-hidden="true" size={12} />
                                  {message.attachmentName}
                                </span>
                              )}
                              <p>{message.attachmentName
                                ? message.content.replace(/^Attached journal text file: [^\r\n]+\nReview request:\s*/, "")
                                : message.content}</p>
                            </>
                          ) : (
                            (() => {
                              const matterTable = parseMatterTable(message.content);
                              return (
                                <>
                                  {matterTable?.before.trim() && (
                                    <div className="batasbot-markdown">
                                      <MatterMarkdown content={matterTable.before} />
                                    </div>
                                  )}
                                  {matterTable ? <MatterTable rows={matterTable.rows} /> : (
                                    <div className="batasbot-markdown">
                                      <MatterMarkdown content={message.journalReview?.summary ?? message.content} />
                                    </div>
                                  )}
                                  {matterTable?.after.trim() && (
                                    <div className="batasbot-markdown">
                                      <MatterMarkdown content={matterTable.after} />
                                    </div>
                                  )}
                                </>
                              );
                            })()
                          )}
                          {message.intakeReview && <IntakeReviewGrid review={message.intakeReview} />}
                          {message.journalReview && <JournalReviewCard review={message.journalReview} />}
                          {message.links && (
                            <div className="batasbot-thread-links">
                              {message.links.map(({ label, href, icon: Icon }) => (
                                <Link href={href} key={href}>
                                  <Icon aria-hidden="true" size={9.38} />
                                  {label}
                                </Link>
                              ))}
                            </div>
                          )}
                        </div>
                      </article>
                    ))}
                    {(isSending || replyPhase === "thinking") && (
                      <div className="batasbot-thread-message batasbot-thread-message--assistant">
                        <span className="batasbot-thread-avatar" aria-hidden="true"><Bot size={10.05} /></span>
                        <div className="batasbot-thread-typing" role="status" aria-label="BatasBot is generating a reply">
                          <span aria-hidden="true"><i /><i /><i /></span>
                          <span>BatasBot is thinking</span>
                        </div>
                      </div>
                    )}
                    {replyPhase === "typing" && (
                      <article className="batasbot-thread-message batasbot-thread-message--assistant">
                        <span className="batasbot-thread-avatar" aria-hidden="true"><Bot size={10.05} /></span>
                        <div className="batasbot-thread-body">
                          <div className="batasbot-streaming-label" role="status">
                            <span aria-hidden="true"><i /><i /><i /></span>
                            <span>BatasBot is chatting</span>
                          </div>
                          {(() => {
                            const matterTable = parseMatterTable(streamedReply);
                            return matterTable ? <MatterTable rows={matterTable.rows} /> : (
                              <div className="batasbot-markdown batasbot-streaming-text" aria-live="off">
                                <MatterMarkdown content={streamedReply} />
                              </div>
                            );
                          })()}
                          {pendingIntakeReview && <IntakeReviewGrid review={pendingIntakeReview} />}
                        </div>
                      </article>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </div>
              )}
            </section>

            <div className="batasbot-compose-area">
              {journalFile && (
                <div className="batasbot-journal-attachment" aria-label="Attached journal file">
                  <FileText aria-hidden="true" size={15} />
                  <span>
                    <strong>{journalFile.name}</strong>
                    <small>Generated from the shared journal entries · TXT</small>
                  </span>
                  <button
                    type="button"
                    aria-label="Remove attached journal file"
                    disabled={isGenerating}
                    onClick={() => {
                      setJournalFile(null);
                      setJournalAiConsent(false);
                    }}
                  >
                    <X aria-hidden="true" size={14} />
                  </button>
                </div>
              )}
              {journalFile && (
                <label className="batasbot-journal-consent">
                  <input
                    type="checkbox"
                    checked={journalAiConsent}
                    disabled={isGenerating}
                    onChange={(event) => setJournalAiConsent(event.target.checked)}
                  />
                  <span>I’m authorized to send these client-reported notes to BatasBot for AI review.</span>
                </label>
              )}
              <form className="batasbot-main-composer" onSubmit={handleSubmit}>
                <label className="sr-only" htmlFor="batasbot-main-input">Message BatasBot</label>
                <textarea
                  ref={inputRef}
                  id="batasbot-main-input"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      if (!isGenerating) submitComposer();
                    }
                  }}
                  placeholder="Message BatasBot..."
                  rows={1}
                />
                <button type="submit" aria-label={journalFile ? "Send journal for review" : "Send message"} disabled={!input.trim() || isGenerating || sessionsLoading || Boolean(journalFile && !journalAiConsent)}>
                  {isReviewingJournal
                    ? <span className="batasbot-send-loading" aria-hidden="true" />
                    : <ArrowUp aria-hidden="true" size={11.39} />}
                </button>
              </form>
              <p className="batasbot-main-disclaimer">{journalFile
                ? "Submitting sends this text file to configured AI providers. The raw file is processed for review, not retained as a file."
                : "BatasBot responses are for professional reference only — not legal advice. Always verify citations."}</p>
            </div>
          </div>

          <aside
            className={`batasbot-sessions-panel${sessionsCollapsed ? " is-collapsed" : ""}`}
            aria-label="Chat sessions"
          >
            <div className="batasbot-panel-heading">
              <div>
                <h2 id="batasbot-sessions-title">Sessions</h2>
                <span>{sessions.length} conversations</span>
              </div>
              <button
                className="batasbot-panel-toggle"
                type="button"
                aria-label={sessionsCollapsed ? "Expand sessions" : "Collapse sessions"}
                aria-controls="batasbot-session-list"
                aria-expanded={!sessionsCollapsed}
                title={sessionsCollapsed ? "Expand sessions" : "Collapse sessions"}
                onClick={() => setSessionsCollapsed((collapsed) => !collapsed)}
              >
                <MessageSquare aria-hidden="true" size={12.06} />
                <ChevronDown
                  className="batasbot-panel-toggle-chevron"
                  aria-hidden="true"
                  size={10.72}
                />
              </button>
            </div>
            <div id="batasbot-session-list" className="batasbot-session-list" aria-label="Chat sessions">
              {sessionsLoading && <p className="batasbot-session-empty">Loading…</p>}
              {!sessionsLoading && visibleSessions.map((session) => (
                <div
                  className={`batasbot-session-row${activeSessionId === session.id ? " is-active" : ""}`}
                  key={session.id}
                >
                  <button
                    className="batasbot-session-item"
                    type="button"
                    aria-pressed={activeSessionId === session.id}
                    disabled={isGenerating || deletingSessionId !== null}
                    onClick={() => {
                      if (activeSessionId === session.id) return;
                      setActiveSessionId(session.id);
                      setInput("");
                      setNotice("");
                    }}
                  >
                    <span className="batasbot-session-title-row">
                      <strong>{session.title}</strong>
                    </span>
                    <time className="batasbot-session-date">{new Date(session.updatedAt).toLocaleDateString()}</time>
                  </button>
                  <button
                    className="batasbot-session-delete"
                    type="button"
                    aria-label={`More options for ${session.title}`}
                    title="More options"
                    disabled={isGenerating || deletingSessionId !== null}
                    onClick={() => setSessionMenuId((current) => current === session.id ? null : session.id)}
                  >
                    <MoreHorizontal aria-hidden="true" size={12} />
                  </button>
                  {sessionMenuId === session.id && (
                    <div className="batasbot-session-menu" role="menu">
                      <button type="button" role="menuitem" onClick={() => {
                        setRenameTitle(session.title);
                        setSessionPendingRename(session);
                        setSessionMenuId(null);
                      }}>Rename</button>
                      <button type="button" role="menuitem" onClick={() => {
                        setSessionPendingDeletion(session);
                        setSessionMenuId(null);
                      }}>Delete</button>
                    </div>
                  )}
                </div>
              ))}
              {!sessionsLoading && visibleSessions.length === 0 && <p className="batasbot-session-empty">{sessions.length === 0 ? "No conversations yet." : "No matching sessions."}</p>}
            </div>
          </aside>
        </div>

        {notice && (
          <div className="batasbot-notice" role="status">
            <span>{notice}</span>
            <button type="button" aria-label="Dismiss notice" onClick={() => setNotice("")}><X size={10.05} /></button>
          </div>
        )}
        {sessionPendingDeletion && (
          <div
            className="batasbot-delete-modal-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setSessionPendingDeletion(null);
            }}
          >
            <section
              className="batasbot-delete-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="batasbot-delete-modal-title"
              aria-describedby="batasbot-delete-modal-description"
              onKeyDown={(event) => {
                if (event.key === "Escape") setSessionPendingDeletion(null);
              }}
              tabIndex={-1}
            >
              <div className="batasbot-delete-modal-icon" aria-hidden="true">
                <Trash2 size={14} />
              </div>
              <h2 id="batasbot-delete-modal-title">Delete this conversation?</h2>
              <p id="batasbot-delete-modal-description">
                <strong>{sessionPendingDeletion.title}</strong> and all of its messages will be permanently deleted.
              </p>
              <div className="batasbot-delete-modal-actions">
                <button
                  type="button"
                  className="batasbot-delete-modal-cancel"
                  onClick={() => setSessionPendingDeletion(null)}
                  disabled={deletingSessionId !== null}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="batasbot-delete-modal-confirm"
                  onClick={() => void deleteChatSession(sessionPendingDeletion)}
                  disabled={deletingSessionId !== null}
                >
                  {deletingSessionId === sessionPendingDeletion.id ? "Deleting…" : "Delete conversation"}
                </button>
              </div>
            </section>
          </div>
        )}
        {sessionPendingRename && (
          <div className="batasbot-delete-modal-backdrop" role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSessionPendingRename(null);
          }}>
            <section className="batasbot-delete-modal batasbot-rename-modal" role="dialog" aria-modal="true" aria-labelledby="batasbot-rename-modal-title">
              <h2 id="batasbot-rename-modal-title">Rename conversation</h2>
              <label className="batasbot-rename-label" htmlFor="batasbot-rename-input">Conversation title</label>
              <input
                id="batasbot-rename-input"
                className="batasbot-rename-input"
                value={renameTitle}
                maxLength={255}
                autoFocus
                onChange={(event) => setRenameTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setSessionPendingRename(null);
                  if (event.key === "Enter") void renameChatSession();
                }}
              />
              <div className="batasbot-delete-modal-actions">
                <button type="button" className="batasbot-delete-modal-cancel" onClick={() => setSessionPendingRename(null)}>Cancel</button>
                <button type="button" className="batasbot-delete-modal-confirm" onClick={() => void renameChatSession()} disabled={!renameTitle.trim() || renamingSessionId !== null}>
                  {renamingSessionId ? "Saving…" : "Save"}
                </button>
              </div>
            </section>
          </div>
        )}
      </main>
    </WorkspaceShell>
  );
}
