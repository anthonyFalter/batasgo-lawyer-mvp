"use client";

import {
  ArrowUp,
  Bot,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  Clock3,
  FileText,
  MessageSquare,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
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
};

type IntakeReviewVisual = {
  risk: string;
  deadline: string;
  signals: string[];
  specialty: string;
  specialtyMatch: boolean;
};

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
  specialty: string;
};

const STARTER_PROMPTS = [
  { label: "Help me draft a document", icon: FileText },
  { label: "Find a matter in my workspace", icon: Search },
  { label: "What should I prepare for a hearing?", icon: CalendarDays },
];

function getSessionTitle(prompt: string) {
  const cleanPrompt = prompt.replace(/\s+/g, " ").trim();
  if (cleanPrompt.length <= 36) return cleanPrompt;
  return `${cleanPrompt.slice(0, 33).trimEnd()}...`;
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
    && typeof handoff.specialty === "string";
}

function explainTriageHandoff(handoff: TriageChatHandoff) {
  const signals = handoff.reasons
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
  const signals = handoff.reasons
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



export default function BatasBotWorkspace() {
  const [search, setSearch] = useState("");
  const [input, setInput] = useState("");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  // Messages for the active session are fetched from the DB, then updated optimistically
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const { text: streamedReply, phase: replyPhase, startTyping, startStream, cancelTyping } = useTypingStream();
  const isGenerating = isSending || replyPhase !== "idle";
  const [notice, setNotice] = useState("");
  const tempIdRef = useRef(0);
  const skipSessionLoadRef = useRef(new Set<string>());
  const triageHandoffRef = useRef<{ sessionId: string; assistantMessage: ChatMessage } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sessionQuery = search.trim().toLowerCase();
  const visibleSessions = sessions.filter((session) =>
    !sessionQuery || `${session.title} ${session.preview ?? ""}`.toLowerCase().includes(sessionQuery),
  );
  const pendingIntakeReview = triageHandoffRef.current?.sessionId === activeSessionId
    ? triageHandoffRef.current.assistantMessage.intakeReview
    : undefined;

  // ── Load sessions on mount ─────────────────────────────────────────────
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/chat/sessions");
        if (res.ok) {
          const data = (await res.json()) as { id: string; title: string; updatedAt: string }[];
          setSessions(data.map((s) => ({ id: s.id, title: s.title, updatedAt: s.updatedAt })));
        }
      } catch {
        // silently ignore — user will still be able to chat
      } finally {
        setSessionsLoading(false);
      }
    })();
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
          const data = (await res.json()) as { id: string; role: "user" | "assistant"; content: string }[];
          if (!controller.signal.aborted) {
            setMessages(data.map((m) => ({ id: m.id, role: m.role, content: m.content })));
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
      const triageSession: ChatSession = { id: tempId, title: `Review ${handoff.id}`, updatedAt: new Date().toISOString() };

      handoffBootstrap = { sessionId: tempId, assistantMessage };
      triageHandoffRef.current = handoffBootstrap;
      window.sessionStorage.removeItem("batasbot-triage-handoff");
      window.history.replaceState(null, "", window.location.pathname);
      setSessions((current) => [triageSession, ...current]);
      setActiveSessionId(tempId);
      setMessages([userMessage]);
      setNotice("");
    }

    const activeHandoff = handoffBootstrap;
    startTyping(activeHandoff.assistantMessage.content, () => {
      setMessages((current) => [...current, activeHandoff.assistantMessage]);
      triageHandoffRef.current = null;
    });
  }, [startTyping]);

  const sendMessage = async (rawMessage: string) => {
    const content = rawMessage.trim();
    if (!content || isGenerating) return;

    const isNewSession = !activeSessionId || !sessions.some((s) => s.id === activeSessionId);
    const currentSessionId = activeSessionId;
    const title = getSessionTitle(content);

    // Optimistic user message
    const optimisticUserMsg: ChatMessage = { id: `temp-u-${tempIdRef.current++}`, role: "user", content };
    setMessages((current) => [...current, optimisticUserMsg]);

    if (isNewSession) {
      // Optimistic new session in sidebar
      const tempSession: ChatSession = { id: "__new__", title, updatedAt: new Date().toISOString(), preview: content };
      setSessions((current) => [tempSession, ...current]);
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
      setSessions((current) => current.map((s) =>
        s.id === "__new__" ? { ...s, id: resolvedSessionId } : s,
      ));
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
      setSessions((current) => current.map((s) =>
        s.id === resolvedSessionId ? { ...s, preview: fullText.slice(0, 80), updatedAt: new Date().toISOString() } : s,
      ));
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
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    sendMessage(input);
  };

  const startNewChat = () => {
    cancelTyping();
    setActiveSessionId(null);
    setMessages([]);
    setInput("");
    setNotice("");
    inputRef.current?.focus();
  };

  const deleteChatSession = async (session: ChatSession) => {
    if (isGenerating || deletingSessionId) return;
    if (!window.confirm(`Delete "${session.title}" and its messages? This cannot be undone.`)) return;

    setDeletingSessionId(session.id);
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

  return (
    <WorkspaceShell
      activePage="BatasBot"
      search={search}
      onSearchChange={setSearch}
      onUnavailable={(label) => setNotice(`${label} is not part of this demo yet.`)}
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

        <div className="batasbot-content-grid">
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
                  {messages.map((message) => (
                    <article className={`batasbot-thread-message batasbot-thread-message--${message.role}`} key={message.id}>
                      {message.role === "assistant" && <span className="batasbot-thread-avatar" aria-hidden="true"><Bot size={10.05} /></span>}
                      <div className="batasbot-thread-body">
                        {message.role === "user" ? (
                          <p>{message.content}</p>
                        ) : (
                          <div className="batasbot-markdown">
                            <ReactMarkdown>{message.content}</ReactMarkdown>
                          </div>
                        )}
                        {message.intakeReview && <IntakeReviewGrid review={message.intakeReview} />}
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
                  {replyPhase === "thinking" && (
                    <div className="batasbot-thread-message batasbot-thread-message--assistant">
                      <span className="batasbot-thread-avatar" aria-hidden="true"><Bot size={10.05} /></span>
                      <div className="batasbot-thread-typing" role="status" aria-label="BatasBot is generating a reply">
                        <span aria-hidden="true"><i /><i /><i /></span>
                        <span className="sr-only">BatasBot is typing</span>
                      </div>
                    </div>
                  )}
                  {replyPhase === "typing" && (
                    <article className="batasbot-thread-message batasbot-thread-message--assistant">
                      <span className="batasbot-thread-avatar" aria-hidden="true"><Bot size={10.05} /></span>
                      <div className="batasbot-thread-body">
                        <div className="batasbot-markdown batasbot-streaming-text" aria-live="off">
                          <ReactMarkdown>{streamedReply}</ReactMarkdown>
                        </div>
                        {pendingIntakeReview && <IntakeReviewGrid review={pendingIntakeReview} />}
                      </div>
                    </article>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </section>

            <div className="batasbot-compose-area">
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
                      if (!isGenerating) sendMessage(input);
                    }
                  }}
                  placeholder="Message BatasBot..."
                  rows={1}
                />
                <button type="submit" aria-label="Send message" disabled={!input.trim() || isGenerating}>
                  <ArrowUp aria-hidden="true" size={11.39} />
                </button>
              </form>
              <p className="batasbot-main-disclaimer">BatasBot responses are for professional reference only — not legal advice. Always verify citations.</p>
            </div>
          </div>

          <aside className="batasbot-sessions-panel" aria-labelledby="batasbot-sessions-title">
            <div className="batasbot-panel-heading">
              <div>
                <h2 id="batasbot-sessions-title">Sessions</h2>
                <span>{sessions.length} conversations</span>
              </div>
              <MessageSquare aria-hidden="true" size={12.06} />
            </div>
            <div className="batasbot-session-list" aria-label="Chat sessions">
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
                      <time>{new Date(session.updatedAt).toLocaleDateString()}</time>
                    </span>
                    <span className="batasbot-session-preview">{session.preview ?? "Start a new conversation"}</span>
                  </button>
                  <button
                    className="batasbot-session-delete"
                    type="button"
                    aria-label={`Delete conversation: ${session.title}`}
                    title="Delete conversation"
                    disabled={isGenerating || deletingSessionId !== null}
                    onClick={() => void deleteChatSession(session)}
                  >
                    <Trash2 aria-hidden="true" size={10.72} />
                  </button>
                </div>
              ))}
              {!sessionsLoading && visibleSessions.length === 0 && <p className="batasbot-session-empty">{sessions.length === 0 ? "No conversations yet." : "No matching sessions."}</p>}
            </div>
            <p className="batasbot-sessions-note">Synced to your account · stored in Neon PostgreSQL</p>
          </aside>
        </div>

        {notice && (
          <div className="batasbot-notice" role="status">
            <span>{notice}</span>
            <button type="button" aria-label="Dismiss notice" onClick={() => setNotice("")}><X size={10.05} /></button>
          </div>
        )}
      </main>
    </WorkspaceShell>
  );
}
