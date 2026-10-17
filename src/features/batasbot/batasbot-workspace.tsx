"use client";

import {
  ArrowUp,
  Bot,
  CalendarDays,
  FileText,
  MessageSquare,
  Plus,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useTypingStream } from "@/hooks/use-typing-stream";
import WorkspaceShell from "../workspace/workspace-shell";
import "./batasbot-workspace.css";

type ChatLink = {
  label: string;
  href: string;
  icon: typeof FileText;
};

type ChatMessage = {
  id: number;
  role: "assistant" | "user";
  content: string;
  links?: ChatLink[];
};

type ChatSession = {
  id: string;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
  isSample: boolean;
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

const SAMPLE_SESSIONS: ChatSession[] = [
  {
    id: "sample-intake-review",
    title: "Intake review",
    updatedAt: "Sample · Today",
    isSample: true,
    messages: [
      { id: 1, role: "user", content: "Why should INTAKE-2024-0847 be reviewed now?" },
      { id: 2, role: "assistant", content: "The local priority preview flags a review deadline now, critical risk indicators, reported passport withholding and unpaid compensation, and a Labor & Employment specialty match. Verify the underlying records before acting." },
    ],
  },
  {
    id: "sample-position-paper",
    title: "Position paper outline",
    updatedAt: "Sample · Yesterday",
    isSample: true,
    messages: [
      { id: 3, role: "user", content: "Help me draft a position paper." },
      { id: 4, role: "assistant", content: "Open Document Assembly to start from the SENA position paper template. Check each fact against its source and have counsel verify the legal authorities before export." },
    ],
  },
  {
    id: "sample-hearing-prep",
    title: "Hearing preparation",
    updatedAt: "Sample · Oct 14",
    isSample: true,
    messages: [
      { id: 5, role: "user", content: "What should I prepare for a hearing?" },
      { id: 6, role: "assistant", content: "Review the hearing notice, organize relevant exhibits, confirm witness availability, and prepare a concise issue outline. Check the court’s current requirements and matter deadlines." },
    ],
  },
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
  const needSignals = handoff.reasons.filter((reason) =>
    !/risk indicators$/.test(reason) && !/^(Fits|Outside profile specialty:)/.test(reason),
  );
  return `This intake may merit prompt review because it is marked ${handoff.risk.toLowerCase()} risk, with a deadline of ${handoff.deadline.toLowerCase()}. The intake describes: ${handoff.summary} Signals from the local preview: ${needSignals.join("; ")}. The profile lists ${handoff.specialty}; the matter is ${handoff.domain}. This is a sample-based demo explanation, not a live AI assessment. Verify the source records and deadline before deciding.`;
}

function getAssistantReply(prompt: string): Pick<ChatMessage, "content" | "links"> {
  const query = prompt.toLowerCase();

  if (query.includes("draft") || query.includes("document") || query.includes("write")) {
    return {
      content: "You can start or continue a local review draft in Document Assembly. It includes a sample matter reference, exhibits, and an editable document canvas. This demo does not generate or verify legal documents.",
      links: [{ label: "Open Document Assembly", href: "/documents", icon: FileText }],
    };
  }

  if (query.includes("matter") || query.includes("case") || query.includes("client")) {
    return {
      content: "Use Case Overview to review the sample intake queue, search matters, and inspect their triage details. The workspace currently uses sample data only.",
      links: [{ label: "Go to Case Overview", href: "/dashboard", icon: Search }],
    };
  }

  if (query.includes("hearing") || query.includes("calendar") || query.includes("schedule")) {
    return {
      content: "The Calendar screen lets you browse the sample schedule and search hearings, consultations, and deadlines.",
      links: [{ label: "Open Calendar", href: "/calendar", icon: CalendarDays }],
    };
  }

  if (query.includes("task") || query.includes("prepare") || query.includes("next")) {
    return {
      content: "You can review and organize follow-up work on the Tasks screen. It supports local sample tasks, status updates, filtering, and task creation.",
      links: [{ label: "Open Tasks", href: "/tasks", icon: FileText }],
    };
  }

  return {
    content: "I can help you find the right workspace screen or suggest a next step. Try asking about drafting a document, finding a matter, preparing for a hearing, or organizing tasks. This preview uses sample replies and is not connected to live matter data or legal sources.",
    links: [
      { label: "Document Assembly", href: "/documents", icon: FileText },
      { label: "Case Overview", href: "/dashboard", icon: Search },
    ],
  };
}

export default function BatasBotWorkspace() {
  const [search, setSearch] = useState("");
  const [input, setInput] = useState("");
  const [sessions, setSessions] = useState<ChatSession[]>(SAMPLE_SESSIONS);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const { text: streamedReply, phase: replyPhase, startTyping, cancelTyping } = useTypingStream();
  const isGenerating = replyPhase !== "idle";
  const [notice, setNotice] = useState("");
  const nextMessageId = useRef(7);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const activeSession = sessions.find((session) => session.id === activeSessionId);
  const messages = activeSession?.messages ?? [];
  const sessionQuery = search.trim().toLowerCase();
  const visibleSessions = sessions.filter((session) =>
    !sessionQuery || `${session.title} ${session.messages.map((message) => message.content).join(" ")}`.toLowerCase().includes(sessionQuery),
  );
  const completedSessionCount = sessions.filter((session) => session.messages.length > 0).length;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: replyPhase === "idle" ? "smooth" : "auto", block: "end" });
  }, [activeSessionId, isGenerating, messages, replyPhase, streamedReply]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("source") !== "triage") return;

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

    const sessionId = `triage-${Date.now()}`;
    const userMessage: ChatMessage = {
      id: nextMessageId.current++,
      role: "user",
      content: `Why should ${handoff.id} be reviewed now?`,
    };
    const assistantMessage: ChatMessage = {
      id: nextMessageId.current++,
      role: "assistant",
      content: explainTriageHandoff(handoff),
    };
    const triageSession: ChatSession = {
      id: sessionId,
      title: `Review ${handoff.id}`,
      updatedAt: "Just now",
      messages: [userMessage],
      isSample: false,
    };

    window.sessionStorage.removeItem("batasbot-triage-handoff");
    window.history.replaceState(null, "", window.location.pathname);
    setSessions((current) => [triageSession, ...current]);
    setActiveSessionId(sessionId);
    setNotice("");
    startTyping(assistantMessage.content, () => {
      setSessions((current) => current.map((session) => session.id === sessionId
        ? { ...session, messages: [...session.messages, assistantMessage] }
        : session));
    });
  }, [startTyping]);

  const sendMessage = (rawMessage: string) => {
    const content = rawMessage.trim();
    if (!content || isGenerating) return;

    const sessionId = activeSessionId ?? `chat-${Date.now()}-${nextMessageId.current}`;
    const reply = getAssistantReply(content);
    const userMessage: ChatMessage = { id: nextMessageId.current++, role: "user", content };
    const assistantMessage: ChatMessage = { id: nextMessageId.current++, role: "assistant", ...reply };
    if (!activeSessionId) setActiveSessionId(sessionId);
    setSessions((current) => {
      const existing = current.find((session) => session.id === sessionId);
      const updatedSession: ChatSession = {
        id: sessionId,
        title: existing && existing.messages.length > 0 ? existing.title : getSessionTitle(content),
        updatedAt: "Just now",
        messages: [...(existing?.messages ?? []), userMessage],
        isSample: false,
      };
      return existing
        ? current.map((session) => session.id === sessionId ? updatedSession : session)
        : [updatedSession, ...current];
    });
    setInput("");
    startTyping(assistantMessage.content, () => {
      setSessions((current) => current.map((session) => session.id === sessionId
        ? { ...session, updatedAt: "Just now", messages: [...session.messages, assistantMessage] }
        : session));
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    sendMessage(input);
  };

  const startNewChat = () => {
    cancelTyping();
    const sessionId = `chat-${Date.now()}-${nextMessageId.current}`;
    setSessions((current) => [{
      id: sessionId,
      title: "New conversation",
      updatedAt: "Just now",
      messages: [],
      isSample: false,
    }, ...current]);
    setActiveSessionId(sessionId);
    setInput("");
    setNotice("");
    inputRef.current?.focus();
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
          <button className="batasbot-new-chat" type="button" onClick={startNewChat}>
            <Plus aria-hidden="true" size={10.05} />
            <span>New chat</span>
          </button>
        </header>

        <div className="batasbot-content-grid">
          <div className="batasbot-main-column">
            <section className="batasbot-chat-area" aria-label="BatasBot conversation">
              {messages.length === 0 ? (
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
                        <p>{message.content}</p>
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
                        <p className="batasbot-streaming-text" aria-live="off">{streamedReply}</p>
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
              <p className="batasbot-main-disclaimer">BatasBot is a demo assistant. Replies use sample text and are not legal advice.</p>
            </div>
          </div>

          <aside className="batasbot-sessions-panel" aria-labelledby="batasbot-sessions-title">
            <div className="batasbot-panel-heading">
              <div>
                <h2 id="batasbot-sessions-title">Sessions</h2>
                <span>{completedSessionCount} conversations</span>
              </div>
              <MessageSquare aria-hidden="true" size={12.06} />
            </div>
            <div className="batasbot-session-list" aria-label="Chat sessions">
              {visibleSessions.map((session) => {
                const lastMessage = session.messages.at(-1);
                return (
                  <button
                    className={`batasbot-session-item${activeSessionId === session.id ? " is-active" : ""}`}
                    type="button"
                    key={session.id}
                    aria-pressed={activeSessionId === session.id}
                    disabled={isGenerating}
                    onClick={() => {
                      setActiveSessionId(session.id);
                      setInput("");
                      setNotice("");
                    }}
                  >
                    <span className="batasbot-session-title-row">
                      <strong>{session.title}</strong>
                      <time>{session.updatedAt}</time>
                    </span>
                    <span className="batasbot-session-preview">{lastMessage?.content ?? "Start a new conversation"}</span>
                    {session.isSample && <span className="batasbot-session-sample">Sample session</span>}
                  </button>
                );
              })}
              {visibleSessions.length === 0 && <p className="batasbot-session-empty">No matching sessions.</p>}
            </div>
            <p className="batasbot-sessions-note">Session history is stored in this page only.</p>
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
