"use client";

import { useUser } from "@clerk/nextjs";
import {
  ArrowLeft,
  Bot,
  Check,
  CheckCheck,
  FileText,
  LoaderCircle,
  Mail,
  Paperclip,
  Plus,
  Search,
  Send,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { scoreIntakeUrgency } from "@/lib/intakes/triage";
import { intakeResponseSchema } from "@/lib/intakes/validation";
import type { CitizenJournalHandoffContext } from "@/lib/citizen/journal-handoff-context";
import WorkspaceShell from "../workspace/workspace-shell";
import "./messages-workspace.css";

type HandoffEntry = {
  id: string;
  title: string;
  incidentDate: string;
  location: string;
  details: string;
  recordedAt: string;
};

type HandoffAttachment = {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
};

type Message = {
  id: string;
  text: string;
  time: string;
  direction: "inbound" | "outbound";
  journalHandoff: null | {
    title: string;
    entries?: HandoffEntry[];
    attachments: HandoffAttachment[];
    consentedAt: string;
  };
};

type Conversation = {
  id: string;
  client: string;
  threadTitle: string;
  matter: string;
  preview: string;
  time: string;
  messages: Message[];
};

type ApiMessage = Omit<Message, "time" | "direction"> & {
  sender: "citizen" | "lawyer";
  createdAt: string;
};

type ApiConversation = {
  id: string;
  client: string;
  subject: string;
  preview: string;
  updatedAt: string;
};

async function requestApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(payload?.error ?? "The messaging service could not complete the request.");
  return payload as T;
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date);
}

function conversationLabel(conversation: Conversation) {
  return `${conversation.client} ${conversation.matter} ${conversation.preview}`.toLowerCase();
}

function getInitials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";
}

function ProfileAvatar({ name, imageUrl, className }: { name: string; imageUrl?: string | null; className: string }) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(imageUrl) && !imageFailed;

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  return (
    <span className={`message-avatar ${className}`} role="img" aria-label={`${name} profile picture`}>
      {!showImage && <span aria-hidden="true">{getInitials(name)}</span>}
      {showImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl ?? ""} alt="" onError={() => setImageFailed(true)} />
      )}
    </span>
  );
}

export default function MessagesWorkspace() {
  const { user } = useUser();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [conversationSearch, setConversationSearch] = useState("");
  const [messageDraft, setMessageDraft] = useState("");
  const [showThreadOnMobile, setShowThreadOnMobile] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [journalActionError, setJournalActionError] = useState<{ messageId: string; message: string } | null>(null);
  const [savingJournalId, setSavingJournalId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const prevMessagesLengthRef = useRef(0);
  const isNearBottomRef = useRef(true);
  const isFetchingConversationsRef = useRef(false);
  const isFetchingMessagesRef = useRef(false);

  const scrollToBottom = useCallback((smooth = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: smooth ? "smooth" : "auto" });
    } else if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: smooth ? "smooth" : "auto",
      });
    }
  }, []);

  const handleMessagesScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distanceToBottom < 120;
  }, []);

  const loadConversations = useCallback(async (isBackground = false) => {
    if (isFetchingConversationsRef.current) return;
    isFetchingConversationsRef.current = true;
    try {
      const { conversations: rows } = await requestApi<{ conversations: ApiConversation[] }>("/api/citizen/conversations");
      setConversations((current) => {
        const next: Conversation[] = rows.map((conversation) => {
          const existing = current.find((c) => c.id === conversation.id);
          return {
            id: conversation.id,
            client: conversation.client,
            threadTitle: `Citizen conversation · ${conversation.subject}`,
            matter: conversation.subject,
            preview: conversation.preview,
            time: formatTime(conversation.updatedAt),
            messages: existing?.messages ?? [],
          };
        });
        return next;
      });

      setSelectedId((current) => {
        if (current && rows.some((r) => r.id === current)) return current;
        return current || rows[0]?.id || "";
      });

      if (!isBackground) setError("");
    } catch (requestError: unknown) {
      if (!isBackground) {
        setError(requestError instanceof Error ? requestError.message : "Unable to load citizen conversations.");
      }
    } finally {
      isFetchingConversationsRef.current = false;
      if (!isBackground) setIsLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (isBackground = false) => {
    if (!selectedId) return;
    if (isFetchingMessagesRef.current) return;
    isFetchingMessagesRef.current = true;
    try {
      const { messages } = await requestApi<{ messages: ApiMessage[] }>(
        `/api/citizen/conversations/${encodeURIComponent(selectedId)}/messages`,
      );
      const next = messages.map((message) => ({
        id: message.id,
        text: message.text,
        time: formatTime(message.createdAt),
        direction: message.sender === "lawyer" ? ("outbound" as const) : ("inbound" as const),
        journalHandoff: message.journalHandoff,
      }));

      setConversations((current) =>
        current.map((conversation) => {
          if (conversation.id !== selectedId) return conversation;
          const lastMsg = next[next.length - 1];
          return {
            ...conversation,
            preview: lastMsg?.text ?? conversation.preview,
            time: lastMsg ? lastMsg.time : conversation.time,
            messages: next,
          };
        }),
      );

      if (!isBackground) setError("");
    } catch (requestError) {
      if (!isBackground) {
        setError(requestError instanceof Error ? requestError.message : "Unable to load conversation messages.");
      }
    } finally {
      isFetchingMessagesRef.current = false;
      if (!isBackground) setIsLoadingThread(false);
    }
  }, [selectedId]);

  // Initial load of conversations
  useEffect(() => {
    setIsLoading(true);
    void loadConversations(false);
  }, [loadConversations]);

  // Initial load of messages when selectedId changes
  useEffect(() => {
    if (!selectedId) return;
    setIsLoadingThread(true);
    void loadMessages(false);
  }, [selectedId, loadMessages]);

  // Reset scroll state on conversation switch
  useEffect(() => {
    prevMessagesLengthRef.current = 0;
    isNearBottomRef.current = true;
  }, [selectedId]);

  // Responsive polling for messages and conversations + focus and visibility refresh
  useEffect(() => {
    const messagesIntervalMs = 2500;
    const conversationsIntervalMs = 4000;

    const messagesTimer = window.setInterval(() => {
      if (document.visibilityState === "visible" && selectedId) {
        void loadMessages(true);
      }
    }, messagesIntervalMs);

    const conversationsTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadConversations(true);
      }
    }, conversationsIntervalMs);

    const handleFocusOrVisible = () => {
      if (document.visibilityState === "visible") {
        if (selectedId) void loadMessages(true);
        void loadConversations(true);
      }
    };

    window.addEventListener("focus", handleFocusOrVisible);
    document.addEventListener("visibilitychange", handleFocusOrVisible);

    return () => {
      window.clearInterval(messagesTimer);
      window.clearInterval(conversationsTimer);
      window.removeEventListener("focus", handleFocusOrVisible);
      document.removeEventListener("visibilitychange", handleFocusOrVisible);
    };
  }, [selectedId, loadMessages, loadConversations]);

  const visibleConversations = useMemo(() => {
    const query = conversationSearch.trim().toLowerCase();
    return conversations.filter((conversation) => !query || conversationLabel(conversation).includes(query));
  }, [conversationSearch, conversations]);

  const selectedConversation = conversations.find(({ id }) => id === selectedId);
  const lawyerDisplayName = user?.fullName || user?.username || "You";
  const visibleMessages = selectedConversation?.messages.filter((message) =>
    !search.trim() || message.text.toLowerCase().includes(search.trim().toLowerCase()),
  ) ?? [];

  // Auto-scroll when messages change or new ones arrive
  useEffect(() => {
    const currentLength = selectedConversation?.messages.length ?? 0;
    const prevLength = prevMessagesLengthRef.current;
    if (currentLength > 0) {
      const isInitial = prevLength === 0;
      const hasNewMessage = currentLength > prevLength;
      const lastMessage = selectedConversation?.messages[currentLength - 1];
      const isOutbound = lastMessage?.direction === "outbound";

      if (isInitial || isOutbound || (hasNewMessage && isNearBottomRef.current)) {
        scrollToBottom(!isInitial);
      }
    }
    prevMessagesLengthRef.current = currentLength;
  }, [selectedConversation?.messages, scrollToBottom]);

  const selectConversation = (id: string) => {
    setSelectedId(id);
    setShowThreadOnMobile(true);
    setError("");
  };

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = messageDraft.trim();
    if (!text || !selectedConversation || isSending) return;
    setIsSending(true);
    setError("");
    try {
      const { message: sent } = await requestApi<{ message: ApiMessage }>(
        `/api/citizen/conversations/${encodeURIComponent(selectedConversation.id)}/messages`,
        { method: "POST", body: JSON.stringify({ text }) },
      );
      const message: Message = {
        id: sent.id,
        text: sent.text,
        time: formatTime(sent.createdAt),
        direction: "outbound",
        journalHandoff: sent.journalHandoff,
      };
      setConversations((current) =>
        current.map((conversation) => conversation.id === selectedConversation.id
          ? { ...conversation, preview: text, time: "now", messages: [...conversation.messages, message] }
          : conversation),
      );
      setMessageDraft("");
      scrollToBottom(true);
      void loadConversations(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to send this message.");
    } finally {
      setIsSending(false);
    }
  };

  const unavailable = (label: string) => setToast(`${label} is not available for citizen conversations.`);

  const createJournalContext = (message: Message): CitizenJournalHandoffContext | null => {
    const handoff = message.journalHandoff;
    if (!handoff) return null;
    return {
      messageId: message.id,
      title: handoff.title,
      entries: (handoff.entries ?? []).map(({ id, title, incidentDate, location, details }) => ({
        id,
        title,
        incidentDate,
        location,
        details,
      })),
      attachments: handoff.attachments.map((attachment) => attachment.fileName),
    };
  };

  const openJournalInDocumentAssembly = (message: Message) => {
    const handoff = createJournalContext(message);
    if (!handoff) return;
    try {
      window.sessionStorage.setItem("batasgo-journal-handoff", JSON.stringify(handoff));
    } catch {
      setJournalActionError({ messageId: message.id, message: "This browser could not pass the journal to Document Assembly." });
      return;
    }
    window.location.assign("/documents?source=journal-handoff");
  };

  const openJournalInBatasBot = (message: Message) => {
    const handoff = createJournalContext(message);
    if (!handoff) return;
    try {
      window.sessionStorage.setItem("batasbot-citizen-journal", JSON.stringify(handoff));
    } catch {
      setJournalActionError({ messageId: message.id, message: "This browser could not pass the journal to BatasBot." });
      return;
    }
    window.location.assign("/batasbot?source=citizen-journal");
  };

  const addJournalToIntakeQueue = async (message: Message) => {
    const handoff = message.journalHandoff;
    if (!handoff || savingJournalId) return;
    setSavingJournalId(message.id);
    setJournalActionError(null);

    const fullDescription = (handoff.entries ?? []).map((entry) =>
      `${entry.title} (${entry.incidentDate}${entry.location ? ` · ${entry.location}` : ""})\n${entry.details}`,
    ).join("\n\n");
    const description = fullDescription.slice(0, 1200);
    const title = `Journal: ${handoff.title}`.slice(0, 120);
    const urgency = scoreIntakeUrgency({
      title,
      description,
      deadlineAt: null,
      caseStage: "",
      urgencyFlags: [],
    });

    try {
      const result = await requestApi<{ intake: unknown }>("/api/intakes", {
        method: "POST",
        body: JSON.stringify({
          title,
          description: description || "No journal entry details were included.",
          domain: "",
          documents: handoff.attachments.slice(0, 10).map(({ fileName }) => fileName),
          deadlineAt: null,
          caseStage: "",
          urgencyFlags: [],
          priorityScore: urgency.score,
        }),
      });
      const parsed = intakeResponseSchema.safeParse(result);
      if (!parsed.success) throw new Error("The intake service returned an invalid response.");
      const followUp = [
        fullDescription.length > description.length ? "Journal details were shortened to fit the intake limit." : "",
        handoff.attachments.length > 10 ? "Only 10 attachment names can be saved with an intake." : "",
      ].filter(Boolean).join(" ");
      setToast(`Journal added to the intake queue as ${parsed.data.intake.reference} with urgency score ${urgency.score}/100.${followUp ? ` ${followUp}` : ""}`);
    } catch (actionError) {
      setJournalActionError({
        messageId: message.id,
        message: actionError instanceof Error ? actionError.message : "Unable to add this journal to the intake queue.",
      });
    } finally {
      setSavingJournalId(null);
    }
  };

  return (
    <WorkspaceShell
      activePage="Messages"
      search={search}
      onSearchChange={setSearch}
      onUnavailable={unavailable}
      searchPlaceholder="Search within messages..."
      searchLabel="Search within messages"
    >
      <main className="dashboard messages-page">
        <section className={`messages-workspace${showThreadOnMobile ? " messages-workspace--thread-open" : ""}`} aria-label="Messages">
          <aside className="conversation-panel" aria-label="Conversations">
            <div className="conversation-panel-heading">
              <h2>Direct Messages</h2>
            </div>
            {error && <p className="citizen-message-error" role="alert">{error}</p>}
            <label className="conversation-search">
              <Search aria-hidden="true" size={10.05} />
              <span className="sr-only">Filter conversations</span>
              <input
                type="search"
                value={conversationSearch}
                onChange={(event) => setConversationSearch(event.target.value)}
                placeholder="Search conversations..."
              />
            </label>
            <div className="conversation-list">
              {isLoading && <div className="conversation-empty" role="status">Loading conversations…</div>}
              {visibleConversations.map((conversation) => (
                <button
                  className={`conversation-item${selectedId === conversation.id ? " conversation-item--selected" : ""}`}
                  type="button"
                  key={conversation.id}
                  aria-current={selectedId === conversation.id ? "true" : undefined}
                  onClick={() => selectConversation(conversation.id)}
                >
                  <ProfileAvatar
                    name={conversation.client}
                    className="conversation-avatar"
                  />
                  <span className="conversation-item-copy">
                    <span className="conversation-item-top">
                      <strong>{conversation.client}</strong>
                      <time>{conversation.time}</time>
                    </span>
                    <span className="conversation-matter">{conversation.matter}</span>
                    <span className="conversation-preview">{conversation.preview}</span>
                  </span>
                </button>
              ))}
              {!isLoading && visibleConversations.length === 0 && (
                <div className="conversation-empty">
                  <Search aria-hidden="true" size={12.06} />
                  <p>{conversationSearch ? "No conversations match your search." : "Citizen conversations will appear here after a citizen contacts you."}</p>
                </div>
              )}
            </div>
          </aside>

          <section className="thread-panel" aria-label={selectedConversation ? `Conversation with ${selectedConversation.client}` : "Conversation"}>
            {selectedConversation ? (
              <>
                <header className="thread-header">
                  <button className="messages-icon-button thread-back-button" type="button" aria-label="Back to inbox" onClick={() => setShowThreadOnMobile(false)}>
                    <ArrowLeft size={12.06} />
                  </button>
                  <ProfileAvatar
                    name={selectedConversation.client}
                    className="thread-contact-avatar"
                  />
                  <div className="thread-contact">
                    <h2>{selectedConversation.threadTitle}</h2>
                    <p>{selectedConversation.matter}</p>
                  </div>
                </header>
                <div
                ref={messagesContainerRef}
                onScroll={handleMessagesScroll}
                className="thread-messages"
                aria-live="polite"
              >
                  {visibleMessages.map((message) => (
                    <article className={`thread-message thread-message--${message.direction}`} key={message.id}>
                      <ProfileAvatar
                        name={message.direction === "outbound" ? lawyerDisplayName : selectedConversation.client}
                        imageUrl={message.direction === "outbound" ? user?.imageUrl : undefined}
                        className="thread-message-avatar"
                      />
                      <div className="thread-message-bubble">
                        {message.text && <p>{message.text}</p>}
                        {message.journalHandoff && (
                          <section className="citizen-handoff-content">
                            <div className="citizen-handoff-heading">
                              <span className="citizen-handoff-tag">Journal</span>
                              <span>Shared as provided</span>
                            </div>
                            <h3>{message.journalHandoff.title}</h3>
                            <time>Consent recorded {formatTime(message.journalHandoff.consentedAt)}</time>
                            {message.journalHandoff.entries?.map((entry) => (
                              <article className="citizen-handoff-entry" key={entry.id}>
                                <strong>{entry.title}</strong>
                                <small>{entry.incidentDate}{entry.location ? ` · ${entry.location}` : ""}</small>
                                <p>{entry.details}</p>
                              </article>
                            ))}
                            {message.journalHandoff.attachments.length > 0 && (
                              <ul className="citizen-handoff-files">
                                {message.journalHandoff.attachments.map((attachment) => (
                                  <li key={attachment.id}>
                                    <a href={`/api/citizen/attachments/${encodeURIComponent(attachment.id)}`} download={attachment.fileName}>
                                      {attachment.fileName}
                                    </a>
                                    <span>{Math.ceil(attachment.sizeBytes / 1024)} KB</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                            {message.direction === "inbound" && (
                              <div className="citizen-handoff-actions" role="group" aria-label={`Actions for journal ${message.journalHandoff.title}`}>
                                <button type="button" onClick={() => openJournalInDocumentAssembly(message)}>
                                  <FileText aria-hidden="true" size={14} />
                                  Open in document assembly
                                </button>
                                <button type="button" onClick={() => openJournalInBatasBot(message)}>
                                  <Bot aria-hidden="true" size={14} />
                                  Open in BatasBot
                                </button>
                                <button
                                  type="button"
                                  disabled={Boolean(savingJournalId)}
                                  aria-busy={savingJournalId === message.id}
                                  onClick={() => void addJournalToIntakeQueue(message)}
                                >
                                  {savingJournalId === message.id
                                    ? <LoaderCircle className="citizen-handoff-loading" aria-hidden="true" size={14} />
                                    : <Plus aria-hidden="true" size={14} />}
                                  Add to intake queue
                                </button>
                              </div>
                            )}
                            {journalActionError?.messageId === message.id && (
                              <p className="citizen-handoff-action-error" role="alert">{journalActionError.message}</p>
                            )}
                          </section>
                        )}
                        <span className="thread-message-meta">
                          {message.time}
                          {message.direction === "outbound" && <CheckCheck aria-label="Sent" size={7.37} />}
                        </span>
                      </div>
                    </article>
                  ))}
                  {isLoadingThread && <div className="thread-search-empty" role="status">Loading messages…</div>}
                  {!isLoadingThread && visibleMessages.length === 0 && (
                    <div className="thread-search-empty" role="status">{search ? "No messages match your search." : "No messages in this conversation yet."}</div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
                <form className="message-composer" onSubmit={sendMessage}>
                  <div className="composer-input-wrap">
                    <button className="messages-icon-button composer-attachment" type="button" aria-label="Attach a file" onClick={() => unavailable("File attachments")}>
                      <Paperclip size={10.72} />
                    </button>
                    <span className="sr-only">Write a message</span>
                    <input
                      type="text"
                      value={messageDraft}
                      onChange={(event) => setMessageDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          event.currentTarget.form?.requestSubmit();
                        }
                      }}
                      placeholder="Write a reply to this citizen..."
                    />
                    <button className="composer-send" type="submit" aria-label="Send message" disabled={!messageDraft.trim() || isSending}>
                      <Send aria-hidden="true" size={11.39} />
                    </button>
                  </div>
                  <p className="composer-hint">{isSending ? "Sending…" : "Replies are stored in your workspace and visible to this citizen."}</p>
                </form>
              </>
            ) : (
              <div className="thread-empty">
                <span className="thread-empty-icon"><Mail aria-hidden="true" size={14.07} /></span>
                <h2>{search ? "Conversation not found" : "Select a conversation"}</h2>
                <p>{search ? "Clear or change your search to see this conversation." : "Choose a conversation from your inbox to read and reply."}</p>
                {search && <button type="button" onClick={() => setSearch("")}>Clear search</button>}
              </div>
            )}
          </section>
        </section>
      </main>
      {toast && (
        <div className="toast messages-toast" role="status">
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
