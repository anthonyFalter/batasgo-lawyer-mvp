"use client";

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Bot,
  Check,
  ChevronDown,
  ClipboardCopy,
  Download,
  Eye,
  FileText,
  Italic,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Redo2,
  Save,
  Send,
  Underline,
  Undo2,
  X,
} from "lucide-react";
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useTypingStream } from "@/hooks/use-typing-stream";
import WorkspaceShell from "../workspace/workspace-shell";
import "./document-assembly-workspace.css";

type EditorTab = "File" | "Home" | "Insert" | "Format" | "Review Changes" | "View";
type MobilePane = "reference" | "draft";
type ReferenceMode = "matter" | "chat";
type ReviewCheckId = "facts" | "law" | "privacy";
type ChatMessage = {
  id: number;
  role: "assistant" | "user";
  content: string;
};

type Attachment = {
  id: string;
  name: string;
  kind: string;
  detail: string;
};

const EDITOR_TABS: EditorTab[] = ["File", "Home", "Insert", "Format", "Review Changes", "View"];
const TOTAL_CLAIM = "₱2,999,997.66";
const MATTER_ID = "INTAKE-2024-0847";
const DOCUMENT_TITLE = "DOLE SENA Form 1 & Position Paper";

const DEFAULT_ATTACHMENTS: Attachment[] = [
  { id: "exhibit-a", name: "POEA_Standard_Contract_Verified.pdf", kind: "PDF", detail: "Exh. A · 1.4 MB" },
  { id: "exhibit-b", name: "Remittance_Slips_Consolidated.png", kind: "PNG", detail: "Exh. B · 840 KB" },
  { id: "exhibit-c", name: "WhatsApp_Termination_Notice.pdf", kind: "PDF", detail: "Exh. C · Constructive dismissal notice" },
];

const REVIEW_CHECKS: { id: ReviewCheckId; title: string; detail: string }[] = [
  {
    id: "facts",
    title: "Independent fact verification",
    detail: "I have checked names, dates, amounts, and claims against original matter records.",
  },
  {
    id: "law",
    title: "Legal and citation review",
    detail: "I have independently verified all statutes, citations, and legal assertions in this draft.",
  },
  {
    id: "privacy",
    title: "Privacy and redaction check",
    detail: "I have reviewed the document and exhibits for personal information that should be redacted.",
  },
];

const INITIAL_DRAFT = `
<div class="legal-letterhead">
  <p>REPUBLIC OF THE PHILIPPINES</p>
  <p>DEPARTMENT OF LABOR AND EMPLOYMENT</p>
  <p>NATIONAL CONCILIATION AND MEDIATION BOARD</p>
  <p class="legal-office">SINGLE ENTRY APPROACH (SENA) ASSISTANCE DESK — REGION NCR</p>
</div>
<div class="legal-parties">
  <div>
    <p><strong>Juan Dela Cruz,</strong><br><em>Requesting Party / Complainant,</em></p>
    <p class="legal-versus">— versus —</p>
    <p><strong>JDELCRUZ GLOBAL MANPOWER &amp; LOGISTICS CORP.</strong><br>and/or <strong>MariaCruz TRANSLOGISTICS LLC,</strong><br><em>Responding Parties / Agency.</em></p>
  </div>
  <div class="legal-docket"><strong>SENA DOCKET REF. NO.</strong><br>NCR-SENA-2024-02-0847</div>
</div>
<hr>
<h2>REQUEST FOR ASSISTANCE &amp; STATEMENT OF MONETARY CLAIMS</h2>
<p class="legal-intro"><strong>COMES NOW,</strong> the Requesting Party, assisted by counsel, and respectfully submits this Statement of Monetary Claims before this Honorable Office, and avers that:</p>
<h3>I. PARTIES AND JURISDICTIONAL FACTS</h3>
<p>1. Requesting Party <strong>Juan Dela Cruz</strong> is an Overseas Filipino Worker (OFW) of legal age, residing in Makati City, where process and notices of this office may be formally served.</p>
<p>2. Responding Agency <strong>JDELCRUZ Global Manpower &amp; Logistics Corp.</strong> is a domestic recruitment corporation. The relevant employment records are attached as supporting exhibits for review.</p>
<h3>II. STATEMENT OF FACTS &amp; CONSTRUCTIVE DISMISSAL</h3>
<p>3. The Requesting Party states that employment ended following the events described in the attached notices and supporting records. The dates and circumstances in this draft must be verified against the source documents before filing.</p>
<p>4. The Requesting Party seeks a review of the claims set out below. Each amount should be reconciled with the applicable records and legal basis.</p>
<h3>III. PRAYER</h3>
<p>WHEREFORE, premises considered, the Requesting Party respectfully requests appropriate assistance and such other relief as may be proper after independent review.</p>
<p class="legal-amount">Total monetary claim: <strong data-total-placeholder>INSERT COMPUTED TOTAL</strong></p>
<p>Respectfully submitted,</p>
<p class="legal-signature"><strong>ATTY. JUAN DELA CRUZ</strong><br>Counsel for the Requesting Party</p>
<p class="legal-disclaimer">DEMO DRAFT · Verify all facts and legal authorities before use. This sample is not legal advice and is not connected to a live client matter.</p>
`;

function formatBytes(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

export default function DocumentAssemblyWorkspace() {
  const [search, setSearch] = useState("");
  const [attachments, setAttachments] = useState(DEFAULT_ATTACHMENTS);
  const [activeTab, setActiveTab] = useState<EditorTab>("Home");
  const [summaryExpanded, setSummaryExpanded] = useState(true);
  const [referenceCollapsed, setReferenceCollapsed] = useState(false);
  const [referenceMode, setReferenceMode] = useState<ReferenceMode>("matter");
  const [mobilePane, setMobilePane] = useState<MobilePane>("draft");
  const [chatInput, setChatInput] = useState("");
  const { text: chatStreamingText, phase: chatTypingPhase, startTyping: startChatTyping } = useTypingStream();
  const isChatGenerating = chatTypingPhase !== "idle";
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 0,
      role: "assistant",
      content: "Hi, I’m BatasBot. I can help you organize your review of this document. What would you like to look at?",
    },
  ]);
  const [pageWide, setPageWide] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [savedLabel, setSavedLabel] = useState("Draft only");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewChecks, setReviewChecks] = useState<Record<ReviewCheckId, boolean>>({
    facts: false,
    law: false,
    privacy: false,
  });
  const [toast, setToast] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const firstReviewCheckRef = useRef<HTMLInputElement>(null);
  const reviewTriggerRef = useRef<HTMLButtonElement>(null);
  const nextAttachmentId = useRef(0);
  const nextChatMessageId = useRef(1);
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);
  const matterReferenceTabRef = useRef<HTMLButtonElement>(null);
  const batasbotTabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (reviewOpen) firstReviewCheckRef.current?.focus();
  }, [reviewOpen]);

  useEffect(() => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: chatTypingPhase === "idle" ? "smooth" : "auto", block: "end" });
  }, [chatMessages, isChatGenerating, chatStreamingText, chatTypingPhase]);

  const filteredAttachments = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query || `${MATTER_ID} ${DOCUMENT_TITLE}`.toLowerCase().includes(query)) return attachments;
    return attachments.filter((attachment) => `${attachment.name} ${attachment.kind} ${attachment.detail}`.toLowerCase().includes(query));
  }, [attachments, search]);

  const markDirty = () => {
    setIsDirty(true);
    setSavedLabel("Unsaved changes");
    setReviewChecks((current) => Object.values(current).some(Boolean)
      ? { facts: false, law: false, privacy: false }
      : current);
  };

  const runEditorCommand = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    markDirty();
  };

  const saveDraft = () => {
    setIsDirty(false);
    setSavedLabel("Saved for this preview");
    setToast("Draft saved in this preview. It will not persist after you leave.");
    setAnnouncement("Draft saved for this preview.");
  };

  const insertComputedTotal = () => {
    const editor = editorRef.current;
    if (!editor) return;

    const placeholder = editor.querySelector("[data-total-placeholder]");
    if (placeholder) {
      placeholder.replaceWith(document.createTextNode(TOTAL_CLAIM));
    } else {
      editor.focus();
      document.execCommand("insertText", false, ` Total monetary claim: ${TOTAL_CLAIM}`);
    }
    markDirty();
    setToast(`Computed total ${TOTAL_CLAIM} inserted into the draft.`);
  };

  const addAttachments = (files: FileList | null) => {
    if (!files?.length) return;
    const additions = Array.from(files).map((file, index) => ({
      id: `local-exhibit-${nextAttachmentId.current++}`,
      name: file.name,
      kind: file.name.split(".").pop()?.slice(0, 4).toUpperCase() || "FILE",
      detail: `Added locally · ${formatBytes(file.size)}${index === 0 ? " · new exhibit" : ""}`,
    }));
    setAttachments((current) => [...current, ...additions]);
    markDirty();
    setToast(`${additions.length} file${additions.length === 1 ? "" : "s"} added to this demo.`);
    setAnnouncement(`${additions.length} file${additions.length === 1 ? "" : "s"} added to exhibits.`);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const sendChatMessage = (message: string) => {
    const content = message.trim();
    if (!content || isChatGenerating) return;

    const query = content.toLowerCase();
    let response = "I can help you organize a review checklist. This preview is not connected to matter records or legal sources, so verify all facts, calculations, and legal authorities independently.";
    if (query.includes("summar")) {
      response = "For this sample document, compare the parties and employment details with the exhibits, reconcile each claim amount with its source records, and verify the legal basis before exporting. This preview is not connected to live matter records or legal sources.";
    } else if (query.includes("claim") || query.includes("calculation") || query.includes("amount")) {
      response = `The sample workspace shows a total claim of ${TOTAL_CLAIM}. Check each component against the original records and confirm the applicable legal basis; this demo cannot verify the calculation.`;
    } else if (query.includes("draft") || query.includes("review")) {
      response = "A careful review can check party names and dates against source documents, confirm each amount and citation independently, and redact sensitive information before sharing. This demo does not verify the draft.";
    }

    const userMessage = { id: nextChatMessageId.current++, role: "user" as const, content };
    const assistantMessage = { id: nextChatMessageId.current++, role: "assistant" as const, content: response };
    setChatMessages((current) => [...current, userMessage]);
    setChatInput("");
    startChatTyping(assistantMessage.content, () => {
      setChatMessages((current) => [...current, assistantMessage]);
    });
  };

  const handleReferenceTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;

    event.preventDefault();
    const nextMode: ReferenceMode = event.key === "ArrowRight" || event.key === "End" ? "chat" : "matter";
    setReferenceMode(nextMode);
    (nextMode === "matter" ? matterReferenceTabRef : batasbotTabRef).current?.focus();
  };

  const exportDraft = () => {
    const text = editorRef.current?.innerText ?? "";
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(DOCUMENT_TITLE)}</title></head><body><article style="max-width:720px;margin:40px auto;font:16px Georgia,serif;line-height:1.65;white-space:pre-wrap">${escapeHtml(text)}</article></body></html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${MATTER_ID.toLowerCase()}-document-draft.html`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setReviewOpen(false);
    setSavedLabel("Review copy exported");
    setToast("Review copy exported. The draft remains local to this demo.");
    setAnnouncement("Review copy exported.");
    reviewTriggerRef.current?.focus();
  };

  const allChecksComplete = REVIEW_CHECKS.every(({ id }) => reviewChecks[id]);

  return (
    <WorkspaceShell
      activePage="Document Assembly"
      search={search}
      onSearchChange={setSearch}
      onUnavailable={(label) => setToast(`${label} is not part of this demo yet.`)}
      searchPlaceholder="Search this matter's documents..."
      searchLabel="Search this matter's documents"
      compactNavigation
    >
      <main className="document-assembly">
        <div className="document-contextline">
          <div className="document-breadcrumb" aria-label="Document location">
            <span>Matters</span><span aria-hidden="true">/</span><strong>{MATTER_ID}</strong><span aria-hidden="true">/</span><span>SENA Request &amp; Position Paper</span>
          </div>
          <div className="document-context-title">
            <strong>{DOCUMENT_TITLE}</strong>
            <span>(Draft Only)</span>
          </div>
        </div>

        <div className="document-mobile-switcher" role="group" aria-label="Choose document workspace panel">
          <button type="button" aria-pressed={mobilePane === "reference"} onClick={() => setMobilePane("reference")}>Matter reference</button>
          <button type="button" aria-pressed={mobilePane === "draft"} onClick={() => setMobilePane("draft")}>Draft editor</button>
        </div>

        <section className={`document-workspace${referenceCollapsed ? " document-workspace--reference-collapsed" : ""}`} aria-label="Document assembly workspace">
          <aside className={`document-reference${mobilePane === "reference" ? " document-reference--mobile-active" : ""}${referenceMode === "chat" ? " document-reference--chat-active" : ""}`} aria-label="Document reference">
            <header className="document-reference-heading">
              <h2>Document Reference</h2>
              <div className="document-reference-heading-actions">
                {referenceMode === "matter" && (
                  <button type="button" className="document-text-action" onClick={() => setSummaryExpanded((expanded) => !expanded)} aria-expanded={summaryExpanded}>
                    {summaryExpanded ? "Collapse summary" : "Show summary"}
                    <ChevronDown aria-hidden="true" size={14} className={summaryExpanded ? "document-chevron--open" : ""} />
                  </button>
                )}
                <button
                  type="button"
                  className="document-reference-collapse"
                  onClick={() => setReferenceCollapsed((collapsed) => !collapsed)}
                  aria-label={referenceCollapsed ? "Expand Document Reference" : "Collapse Document Reference"}
                  aria-controls="document-reference-content"
                  aria-expanded={!referenceCollapsed}
                  title={referenceCollapsed ? "Expand Document Reference" : "Collapse Document Reference"}
                >
                  {referenceCollapsed ? <PanelLeftOpen aria-hidden="true" size={16} /> : <PanelLeftClose aria-hidden="true" size={16} />}
                </button>
              </div>
            </header>

            <div className="document-reference-tabs" role="tablist" aria-label="Reference pane views">
              <button
                type="button"
                id="matter-reference-tab"
                role="tab"
                ref={matterReferenceTabRef}
                tabIndex={referenceMode === "matter" ? 0 : -1}
                aria-selected={referenceMode === "matter"}
                aria-controls="matter-reference-panel"
                className={referenceMode === "matter" ? "document-reference-tab document-reference-tab--active" : "document-reference-tab"}
                onKeyDown={handleReferenceTabKeyDown}
                onClick={() => setReferenceMode("matter")}
              >
                Matter
              </button>
              <button
                type="button"
                id="batasbot-tab"
                role="tab"
                ref={batasbotTabRef}
                tabIndex={referenceMode === "chat" ? 0 : -1}
                aria-selected={referenceMode === "chat"}
                aria-controls="batasbot-panel"
                className={referenceMode === "chat" ? "document-reference-tab document-reference-tab--active" : "document-reference-tab"}
                onKeyDown={handleReferenceTabKeyDown}
                onClick={() => setReferenceMode("chat")}
              >
                <Bot aria-hidden="true" size={13} />
                BatasBot
              </button>
            </div>

            <div className="document-reference-content" id="document-reference-content">
              {referenceMode === "matter" && (
                <div className="matter-reference-panel" id="matter-reference-panel" role="tabpanel" aria-labelledby="matter-reference-tab">
                  {summaryExpanded && (
                <div className="matter-snapshot">
                  <div className="matter-snapshot-top">
                    <span className="matter-domain">OFW Landbased / Logistics</span>
                    <span className="matter-reference-id">{MATTER_ID}</span>
                  </div>
                  <dl className="matter-parties">
                    <div><dt>Complainant</dt><dd>Juan Dela Cruz · Client #0847</dd></div>
                    <div><dt>Responding agency</dt><dd>JDELCRUZ Global Manpower &amp; Logistics Corp.</dd></div>
                    <div><dt>Principal / foreign employer</dt><dd>MariaCruz TransLogistics LLC · Riyadh, KSA</dd></div>
                  </dl>
                </div>
              )}

              <div className="matter-facts" aria-label="Matter facts">
                <div><span>Client tenure</span><strong>9 yrs, 29 days</strong></div>
                <div><span>Last basic wage</span><strong>₱99,999 / mo</strong></div>
              </div>

              <section className="claim-calculation" aria-labelledby="claim-title">
                <h3 id="claim-title">Computation flow</h3>
                <dl>
                  <div><dt>Art. 298 separation pay (1 mo/yr)</dt><dd>₱999,999.00</dd></div>
                  <div><dt>Illegal placement fee reimbursement</dt><dd>₱999,999.00</dd></div>
                  <div><dt>Prorated 13th month &amp; backwages</dt><dd>₱999,999.66</dd></div>
                  <div className="claim-total"><dt>Total monetary claim</dt><dd>{TOTAL_CLAIM}</dd></div>
                </dl>
                <button type="button" onClick={insertComputedTotal}>
                  <ClipboardCopy aria-hidden="true" size={14} />
                  Insert computed sum into draft
                </button>
              </section>

              <section className="exhibits-section" aria-labelledby="exhibits-title">
                <div className="exhibits-heading">
                  <h3 id="exhibits-title">Evidentiary exhibits <span>({filteredAttachments.length})</span></h3>
                  <button type="button" className="document-text-action" onClick={() => fileInputRef.current?.click()}>
                    <Paperclip aria-hidden="true" size={13} />
                    Attach files
                  </button>
                  <input
                    ref={fileInputRef}
                    className="document-file-input"
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                    multiple
                    onChange={(event) => addAttachments(event.target.files)}
                    aria-label="Attach files to this document"
                  />
                </div>
                {filteredAttachments.length ? (
                  <ul className="exhibit-list">
                    {filteredAttachments.map((attachment) => (
                      <li className="exhibit-item" key={attachment.id}>
                        <span className={`exhibit-file-type exhibit-file-type--${attachment.kind.toLowerCase()}`}>{attachment.kind}</span>
                        <span className="exhibit-file-copy"><strong title={attachment.name}>{attachment.name}</strong><small>{attachment.detail}</small></span>
                        <button type="button" className="exhibit-preview-button" aria-label={`Preview ${attachment.name}`} onClick={() => setToast(`Preview for ${attachment.name} is not connected in this demo.`)}>
                          <Eye aria-hidden="true" size={16} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="exhibit-empty">No exhibits match “{search}”. Try another search or attach a file.</p>
                )}
              </section>

              <section className="client-statement">
                <div><strong>Client direct statement</strong><span>Voice note transcription</span></div>
                <p>“I have the contract and remittance slips ready for review.”</p>
                <time>3 min ago · Sample</time>
              </section>
              <p className="document-reference-note">Sample matter information for interface preview. No client data or files are connected.</p>
                </div>
              )}

              {referenceMode === "chat" && (
                <section className="batasbot-chat" id="batasbot-panel" role="tabpanel" aria-labelledby="batasbot-tab" aria-label="Chat with BatasBot">
                  <div className="batasbot-messages" role="log" aria-live="polite" aria-relevant="additions text" aria-label="BatasBot conversation">
                    {chatMessages.map((message) => (
                      <div className={`batasbot-message batasbot-message--${message.role}`} key={message.id}>
                        {message.role === "assistant" && (
                          <span className="batasbot-avatar" aria-hidden="true"><Bot size={15} /></span>
                        )}
                        <p>{message.content}</p>
                      </div>
                    ))}
                    {chatTypingPhase === "thinking" && (
                      <div className="batasbot-message batasbot-message--assistant">
                        <span className="batasbot-avatar" aria-hidden="true"><Bot size={15} /></span>
                        <div className="batasbot-typing" role="status" aria-label="BatasBot is generating a reply">
                          <span aria-hidden="true"><i /><i /><i /></span>
                          <span className="sr-only">BatasBot is typing</span>
                        </div>
                      </div>
                    )}
                    {chatTypingPhase === "typing" && (
                      <div className="batasbot-message batasbot-message--assistant">
                        <span className="batasbot-avatar" aria-hidden="true"><Bot size={15} /></span>
                        <p className="batasbot-streaming-text" aria-live="off">{chatStreamingText}</p>
                      </div>
                    )}
                    <div ref={chatMessagesEndRef} />
                  </div>

                  {chatMessages.length === 1 && (
                    <div className="batasbot-prompts" aria-label="Suggested messages">
                      <button type="button" onClick={() => sendChatMessage("Help me review this draft")}>Review this draft</button>
                      <button type="button" onClick={() => sendChatMessage("Summarize this matter")}>Summarize matter</button>
                    </div>
                  )}

                  <form
                    className="batasbot-composer"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (isChatGenerating) return;
                      sendChatMessage(chatInput);
                    }}
                  >
                    <label className="sr-only" htmlFor="batasbot-message">Message BatasBot</label>
                    <textarea
                      id="batasbot-message"
                      value={chatInput}
                      onChange={(event) => setChatInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          if (!isChatGenerating) sendChatMessage(chatInput);
                        }
                      }}
                      placeholder="Ask BatasBot..."
                      rows={1}
                    />
                    <button type="submit" aria-label="Send message" disabled={!chatInput.trim() || isChatGenerating}>
                      <Send aria-hidden="true" size={15} />
                    </button>
                  </form>
                  <p className="batasbot-disclaimer">BatasBot preview · Replies are sample text, not legal advice.</p>
                </section>
              )}
            </div>
          </aside>

          <section className={`document-editor${mobilePane === "draft" ? " document-editor--mobile-active" : ""}`} aria-label="Draft document editor">
            <header className="document-editor-heading">
              <div className="document-file-icon"><FileText aria-hidden="true" size={17} /></div>
              <div className="document-name">
                <h2>{DOCUMENT_TITLE}</h2>
                <span>{MATTER_ID}</span>
              </div>
              <span className="draft-only-badge">Draft only</span>
            </header>

            <div className="editor-tabs" role="tablist" aria-label="Document editing tools">
              {EDITOR_TABS.map((tab) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  className={activeTab === tab ? "editor-tab editor-tab--active" : "editor-tab"}
                  key={tab}
                  ref={tab === "Review Changes" ? reviewTriggerRef : undefined}
                  onClick={() => {
                    setActiveTab(tab);
                    if (tab === "Review Changes") setReviewOpen(true);
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="editor-toolbar" role="toolbar" aria-label={`${activeTab} formatting toolbar`}>
              {activeTab === "Home" && (
                <>
                  <div className="editor-tool-group">
                    <button type="button" className="editor-tool-button" title="Undo" aria-label="Undo" onMouseDown={(event) => event.preventDefault()} onClick={() => runEditorCommand("undo")}><Undo2 size={15} /></button>
                    <button type="button" className="editor-tool-button" title="Redo" aria-label="Redo" onMouseDown={(event) => event.preventDefault()} onClick={() => runEditorCommand("redo")}><Redo2 size={15} /></button>
                  </div>
                  <span className="editor-tool-divider" />
                  <label className="editor-select-wrap">
                    <span className="sr-only">Font family</span>
                    <select defaultValue="Georgia" onChange={(event) => runEditorCommand("fontName", event.target.value)}>
                      <option value="Georgia">Georgia</option>
                      <option value="Arial">Arial</option>
                      <option value="Times New Roman">Times New Roman</option>
                    </select>
                    <ChevronDown size={13} aria-hidden="true" />
                  </label>
                  <label className="editor-select-wrap editor-font-size">
                    <span className="sr-only">Font size</span>
                    <select defaultValue="3" onChange={(event) => runEditorCommand("fontSize", event.target.value)}>
                      <option value="2">10 pt</option><option value="3">12 pt</option><option value="4">14 pt</option><option value="5">18 pt</option>
                    </select>
                    <ChevronDown size={13} aria-hidden="true" />
                  </label>
                  <span className="editor-tool-divider" />
                  <div className="editor-tool-group">
                    <button type="button" className="editor-tool-button" title="Bold" aria-label="Bold" onMouseDown={(event) => event.preventDefault()} onClick={() => runEditorCommand("bold")}><Bold size={15} /></button>
                    <button type="button" className="editor-tool-button" title="Italic" aria-label="Italic" onMouseDown={(event) => event.preventDefault()} onClick={() => runEditorCommand("italic")}><Italic size={15} /></button>
                    <button type="button" className="editor-tool-button" title="Underline" aria-label="Underline" onMouseDown={(event) => event.preventDefault()} onClick={() => runEditorCommand("underline")}><Underline size={15} /></button>
                  </div>
                  <span className="editor-tool-divider" />
                  <div className="editor-tool-group">
                    <button type="button" className="editor-tool-button" title="Align left" aria-label="Align left" onMouseDown={(event) => event.preventDefault()} onClick={() => runEditorCommand("justifyLeft")}><AlignLeft size={15} /></button>
                    <button type="button" className="editor-tool-button" title="Align center" aria-label="Align center" onMouseDown={(event) => event.preventDefault()} onClick={() => runEditorCommand("justifyCenter")}><AlignCenter size={15} /></button>
                    <button type="button" className="editor-tool-button" title="Align right" aria-label="Align right" onMouseDown={(event) => event.preventDefault()} onClick={() => runEditorCommand("justifyRight")}><AlignRight size={15} /></button>
                  </div>
                </>
              )}
              {activeTab === "File" && (
                <button type="button" className="editor-tool-button editor-tool-labeled" onClick={saveDraft}><Save size={15} /> Save draft</button>
              )}
              {activeTab === "Insert" && (
                <>
                  <button type="button" className="editor-tool-button editor-tool-labeled" onClick={() => runEditorCommand("insertText", new Date().toLocaleDateString("en-PH"))}>Insert date</button>
                  <button type="button" className="editor-tool-button editor-tool-labeled" onClick={() => runEditorCommand("insertHTML", "<p><br><strong>ATTY. JUAN DELA CRUZ</strong><br>Counsel for the Requesting Party</p>")}>Signature block</button>
                  <button type="button" className="editor-tool-button editor-tool-labeled" onClick={() => runEditorCommand("insertHTML", "<hr><p><br></p>")}>Page break</button>
                </>
              )}
              {activeTab === "Format" && (
                <label className="editor-select-wrap">
                  <span className="sr-only">Paragraph style</span>
                  <select defaultValue="p" onChange={(event) => runEditorCommand("formatBlock", event.target.value)}>
                    <option value="p">Paragraph</option><option value="h2">Heading</option><option value="blockquote">Quotation</option>
                  </select>
                  <ChevronDown size={13} aria-hidden="true" />
                </label>
              )}
              {activeTab === "Review Changes" && (
                <button type="button" className="editor-tool-button editor-tool-labeled" onClick={() => setReviewOpen(true)}>
                  <Check size={15} /> Review &amp; export draft
                </button>
              )}
              {activeTab === "View" && (
                <button type="button" className="editor-tool-button editor-tool-labeled" aria-pressed={pageWide} onClick={() => setPageWide((wide) => !wide)}>
                  {pageWide ? "Fit page" : "Page width"}
                </button>
              )}
            </div>

            <div className="document-paper-scroll">
              <article
                ref={editorRef}
                className={`document-paper${pageWide ? " document-paper--wide" : ""}`}
                contentEditable
                suppressContentEditableWarning
                role="textbox"
                aria-label="Editable document draft"
                aria-multiline="true"
                spellCheck
                onInput={(event) => {
                  markDirty();
                }}
                dangerouslySetInnerHTML={{ __html: INITIAL_DRAFT }}
              />
            </div>
            <footer className="document-editor-footer">
              <span><span className="document-footer-dot" /> Local draft · Changes are not sent to a server</span>
              <span>{isDirty ? "Unsaved" : savedLabel}</span>
            </footer>
          </section>
        </section>
        <p className="sr-only" aria-live="polite">{announcement}</p>

        {reviewOpen && (
          <div className="document-review-scrim" onMouseDown={(event) => {
            if (event.target === event.currentTarget) setReviewOpen(false);
          }} onKeyDown={(event) => {
            if (event.key === "Escape") {
              setReviewOpen(false);
              reviewTriggerRef.current?.focus();
            }
          }}>
            <section className="document-review-dialog" role="dialog" aria-modal="true" aria-labelledby="document-review-title" aria-describedby="document-review-description">
              <header className="document-review-dialog-header">
                <div>
                  <h2 id="document-review-title">Review &amp; ethical verification</h2>
                  <p id="document-review-description">Confirm each item before exporting a review copy. This action does not file or sign the document.</p>
                </div>
                <button type="button" className="document-icon-button" aria-label="Close review" onClick={() => {
                  setReviewOpen(false);
                  reviewTriggerRef.current?.focus();
                }}><X size={18} /></button>
              </header>
              <div className="document-review-context">
                <span>{DOCUMENT_TITLE}</span><span>Matter: <strong>{MATTER_ID}</strong></span>
              </div>
              <div className="document-review-checklist">
                <h3>Required checklist</h3>
                {REVIEW_CHECKS.map(({ id, title, detail }, index) => (
                  <label className="document-review-check" key={id}>
                    <input
                      ref={index === 0 ? firstReviewCheckRef : undefined}
                      type="checkbox"
                      checked={reviewChecks[id]}
                      onChange={(event) => setReviewChecks((current) => ({ ...current, [id]: event.target.checked }))}
                    />
                    <span><strong>{title}</strong><small>{detail}</small></span>
                  </label>
                ))}
              </div>
              <footer className="document-review-dialog-footer">
                <button type="button" className="document-secondary-action" onClick={() => {
                  setReviewOpen(false);
                  reviewTriggerRef.current?.focus();
                }}>Back to draft</button>
                <button type="button" className="new-intake-button document-export-button" disabled={!allChecksComplete} onClick={exportDraft}>
                  <Download aria-hidden="true" size={15} />
                  Export review copy
                </button>
              </footer>
            </section>
          </div>
        )}

        {toast && (
          <div className="document-toast" role="status">
            <Check aria-hidden="true" size={15} />
            <span>{toast}</span>
            <button type="button" aria-label="Dismiss notification" onClick={() => setToast("")}><X size={15} /></button>
          </div>
        )}
      </main>
    </WorkspaceShell>
  );
}
