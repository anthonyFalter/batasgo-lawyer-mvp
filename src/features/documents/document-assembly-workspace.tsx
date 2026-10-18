"use client";

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  Bold,
  Bot,
  Check,
  ChevronDown,
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
  Sparkles,
  Underline,
  Undo2,
  X,
} from "lucide-react";
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  isCitizenJournalHandoffContext,
  type CitizenJournalHandoffContext,
} from "@/lib/citizen/journal-handoff-context";
import { useTypingStream } from "@/hooks/use-typing-stream";
import DocumentTemplatePicker, {
  type DocumentTemplate,
  sanitizeTemplateMarkup,
} from "./document-template-picker";
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

type ImportedIntake = {
  id: string;
  intakeId?: string;
  client: string;
  domain: string;
  risk: string;
  summary: string;
  documents: string[];
  result: "accepted" | "journal";
};

type WorkspaceIntake = {
  id: string;
  reference: string;
  domain: string;
  risk: string;
  client: string;
  summary: string;
  documents: string[];
  status: "pending" | "accepted" | "declined";
  caseStage: string;
  deadline: string;
  urgencyFlags: string[];
};

type SavedDocument = {
  id: string;
  intakeId: string | null;
  title: string;
  documentType: string;
  status: string;
  fontFamily: string;
  matterReference?: string | null;
  updatedAt: string;
};

const EDITOR_TABS: EditorTab[] = ["File", "Home", "Insert", "Format", "Review Changes", "View"];
const DOCUMENT_TITLE = "DOLE SENA Form 1 & Position Paper";

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
  <p class="legal-office">SINGLE ENTRY APPROACH (SENA) ASSISTANCE DESK — [Region to be confirmed]</p>
</div>
<div class="legal-parties">
  <div>
    <p><strong>[Client name — To be confirmed],</strong><br><em>Requesting Party / Complainant,</em></p>
    <p class="legal-versus">— versus —</p>
    <p><strong>[Responding party — To be confirmed]</strong><br><em>Responding Party / Agency.</em></p>
  </div>
  <div class="legal-docket"><strong>SENA DOCKET REF. NO.</strong><br>[Reference to be confirmed]</div>
</div>
<hr>
<h2>REQUEST FOR ASSISTANCE &amp; STATEMENT OF MONETARY CLAIMS</h2>
<p class="legal-intro"><strong>COMES NOW,</strong> the Requesting Party, assisted by counsel, and respectfully submits this Statement of Monetary Claims before this Honorable Office, and avers that:</p>
<h3>I. PARTIES AND JURISDICTIONAL FACTS</h3>
<p>1. Requesting Party <strong>[Client name — To be confirmed]</strong> is of legal age and resides at <strong>[Address — To be confirmed]</strong>.</p>
<p>2. Responding Party <strong>[Responding party — To be confirmed]</strong> is described in the available matter records. The relevant records are attached as supporting exhibits for review.</p>
<h3>II. STATEMENT OF FACTS &amp; CONSTRUCTIVE DISMISSAL</h3>
<p>3. The Requesting Party states that the matter arose from the facts described in the available intake summary and source records. The dates and circumstances in this draft must be verified before filing.</p>
<p>4. The Requesting Party seeks a review of the claims set out below. Each amount and legal basis should be reconciled with the source records.</p>
<h3>III. PRAYER</h3>
<p>WHEREFORE, premises considered, the Requesting Party respectfully requests appropriate assistance and such other relief as may be proper after independent review.</p>
<p class="legal-amount">Total monetary claim: <strong>[Amount to be confirmed]</strong></p>
<p>Respectfully submitted,</p>
<p class="legal-signature"><strong>[Attorney name — To be confirmed]</strong><br>Counsel for the Requesting Party</p>
<p class="legal-disclaimer">Drafting aid · Verify all facts, documents, and legal authorities before use.</p>
`;

const BUILT_IN_TEMPLATES: DocumentTemplate[] = [
  {
    id: "position-paper",
    name: DOCUMENT_TITLE,
    category: "Pleadings",
    description: "A structured SENA position paper with facts, claims, and a verification-ready signature block.",
    html: INITIAL_DRAFT,
    previewTheme: "blue",
    source: "library",
  },
  {
    id: "demand-letter",
    name: "Demand letter",
    category: "Correspondence",
    description: "Formal client correspondence with a clear issue summary and requested action.",
    html: `<div class="legal-letterhead"><p>ATTORNEY AT LAW</p><p>MAKATI CITY · PHILIPPINES</p></div><p>September 17, 2024</p><p><strong>VIA REGISTERED MAIL</strong></p><p>To: [Recipient name]<br>[Recipient address]</p><p>Re: <strong>[Matter or subject]</strong></p><p>Dear [Recipient name]:</p><p>We represent [Client name] regarding [brief description of matter]. This letter summarizes the requested resolution and the records supporting our client's position.</p><h2>REQUESTED ACTION</h2><p>Please provide a written response by [date] addressing the matters described above. Our client reserves all rights and remedies available under applicable law.</p><p>Sincerely,</p><p><strong>[Attorney name]</strong><br>Counsel for [Client name]</p>`,
    previewTheme: "red",
    source: "library",
  },
  {
    id: "legal-memorandum",
    name: "Legal memorandum",
    category: "Research",
    description: "An issue, rule, analysis, and conclusion structure for internal legal research.",
    html: `<div class="legal-letterhead"><p>CONFIDENTIAL · ATTORNEY WORK PRODUCT</p></div><h1>LEGAL MEMORANDUM</h1><p><strong>To:</strong> [Supervising attorney]<br><strong>From:</strong> [Researching attorney]<br><strong>Date:</strong> [Date]<br><strong>Re:</strong> [Question presented]</p><hr><h2>QUESTION PRESENTED</h2><p>[State the legal issue to be resolved.]</p><h2>BRIEF ANSWER</h2><p>[Summarize the likely answer and the principal qualification.]</p><h2>FACTS</h2><p>[Set out material facts and identify any facts requiring confirmation.]</p><h2>ANALYSIS</h2><p>[Explain the applicable rule, analyze the relevant facts, and identify uncertainties.]</p><h2>CONCLUSION</h2><p>[State the recommended next step.]</p>`,
    previewTheme: "gray",
    source: "library",
  },
  {
    id: "client-consultation",
    name: "Client consultation notes",
    category: "Client notes",
    description: "An organized meeting record for key facts, client goals, and follow-up items.",
    html: `<h1>CLIENT CONSULTATION NOTES</h1><p><strong>Client:</strong> [Client name]<br><strong>Date and time:</strong> [Date]<br><strong>Attendees:</strong> [Attendees]<br><strong>Matter:</strong> [Matter type]</p><h2>CLIENT'S OBJECTIVES</h2><p>[Record the client's stated goals in their own words where appropriate.]</p><h2>RELEVANT FACTS</h2><ol><li>[Fact and source]</li><li>[Fact and source]</li><li>[Fact to confirm]</li></ol><h2>DOCUMENTS TO REQUEST</h2><ul><li>[Document]</li><li>[Document]</li></ul><h2>NEXT STEPS</h2><p>[Action] · [Owner] · [Due date]</p><p><em>Confidential working notes. Verify all details against the matter record.</em></p>`,
    previewTheme: "green",
    source: "library",
  },
  {
    id: "blank-document",
    name: "Blank document",
    category: "Client notes",
    description: "A clean page with formal legal-document typography, ready for your own structure.",
    html: "<p><br></p>",
    previewTheme: "plain",
    source: "library",
  },
];

function formatBytes(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function isImportedIntake(value: unknown): value is ImportedIntake {
  if (!value || typeof value !== "object") return false;
  const intake = value as Partial<ImportedIntake>;
  return (intake.result === "accepted" || intake.result === "journal")
    && typeof intake.id === "string"
    && typeof intake.client === "string"
    && typeof intake.domain === "string"
    && typeof intake.risk === "string"
    && typeof intake.summary === "string"
    && Array.isArray(intake.documents);
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

function buildJournalDraft(handoff: CitizenJournalHandoffContext) {
  const entries = handoff.entries.length
    ? handoff.entries.map((entry) => (
      `<section><h2>${escapeHtml(entry.title)}</h2><p><strong>Incident date:</strong> ${escapeHtml(entry.incidentDate)}${entry.location ? `<br><strong>Location:</strong> ${escapeHtml(entry.location)}` : ""}</p><p>${escapeHtml(entry.details).replace(/\r?\n/g, "<br>")}</p></section>`
    )).join("")
    : "<p>No journal entry details were included in this handoff.</p>";
  const attachments = handoff.attachments.length
    ? `<h2>Shared attachments</h2><ul>${handoff.attachments.map((name) => `<li>${escapeHtml(name)}</li>`).join("")}</ul>`
    : "";

  return `<h1>${escapeHtml(handoff.title)}</h1><p><strong>Source:</strong> Citizen-shared journal handoff<br><strong>Reference:</strong> JOURNAL-${escapeHtml(handoff.messageId.slice(0, 8))}</p><p><em>These are client-reported notes. Verify facts against source documents before relying on them.</em></p><h2>Reported entries</h2>${entries}${attachments}`;
}

function prefillTemplate(markup: string, intake: ImportedIntake | null) {
  if (!intake) return markup;
  const values: Record<string, string> = {
    "Client name": intake.client,
    "Matter or subject": intake.id,
    "Matter type": intake.domain,
    "brief description of matter": intake.summary,
    "Question presented": intake.summary,
  };
  return markup.replace(/\[([^\]]+)\]/g, (placeholder, label: string) =>
    values[label] ?? `[${label} — To be confirmed]`);
}

export default function DocumentAssemblyWorkspace() {
  const [search, setSearch] = useState("");
  const [workspaceStep, setWorkspaceStep] = useState<"templates" | "editor">("templates");
  const [importedIntake, setImportedIntake] = useState<ImportedIntake | null>(null);
  const [workspaceIntakes, setWorkspaceIntakes] = useState<WorkspaceIntake[]>([]);
  const [loadedIntakeId, setLoadedIntakeId] = useState<string | null>(null);
  const [matterPrompt, setMatterPrompt] = useState<{ template: DocumentTemplate | null; recommend: boolean; templates: DocumentTemplate[] } | null>(null);
  const [promptMatterId, setPromptMatterId] = useState("");
  const [isRecommendingTemplate, setIsRecommendingTemplate] = useState(false);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [savedDocuments, setSavedDocuments] = useState<SavedDocument[]>([]);
  const [currentDocumentTitle, setCurrentDocumentTitle] = useState(DOCUMENT_TITLE);
  const [draftHtml, setDraftHtml] = useState(INITIAL_DRAFT);
  const [draftFontFamily, setDraftFontFamily] = useState("Georgia");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
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
  const matterId = importedIntake?.id ?? "No matter selected";

  const selectMatter = (intake: WorkspaceIntake) => {
    if (intake.status !== "accepted") return;

    setImportedIntake({
      intakeId: intake.id,
      id: intake.reference,
      client: intake.client,
      domain: intake.domain,
      risk: intake.risk,
      summary: intake.summary,
      documents: intake.documents,
      result: "accepted",
    });
    setAttachments(intake.documents.map((name, index) => ({
      id: `matter-document-${intake.id}-${index}`,
      name,
      kind: name.split(".").pop()?.slice(0, 4).toUpperCase() || "FILE",
      detail: "Matter record",
    })));
  };

  const promptForMatter = (template: DocumentTemplate | null, recommend = false, templates = BUILT_IN_TEMPLATES) => {
    setMatterPrompt({ template, recommend, templates });
    setPromptMatterId(importedIntake?.intakeId ?? "");
  };

  const chooseMatterForTemplate = async (intake: WorkspaceIntake) => {
    if (intake.status !== "accepted" || !matterPrompt) return;
    selectMatter(intake);
    if (!matterPrompt.recommend) {
      chooseTemplate(matterPrompt.template ?? BUILT_IN_TEMPLATES[0]);
      setMatterPrompt(null);
      return;
    }

    setIsRecommendingTemplate(true);
    try {
      const response = await fetch("/api/documents/recommend-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matter: {
            reference: intake.reference,
            client: intake.client,
            domain: intake.domain,
            summary: intake.summary,
          },
          templates: matterPrompt.templates.map(({ id, name, category, description }) => ({ id, name, category, description })),
        }),
      });
      const data = await response.json() as { templateId?: string; rationale?: string; error?: string };
      if (!response.ok || !data.templateId) throw new Error(data.error || "BatasBot could not recommend a template.");
      const recommended = matterPrompt.templates.find((template) => template.id === data.templateId);
      if (!recommended) throw new Error("BatasBot returned an unavailable template.");
      chooseTemplate(recommended);
      setToast(`${recommended.name} recommended${data.rationale ? `: ${data.rationale}` : "."}`);
      setMatterPrompt(null);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "BatasBot could not recommend a template.");
    } finally {
      setIsRecommendingTemplate(false);
    }
  };

  useEffect(() => {
    const source = new URLSearchParams(window.location.search).get("source");
    if (source !== "accepted-intake" && source !== "journal-handoff") return;

    let acceptedIntake: ImportedIntake | null = null;
    let journalHandoff: CitizenJournalHandoffContext | null = null;
    let storageReadFailed = false;
    try {
      if (source === "accepted-intake") {
        const rawIntake = window.sessionStorage.getItem("batasgo-accepted-intake");
        const parsed: unknown = rawIntake ? JSON.parse(rawIntake) : null;
        if (isImportedIntake(parsed)) acceptedIntake = parsed;
        window.sessionStorage.removeItem("batasgo-accepted-intake");
      } else {
        const rawHandoff = window.sessionStorage.getItem("batasgo-journal-handoff");
        const parsed: unknown = rawHandoff ? JSON.parse(rawHandoff) : null;
        if (isCitizenJournalHandoffContext(parsed)) journalHandoff = parsed;
        window.sessionStorage.removeItem("batasgo-journal-handoff");
      }
    } catch {
      acceptedIntake = null;
      journalHandoff = null;
      storageReadFailed = true;
      setToast(source === "journal-handoff"
        ? "This browser could not read the journal handoff. Return to Messages and try again."
        : "This browser could not read the accepted intake. Return to Case Overview and try again.");
    }

    window.history.replaceState(null, "", window.location.pathname);
    if (source === "journal-handoff" && !journalHandoff) {
      if (!storageReadFailed) setToast("No journal handoff was found to import. Return to Messages and try again.");
      return;
    }
    if (source === "journal-handoff") {
      const handoff = journalHandoff;
      if (!handoff) return;
      const journalSummary = handoff.entries.map((entry) => entry.details).join(" ").slice(0, 1200);
      const reference = `JOURNAL-${handoff.messageId.slice(0, 8)}`;
      setImportedIntake({
        id: reference,
        client: "Citizen journal",
        domain: "Journal handoff",
        risk: "Unassessed",
        summary: journalSummary || "No journal entry details were included.",
        documents: handoff.attachments,
        result: "journal",
      });
      setCurrentDocumentTitle(`Journal review · ${handoff.title}`.slice(0, 120));
      setDraftHtml(buildJournalDraft(handoff));
      setAttachments([]);
      setIsDirty(false);
      setSavedLabel("Draft only");
      setWorkspaceStep("editor");
      setAnnouncement(`${reference} opened in Document Assembly as a draft for review.`);
      return;
    }

    if (!acceptedIntake) {
      setToast("No accepted intake was found to import. Return to Case Overview and try again.");
      return;
    }

    setImportedIntake(acceptedIntake);
    setAttachments(acceptedIntake.documents.map((name, index) => ({
      id: `matter-document-${index}`,
      name,
      kind: name.split(".").pop()?.slice(0, 4).toUpperCase() || "FILE",
      detail: "Matter record",
    })));
    setAnnouncement(`${acceptedIntake.id} imported. Choose a document template to continue.`);
  }, []);

  useEffect(() => {
    void fetch("/api/intakes", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load workspace matters.");
        const data = await response.json() as { intakes?: WorkspaceIntake[] };
        setWorkspaceIntakes((data.intakes ?? []).filter((intake) => intake.status === "accepted"));
      })
      .catch((error: unknown) => setToast(error instanceof Error ? error.message : "Unable to load workspace matters."))
  }, []);

  useEffect(() => {
    const documentToLoad = new URLSearchParams(window.location.search).get("document");
    void fetch("/api/documents")
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load saved documents.");
        const data = await response.json() as { documents?: SavedDocument[] };
        setSavedDocuments(data.documents ?? []);
        if (!documentToLoad) return;
        const detailResponse = await fetch(`/api/documents/${encodeURIComponent(documentToLoad)}`);
        const detail = await detailResponse.json() as { document?: { id: string; intakeId: string | null; title: string; contentHtml: string; fontFamily: string; reviewChecks?: Record<string, boolean> }; error?: string };
        if (!detailResponse.ok || !detail.document) throw new Error(detail.error || "Unable to load saved document.");
        setDocumentId(detail.document.id);
        setLoadedIntakeId(detail.document.intakeId);
        setCurrentDocumentTitle(detail.document.title);
        setDraftHtml(detail.document.contentHtml);
        setDraftFontFamily(detail.document.fontFamily);
        if (detail.document.reviewChecks) setReviewChecks(detail.document.reviewChecks as Record<ReviewCheckId, boolean>);
        setWorkspaceStep("editor");
        window.history.replaceState(null, "", window.location.pathname);
      })
      .catch((error: unknown) => setToast(error instanceof Error ? error.message : "Unable to load saved documents."));
  }, []);

  useEffect(() => {
    if (!loadedIntakeId || importedIntake?.intakeId === loadedIntakeId) return;
    const intake = workspaceIntakes.find((candidate) => candidate.id === loadedIntakeId);
    if (!intake) return;
    setImportedIntake({
      intakeId: intake.id,
      id: intake.reference,
      client: intake.client,
      domain: intake.domain,
      risk: intake.risk,
      summary: intake.summary,
      documents: intake.documents,
      result: "accepted",
    });
    setAttachments(intake.documents.map((name, index) => ({
      id: `matter-document-${intake.id}-${index}`,
      name,
      kind: name.split(".").pop()?.slice(0, 4).toUpperCase() || "FILE",
      detail: "Matter record",
    })));
  }, [importedIntake?.intakeId, loadedIntakeId, workspaceIntakes]);

  useEffect(() => {
    if (reviewOpen) firstReviewCheckRef.current?.focus();
  }, [reviewOpen]);

  useEffect(() => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: chatTypingPhase === "idle" ? "smooth" : "auto", block: "end" });
  }, [chatMessages, isChatGenerating, chatStreamingText, chatTypingPhase]);

  const filteredAttachments = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query || `${matterId} ${DOCUMENT_TITLE}`.toLowerCase().includes(query)) return attachments;
    return attachments.filter((attachment) => `${attachment.name} ${attachment.kind} ${attachment.detail}`.toLowerCase().includes(query));
  }, [attachments, matterId, search]);

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
    void persistDraft();
  };

  const persistDraft = async () => {
    const contentHtml = sanitizeTemplateMarkup(editorRef.current?.innerHTML ?? draftHtml);
    try {
      const response = await fetch(documentId ? `/api/documents/${documentId}` : "/api/documents", {
        method: documentId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(documentId
          ? { title: currentDocumentTitle, contentHtml, fontFamily: draftFontFamily, reviewChecks }
          : {
            intakeId: importedIntake?.intakeId ?? null,
            title: currentDocumentTitle,
            documentType: "legal-draft",
            contentHtml,
            fontFamily: draftFontFamily,
          }),
      });
      const data = await response.json() as { document?: { id: string }; error?: string };
      if (!response.ok || !data.document) throw new Error(data.error || "Unable to save document.");
      setDocumentId(data.document.id);
      setDraftHtml(contentHtml);
      setIsDirty(false);
      setSavedLabel("Saved");
      setToast("Draft saved to your workspace.");
      setAnnouncement("Draft saved to your workspace.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to save draft.");
    }
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
    setToast(`${additions.length} file${additions.length === 1 ? "" : "s"} added to this document.`);
    setAnnouncement(`${additions.length} file${additions.length === 1 ? "" : "s"} added to exhibits.`);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const sendChatMessage = (message: string) => {
    const content = message.trim();
    if (!content || isChatGenerating) return;

    const query = content.toLowerCase();
    const matterLabel = importedIntake ? `${importedIntake.id} for ${importedIntake.client}` : "the current document";
    let response = `I can help organize a review of ${matterLabel}. Verify all facts, calculations, and legal authorities against the source records before relying on this draft.`;
    if (query.includes("summar")) {
      response = importedIntake
        ? `Matter summary: ${importedIntake.summary} Compare this summary with the exhibits and confirm any missing facts before exporting.`
        : "No matter is selected. Choose a workspace matter before asking for a matter summary.";
    } else if (query.includes("claim") || query.includes("calculation") || query.includes("amount")) {
      response = "No claim amount is stored in the matter record. Reconcile each amount against the source documents and use [Amount to be confirmed] until the calculation has been independently verified.";
    } else if (query.includes("draft") || query.includes("review")) {
      response = `Review ${matterLabel} by checking party names, dates, amounts, citations, and privacy-sensitive information against the attached records.`;
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
    const content = sanitizeTemplateMarkup(editorRef.current?.innerHTML ?? draftHtml);
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(currentDocumentTitle)}</title></head><body><article style="max-width:720px;margin:40px auto;font:16px '${escapeHtml(draftFontFamily)}',serif;line-height:1.65;white-space:pre-wrap">${content}</article></body></html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${matterId.toLowerCase()}-document-draft.html`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setReviewOpen(false);
    setSavedLabel("Review copy exported");
    setToast("Review copy exported. Your saved draft remains available in the workspace.");
    setAnnouncement("Review copy exported.");
    reviewTriggerRef.current?.focus();
  };

  const chooseTemplate = (template: DocumentTemplate) => {
    setCurrentDocumentTitle(template.name);
    setDraftHtml(prefillTemplate(template.html, importedIntake));
    setDraftFontFamily(template.analysis?.fontFamily ?? "Georgia");
    setIsDirty(false);
    setSavedLabel("Draft only");
    setReviewChecks({ facts: false, law: false, privacy: false });
    setWorkspaceStep("editor");
  };

  const returnToTemplates = () => {
    if (editorRef.current) setDraftHtml(editorRef.current.innerHTML);
    setWorkspaceStep("templates");
  };

  const allChecksComplete = REVIEW_CHECKS.every(({ id }) => reviewChecks[id]);

  return (
    <WorkspaceShell
      activePage="Document Assembly"
      search={search}
      onSearchChange={setSearch}
      onUnavailable={(label) => setToast(`${label} is not available in this workspace yet.`)}
      searchPlaceholder="Search this matter's documents..."
      searchLabel="Search this matter's documents"
      compactNavigation
    >
      <main className={`document-assembly${workspaceStep === "templates" ? " document-assembly--template-picker" : ""}`}>
        <div className="document-template-stage" hidden={workspaceStep !== "templates"}>
          {savedDocuments.length > 0 && (
            <section className="document-saved-drafts" aria-labelledby="saved-drafts-heading">
              <div>
                <h2 id="saved-drafts-heading">Saved drafts</h2>
                <p>Continue a document saved in your workspace.</p>
              </div>
              <div className="document-saved-drafts-list">
                {savedDocuments.map((document) => (
                  <a key={document.id} href={`/documents?document=${encodeURIComponent(document.id)}`}>
                    <strong>{document.title}</strong>
                    <span>{document.matterReference ?? "Unlinked matter"} · {new Date(document.updatedAt).toLocaleDateString("en-PH")}</span>
                  </a>
                ))}
              </div>
            </section>
          )}
          <DocumentTemplatePicker
            templates={BUILT_IN_TEMPLATES}
            onSelect={(template) => promptForMatter(template)}
            onRecommend={(templates) => promptForMatter(null, true, templates)}
          />
        </div>

        <div className="document-editor-stage" hidden={workspaceStep !== "editor"}>
        <div className="document-contextline">
          <div className="document-breadcrumb" aria-label="Document location">
            <button className="document-template-back" type="button" onClick={returnToTemplates}><ArrowLeft aria-hidden="true" size={10.72} /> Templates</button>
            <span aria-hidden="true">/</span><strong>{matterId}</strong>
          </div>
          <div className="document-context-title">
            <strong>{currentDocumentTitle}</strong>
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
                    <ChevronDown aria-hidden="true" size={9.38} className={summaryExpanded ? "document-chevron--open" : ""} />
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
                  {referenceCollapsed ? <PanelLeftOpen aria-hidden="true" size={10.72} /> : <PanelLeftClose aria-hidden="true" size={10.72} />}
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
                <Bot aria-hidden="true" size={8.71} />
                BatasBot
              </button>
            </div>

            <div className="document-reference-content" id="document-reference-content">
              {referenceMode === "matter" && (
                <div className="matter-reference-panel" id="matter-reference-panel" role="tabpanel" aria-labelledby="matter-reference-tab">
                  {summaryExpanded && (
                <div className="matter-snapshot">
                  <div className="matter-snapshot-top">
                    <span className="matter-domain">{importedIntake?.domain ?? "No matter selected"}</span>
                    <span className="matter-reference-id">{matterId}</span>
                  </div>
                  {importedIntake ? (
                    <>
                      <dl className="matter-parties">
                        <div><dt>Client</dt><dd>{importedIntake.client}</dd></div>
                        <div><dt>Risk tier</dt><dd>{importedIntake.risk}</dd></div>
                      </dl>
                      <p className="document-imported-summary">{importedIntake.summary}</p>
                    </>
                  ) : <p className="document-imported-summary">Choose a matter to view its client details, summary, and source records.</p>}
                </div>
              )}

              {importedIntake && (
                <div className="matter-facts" aria-label="Matter facts">
                  <div><span>Status</span><strong>{workspaceIntakes.find((intake) => intake.id === importedIntake.intakeId)?.status ?? (importedIntake.result === "journal" ? "journal" : "imported")}</strong></div>
                  <div><span>Case stage</span><strong>{workspaceIntakes.find((intake) => intake.id === importedIntake.intakeId)?.caseStage || "Not specified"}</strong></div>
                </div>
              )}

              <section className="exhibits-section" aria-labelledby="exhibits-title">
                <div className="exhibits-heading">
                  <h3 id="exhibits-title">Evidentiary exhibits <span>({filteredAttachments.length})</span></h3>
                  <button type="button" className="document-text-action" onClick={() => fileInputRef.current?.click()}>
                    <Paperclip aria-hidden="true" size={8.71} />
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
                        <button type="button" className="exhibit-preview-button" aria-label={`Preview ${attachment.name}`} onClick={() => setToast(`Preview for ${attachment.name} is not available yet.`)}>
                          <Eye aria-hidden="true" size={10.72} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="exhibit-empty">
                    {importedIntake && attachments.length === 0
                      ? "No source files were included with this intake. Attach original records before drafting."
                      : `No exhibits match “${search}”. Try another search or attach a file.`}
                  </p>
                )}
              </section>

              <p className="document-reference-note">
                {importedIntake
                  ? "Matter details come from your workspace intake. Verify all facts against the source records before use."
                  : "No matter is selected. Choose a workspace matter before drafting or saving a linked document."}
              </p>
                </div>
              )}

              {referenceMode === "chat" && (
                <section className="batasbot-chat" id="batasbot-panel" role="tabpanel" aria-labelledby="batasbot-tab" aria-label="Chat with BatasBot">
                  <div className="batasbot-messages" role="log" aria-live="polite" aria-relevant="additions text" aria-label="BatasBot conversation">
                    {chatMessages.map((message) => (
                      <div className={`batasbot-message batasbot-message--${message.role}`} key={message.id}>
                        {message.role === "assistant" && (
                          <span className="batasbot-avatar" aria-hidden="true"><Bot size={10.05} /></span>
                        )}
                        <p>{message.content}</p>
                      </div>
                    ))}
                    {chatTypingPhase === "thinking" && (
                      <div className="batasbot-message batasbot-message--assistant">
                        <span className="batasbot-avatar" aria-hidden="true"><Bot size={10.05} /></span>
                        <div className="batasbot-typing" role="status" aria-label="BatasBot is generating a reply">
                          <span aria-hidden="true"><i /><i /><i /></span>
                          <span className="sr-only">BatasBot is typing</span>
                        </div>
                      </div>
                    )}
                    {chatTypingPhase === "typing" && (
                      <div className="batasbot-message batasbot-message--assistant">
                        <span className="batasbot-avatar" aria-hidden="true"><Bot size={10.05} /></span>
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
                      <Send aria-hidden="true" size={10.05} />
                    </button>
                  </form>
                  <p className="batasbot-disclaimer">BatasBot review guidance · Verify facts and legal authorities independently.</p>
                </section>
              )}
            </div>
          </aside>

          <section className={`document-editor${mobilePane === "draft" ? " document-editor--mobile-active" : ""}`} aria-label="Draft document editor">
            <header className="document-editor-heading">
              <div className="document-file-icon"><FileText aria-hidden="true" size={11.39} /></div>
              <div className="document-name">
                <h2>{currentDocumentTitle}</h2>
                <span>{matterId}</span>
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
                    <button type="button" className="editor-tool-button" title="Undo" aria-label="Undo" onMouseDown={(event) => event.preventDefault()} onClick={() => runEditorCommand("undo")}><Undo2 size={10.05} /></button>
                    <button type="button" className="editor-tool-button" title="Redo" aria-label="Redo" onMouseDown={(event) => event.preventDefault()} onClick={() => runEditorCommand("redo")}><Redo2 size={10.05} /></button>
                  </div>
                  <span className="editor-tool-divider" />
                  <label className="editor-select-wrap">
                    <span className="sr-only">Font family</span>
                    <select defaultValue="Georgia" onChange={(event) => runEditorCommand("fontName", event.target.value)}>
                      <option value="Georgia">Georgia</option>
                      <option value="Arial">Arial</option>
                      <option value="Times New Roman">Times New Roman</option>
                    </select>
                    <ChevronDown size={8.71} aria-hidden="true" />
                  </label>
                  <label className="editor-select-wrap editor-font-size">
                    <span className="sr-only">Font size</span>
                    <select defaultValue="3" onChange={(event) => runEditorCommand("fontSize", event.target.value)}>
                      <option value="2">10 pt</option><option value="3">12 pt</option><option value="4">14 pt</option><option value="5">18 pt</option>
                    </select>
                    <ChevronDown size={8.71} aria-hidden="true" />
                  </label>
                  <span className="editor-tool-divider" />
                  <div className="editor-tool-group">
                    <button type="button" className="editor-tool-button" title="Bold" aria-label="Bold" onMouseDown={(event) => event.preventDefault()} onClick={() => runEditorCommand("bold")}><Bold size={10.05} /></button>
                    <button type="button" className="editor-tool-button" title="Italic" aria-label="Italic" onMouseDown={(event) => event.preventDefault()} onClick={() => runEditorCommand("italic")}><Italic size={10.05} /></button>
                    <button type="button" className="editor-tool-button" title="Underline" aria-label="Underline" onMouseDown={(event) => event.preventDefault()} onClick={() => runEditorCommand("underline")}><Underline size={10.05} /></button>
                  </div>
                  <span className="editor-tool-divider" />
                  <div className="editor-tool-group">
                    <button type="button" className="editor-tool-button" title="Align left" aria-label="Align left" onMouseDown={(event) => event.preventDefault()} onClick={() => runEditorCommand("justifyLeft")}><AlignLeft size={10.05} /></button>
                    <button type="button" className="editor-tool-button" title="Align center" aria-label="Align center" onMouseDown={(event) => event.preventDefault()} onClick={() => runEditorCommand("justifyCenter")}><AlignCenter size={10.05} /></button>
                    <button type="button" className="editor-tool-button" title="Align right" aria-label="Align right" onMouseDown={(event) => event.preventDefault()} onClick={() => runEditorCommand("justifyRight")}><AlignRight size={10.05} /></button>
                  </div>
                </>
              )}
              {activeTab === "File" && (
                <button type="button" className="editor-tool-button editor-tool-labeled" onClick={saveDraft}><Save size={10.05} /> Save draft</button>
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
                  <ChevronDown size={8.71} aria-hidden="true" />
                </label>
              )}
              {activeTab === "Review Changes" && (
                <button type="button" className="editor-tool-button editor-tool-labeled" onClick={() => setReviewOpen(true)}>
                  <Check size={10.05} /> Review &amp; export draft
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
                style={{ fontFamily: draftFontFamily }}
                contentEditable
                suppressContentEditableWarning
                role="textbox"
                aria-label="Editable document draft"
                aria-multiline="true"
                spellCheck
                onInput={(event) => {
                  markDirty();
                }}
                dangerouslySetInnerHTML={{ __html: draftHtml }}
              />
            </div>
            <footer className="document-editor-footer">
              <span><span className="document-footer-dot" /> Workspace draft · Changes are saved when you choose Save draft</span>
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
                }}><X size={12.06} /></button>
              </header>
              <div className="document-review-context">
                <span>{currentDocumentTitle}</span><span>Matter: <strong>{matterId}</strong></span>
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
                  <Download aria-hidden="true" size={10.05} />
                  Export review copy
                </button>
              </footer>
            </section>
          </div>
        )}
        </div>

        {matterPrompt && (
          <div className="document-matter-modal-scrim" onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isRecommendingTemplate) setMatterPrompt(null);
          }}>
            <section className="document-matter-modal" role="dialog" aria-modal="true" aria-labelledby="document-matter-modal-title">
              <header>
                <div>
                  <h2 id="document-matter-modal-title">{matterPrompt.recommend ? "Choose a matter for BatasBot" : "Choose a matter for this template"}</h2>
                  <p>{matterPrompt.recommend
                    ? "BatasBot will compare the accepted matter with your available templates and recommend the best fit."
                    : `Select an accepted matter to use with “${matterPrompt.template?.name ?? "this template"}”.`}</p>
                </div>
                <button type="button" className="document-icon-button" aria-label="Close matter selection" disabled={isRecommendingTemplate} onClick={() => setMatterPrompt(null)}>
                  <X size={12.06} />
                </button>
              </header>
              <div className="document-matter-modal-list">
                {workspaceIntakes.length ? (
                  <>
                    <label className="document-matter-modal-select-label" htmlFor="document-matter-modal-select">Accepted matter</label>
                    <select
                      id="document-matter-modal-select"
                      className="document-matter-modal-select"
                      value={promptMatterId}
                      onChange={(event) => setPromptMatterId(event.target.value)}
                      disabled={isRecommendingTemplate}
                    >
                      <option value="">Select an accepted matter</option>
                      {workspaceIntakes.map((intake) => (
                        <option key={intake.id} value={intake.id}>
                          {intake.reference} · {intake.client} · {intake.domain}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="document-matter-modal-submit"
                      onClick={() => {
                        const selected = workspaceIntakes.find((intake) => intake.id === promptMatterId);
                        if (selected) void chooseMatterForTemplate(selected);
                      }}
                      disabled={!promptMatterId || isRecommendingTemplate}
                    >
                      {matterPrompt.recommend ? "Recommend template" : "Use matter"} <Sparkles aria-hidden="true" size={10.05} />
                    </button>
                  </>
                ) : (
                  <p className="document-matter-modal-empty">No accepted matters are available. Accept a matter in Case Overview before assembling a document.</p>
                )}
              </div>
              {isRecommendingTemplate && <p className="document-matter-modal-status" role="status">BatasBot is reviewing the matter and templates...</p>}
            </section>
          </div>
        )}

        {toast && (
          <div className="document-toast" role="status">
            <Check aria-hidden="true" size={10.05} />
            <span>{toast}</span>
            <button type="button" aria-label="Dismiss notification" onClick={() => setToast("")}><X size={10.05} /></button>
          </div>
        )}
      </main>
    </WorkspaceShell>
  );
}
