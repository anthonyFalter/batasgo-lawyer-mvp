"use client";

import {
  ArrowLeft,
  Check,
  CheckCheck,
  Mail,
  Paperclip,
  Search,
  Send,
  X,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import WorkspaceShell from "../workspace/workspace-shell";
import "./messages-workspace.css";

type Message = {
  id: string;
  text: string;
  time: string;
  direction: "inbound" | "outbound";
};

type Conversation = {
  id: string;
  client: string;
  threadTitle: string;
  matter: string;
  preview: string;
  time: string;
  retention: string;
  messages: Message[];
};

const initialConversations: Conversation[] = [
  {
    id: "0847",
    client: "Client Case #0847",
    threadTitle: "Client Case #0847 (OFW Dismissal)",
    matter: "Riyadh Agency Dispute",
    preview: "Opo Attorney, tinanggal po ako sa trabaho nang walang ibinigay na notice noong nakaraang linggo.",
    time: "12m ago",
    retention: "Sample conversation",
    messages: [
      {
        id: "0847-1",
        text: "Opo Attorney, tinanggal po ako sa trabaho nang walang ibinigay na notice noong nakaraang linggo.",
        time: "01:15 PM",
        direction: "inbound",
      },
      {
        id: "0847-2",
        text: "May hawak po ba kayong payslips, ID, employment contract, o communications (text/chat/email) tungkol sa pagtanggal sa inyo?",
        time: "01:20 PM",
        direction: "outbound",
      },
    ],
  },
  {
    id: "0147",
    client: "Client Case #0147",
    threadTitle: "Client Case #0147",
    matter: "Evidence review",
    preview: "Naprosess napo yung ebidensiya.",
    time: "1h ago",
    retention: "Sample conversation",
    messages: [
      { id: "0147-1", text: "Naprosess napo yung ebidensiya.", time: "12:02 PM", direction: "inbound" },
    ],
  },
];

function conversationLabel(conversation: Conversation) {
  return `${conversation.client} ${conversation.matter} ${conversation.preview}`.toLowerCase();
}

export default function MessagesWorkspace() {
  const [conversations, setConversations] = useState(initialConversations);
  const [selectedId, setSelectedId] = useState(initialConversations[0].id);
  const [search, setSearch] = useState("");
  const [conversationSearch, setConversationSearch] = useState("");
  const [messageDraft, setMessageDraft] = useState("");
  const [showThreadOnMobile, setShowThreadOnMobile] = useState(false);
  const [toast, setToast] = useState("");

  const visibleConversations = useMemo(() => {
    const query = conversationSearch.trim().toLowerCase();
    return conversations.filter((conversation) => !query || conversationLabel(conversation).includes(query));
  }, [conversationSearch, conversations]);

  const selectedConversation = conversations.find(({ id }) => id === selectedId);
  const visibleMessages = selectedConversation?.messages.filter((message) =>
    !search.trim() || message.text.toLowerCase().includes(search.trim().toLowerCase()),
  ) ?? [];

  const selectConversation = (id: string) => {
    setSelectedId(id);
    setShowThreadOnMobile(true);
  };

  const sendMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = messageDraft.trim();
    if (!text || !selectedConversation) return;

    const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date());
    const message: Message = {
      id: `${selectedConversation.id}-${Date.now()}`,
      text,
      time,
      direction: "outbound",
    };

    setConversations((current) =>
      current.map((conversation) => conversation.id === selectedConversation.id
        ? { ...conversation, preview: text, time: "now", messages: [...conversation.messages, message] }
        : conversation),
    );
    setMessageDraft("");
  };

  const unavailable = (label: string) => setToast(`${label} is not part of this demo yet.`);

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
              {visibleConversations.map((conversation) => (
                <button
                  className={`conversation-item${selectedId === conversation.id ? " conversation-item--selected" : ""}`}
                  type="button"
                  key={conversation.id}
                  aria-current={selectedId === conversation.id ? "true" : undefined}
                  onClick={() => selectConversation(conversation.id)}
                >
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
              {visibleConversations.length === 0 && (
                <div className="conversation-empty">
                  <Search aria-hidden="true" size={12.06} />
                  <p>No conversations match your search.</p>
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
                  <div className="thread-contact">
                    <h2>{selectedConversation.threadTitle}</h2>
                    <p>{selectedConversation.matter}</p>
                  </div>
                  <span className="thread-retention">{selectedConversation.retention}</span>
                </header>
                <div className="thread-messages" aria-live="polite">
                  {visibleMessages.map((message) => (
                    <article className={`thread-message thread-message--${message.direction}`} key={message.id}>
                      <div className="thread-message-bubble">
                        {message.text && <p>{message.text}</p>}
                        <span className="thread-message-meta">
                          {message.time}
                          {message.direction === "outbound" && <CheckCheck aria-label="Sent" size={7.37} />}
                        </span>
                      </div>
                    </article>
                  ))}
                  {visibleMessages.length === 0 && (
                    <div className="thread-search-empty" role="status">No messages match your search.</div>
                  )}
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
                      placeholder="Type a message..."
                    />
                    <button className="composer-send" type="submit" aria-label="Send message" disabled={!messageDraft.trim()}>
                      <Send aria-hidden="true" size={11.39} />
                    </button>
                  </div>
                  <p className="composer-hint">Demo only · Replies are not sent.</p>
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
