"use client";

import {
  ArrowUp,
  Bot,
  CalendarDays,
  FileText,
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const { text: streamedReply, phase: replyPhase, startTyping, cancelTyping } = useTypingStream();
  const isGenerating = replyPhase !== "idle";
  const [notice, setNotice] = useState("");
  const nextMessageId = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: replyPhase === "idle" ? "smooth" : "auto", block: "end" });
  }, [isGenerating, messages, replyPhase, streamedReply]);

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

    setMessages([userMessage]);
    setNotice("");
    startTyping(assistantMessage.content, () => {
      setMessages([userMessage, assistantMessage]);
      window.sessionStorage.removeItem("batasbot-triage-handoff");
      window.history.replaceState(null, "", window.location.pathname);
    });
  }, [startTyping]);

  const sendMessage = (rawMessage: string) => {
    const content = rawMessage.trim();
    if (!content || isGenerating) return;

    const reply = getAssistantReply(content);
    const userMessage: ChatMessage = { id: nextMessageId.current++, role: "user", content };
    const assistantMessage: ChatMessage = { id: nextMessageId.current++, role: "assistant", ...reply };
    setMessages((current) => [...current, userMessage]);
    setInput("");
    startTyping(assistantMessage.content, () => {
      setMessages((current) => [...current, assistantMessage]);
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    sendMessage(input);
  };

  const startNewChat = () => {
    cancelTyping();
    setMessages([]);
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
            <span className="batasbot-page-mark"><Bot aria-hidden="true" size={19} /></span>
            <div>
              <h1>BatasBot</h1>
              <p>Your workspace assistant</p>
            </div>
          </div>
          <button className="batasbot-new-chat" type="button" onClick={startNewChat}>
            <Plus aria-hidden="true" size={15} />
            <span>New chat</span>
          </button>
        </header>

        <section className="batasbot-chat-area" aria-label="BatasBot conversation">
          {messages.length === 0 ? (
            <div className="batasbot-welcome">
              <div className="batasbot-welcome-mark"><Bot aria-hidden="true" size={25} /></div>
              <h2>What can I help you with?</h2>
              <p>Ask about your workspace, get help preparing a draft, or find the right place to continue your work.</p>
              <div className="batasbot-starters" aria-label="Suggested prompts">
                {STARTER_PROMPTS.map(({ label, icon: Icon }) => (
                  <button type="button" key={label} onClick={() => sendMessage(label)}>
                    <Icon aria-hidden="true" size={16} />
                    <span>{label}</span>
                    <ArrowUp aria-hidden="true" className="batasbot-starter-arrow" size={14} />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="batasbot-thread" role="log" aria-live="polite" aria-relevant="additions text" aria-label="Chat history">
              {messages.map((message) => (
                <article className={`batasbot-thread-message batasbot-thread-message--${message.role}`} key={message.id}>
                  {message.role === "assistant" && <span className="batasbot-thread-avatar" aria-hidden="true"><Bot size={15} /></span>}
                  <div className="batasbot-thread-body">
                    <p>{message.content}</p>
                    {message.links && (
                      <div className="batasbot-thread-links">
                        {message.links.map(({ label, href, icon: Icon }) => (
                          <Link href={href} key={href}>
                            <Icon aria-hidden="true" size={14} />
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
                  <span className="batasbot-thread-avatar" aria-hidden="true"><Bot size={15} /></span>
                  <div className="batasbot-thread-typing" role="status" aria-label="BatasBot is generating a reply">
                    <span aria-hidden="true"><i /><i /><i /></span>
                    <span className="sr-only">BatasBot is typing</span>
                  </div>
                </div>
              )}
              {replyPhase === "typing" && (
                <article className="batasbot-thread-message batasbot-thread-message--assistant">
                  <span className="batasbot-thread-avatar" aria-hidden="true"><Bot size={15} /></span>
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
              <ArrowUp aria-hidden="true" size={17} />
            </button>
          </form>
          <p className="batasbot-main-disclaimer">BatasBot is a demo assistant. Replies use sample text and are not legal advice.</p>
        </div>

        {notice && (
          <div className="batasbot-notice" role="status">
            <span>{notice}</span>
            <button type="button" aria-label="Dismiss notice" onClick={() => setNotice("")}><X size={15} /></button>
          </div>
        )}
      </main>
    </WorkspaceShell>
  );
}
