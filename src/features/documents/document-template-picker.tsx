"use client";

import {
  ArrowRight,
  Bot,
  Check,
  FileText,
  Search,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

export type TemplateAnalysis = {
  documentType: string;
  style: string;
  fontFamily: string;
  accentColor: string;
  signals: string[];
  summary: string;
};

export type DocumentTemplate = {
  id: string;
  name: string;
  category: string;
  description: string;
  html: string;
  previewTheme: string;
  source: "library" | "uploaded";
  analysis?: TemplateAnalysis;
};

type DocumentTemplatePickerProps = {
  templates: DocumentTemplate[];
  onSelect: (template: DocumentTemplate) => void;
};

const CATEGORIES = ["All templates", "Pleadings", "Correspondence", "Research", "Client notes", "My templates"];
const ALLOWED_TAGS = new Set([
  "P", "H1", "H2", "H3", "H4", "H5", "H6", "STRONG", "B", "EM", "I", "U", "BR", "HR",
  "UL", "OL", "LI", "BLOCKQUOTE", "TABLE", "THEAD", "TBODY", "TR", "TD", "TH", "DIV", "SPAN",
]);
const ALLOWED_STYLES = new Set([
  "font-family", "font-size", "font-weight", "font-style", "text-align", "text-decoration", "color",
  "background-color", "margin-top", "margin-bottom", "text-indent",
]);
const FONT_OPTIONS = ["Georgia", "Times New Roman", "Cambria", "Arial", "Calibri", "Aptos", "Verdana"];

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function safeFontFamily(source: string) {
  return FONT_OPTIONS.find((font) => source.toLowerCase().includes(font.toLowerCase())) ?? "Georgia";
}

function safeAccentColor(source: string) {
  const match = source.match(/#[0-9a-f]{3}(?:[0-9a-f]{3})?\b/i);
  return match?.[0] ?? "#3569df";
}

export function sanitizeTemplateMarkup(markup: string) {
  const parsed = new DOMParser().parseFromString(markup, "text/html");
  parsed.body.querySelectorAll("script, style, iframe, object, embed, form, input, button, link, meta").forEach((node) => node.remove());

  for (const element of Array.from(parsed.body.querySelectorAll("*"))) {
    if (!ALLOWED_TAGS.has(element.tagName)) {
      const fallback = element.tagName === "IMG" ? element.getAttribute("alt") ?? "" : "";
      element.replaceWith(document.createTextNode(fallback), ...Array.from(element.childNodes));
      continue;
    }

    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name !== "style" && !["align", "colspan", "rowspan"].includes(attribute.name)) {
        element.removeAttribute(attribute.name);
      }
    }

    const style = (element as HTMLElement).style;
    for (const property of Array.from(style)) {
      const value = style.getPropertyValue(property).trim();
      if (!ALLOWED_STYLES.has(property) || /url\s*\(|expression\s*\(/i.test(value)) {
        style.removeProperty(property);
      }
      if (property === "font-size" && parseFloat(value) > 36) style.removeProperty(property);
    }
  }

  return parsed.body.innerHTML;
}

function analyzeTemplate(markup: string, fileName: string) {
  const parsed = new DOMParser().parseFromString(markup, "text/html");
  const text = parsed.body.textContent?.replace(/\s+/g, " ").trim() ?? "";
  const styleText = Array.from(parsed.querySelectorAll("style"), (style) => style.textContent ?? "").join(" ");
  const styleSource = `${markup} ${styleText}`;
  const fileLabel = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  const lowerContent = `${fileLabel} ${text}`.toLowerCase();
  const headingCount = parsed.body.querySelectorAll("h1, h2, h3, h4, h5, h6").length;
  const numberedSections = (text.match(/(?:^|\s)(?:\d{1,2}\.|[IVX]{1,6}\.)\s/g) ?? []).length;
  const listCount = parsed.body.querySelectorAll("ol, ul").length;
  const hasSignature = /respectfully submitted|sincerely|signature|attorney|counsel for/i.test(text);
  const isPleading = /position paper|pleading|court|versus|\bv\.|petition|motion/.test(lowerContent);
  const isLetter = /demand letter|dear |sincerely|regards|notice to/.test(lowerContent);
  const isMemo = /memorandum|legal memo/.test(lowerContent);
  const isClientNote = /consultation|intake|client notes|meeting notes/.test(lowerContent);
  const documentType = isPleading
    ? "Court filing"
    : isLetter
      ? "Legal correspondence"
      : isMemo
        ? "Legal memorandum"
        : isClientNote
          ? "Client notes"
          : "General document";
  const fontFamily = safeFontFamily(styleSource);
  const accentColor = safeAccentColor(styleSource);
  const style = isPleading || isMemo ? "Formal legal" : isLetter ? "Formal correspondence" : "Structured office document";
  const signals = [
    headingCount ? `${headingCount} section heading${headingCount === 1 ? "" : "s"}` : "No heading styles found",
    numberedSections ? `${numberedSections} numbered clauses` : listCount ? `${listCount} list structure${listCount === 1 ? "" : "s"}` : "Paragraph-based structure",
    hasSignature ? "Signature block cues" : "No signature block detected",
    `${fontFamily} body style`,
  ];

  return {
    documentType,
    style,
    fontFamily,
    accentColor,
    signals,
    summary: `BatasBot found a ${style.toLowerCase()} with ${headingCount ? `${headingCount} section headings` : "a paragraph-led layout"}${numberedSections ? ` and ${numberedSections} numbered clauses` : ""}${hasSignature ? ", plus a signature block" : ""}. Review the imported formatting before using it.`,
  } satisfies TemplateAnalysis;
}

function displayName(fileName: string) {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function DocumentTemplatePicker({ templates, onSelect }: DocumentTemplatePickerProps) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All templates");
  const [uploadedTemplates, setUploadedTemplates] = useState<DocumentTemplate[]>([]);
  const [analysisPreview, setAnalysisPreview] = useState<DocumentTemplate | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);

  const visibleTemplates = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...uploadedTemplates, ...templates].filter((template) => {
      const matchesCategory = category === "All templates"
        || (category === "My templates" ? template.source === "uploaded" : template.category === category);
      const matchesSearch = !query || `${template.name} ${template.description} ${template.category}`.toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [category, search, templates, uploadedTemplates]);

  const handleUpload = async (file?: File) => {
    if (!file) return;
    setUploadError("");
    setIsAnalyzing(true);

    try {
      const extension = file.name.split(".").pop()?.toLowerCase();
      let sourceMarkup = "";

      if (extension === "docx") {
        const mammoth = (await import("mammoth")).default;
        const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
        sourceMarkup = result.value;
      } else if (extension === "html" || extension === "htm") {
        sourceMarkup = await file.text();
      } else if (extension === "txt") {
        sourceMarkup = (await file.text())
          .split(/\n\s*\n/)
          .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
          .join("");
      } else {
        throw new Error("Choose a DOCX, HTML, or TXT template.");
      }

      const analysis = analyzeTemplate(sourceMarkup, file.name);
      const html = sanitizeTemplateMarkup(sourceMarkup);
      if (!new DOMParser().parseFromString(html, "text/html").body.textContent?.trim()) {
        throw new Error("This file has no readable text to use as a template.");
      }

      const uploadedTemplate: DocumentTemplate = {
        id: `uploaded-${Date.now()}`,
        name: displayName(file.name),
        category: "My templates",
        description: analysis.summary,
        html,
        previewTheme: "custom",
        source: "uploaded",
        analysis,
      };
      setUploadedTemplates((current) => [uploadedTemplate, ...current]);
      setAnalysisPreview(uploadedTemplate);
      setCategory("My templates");
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "This template could not be read.");
    } finally {
      setIsAnalyzing(false);
      if (uploadRef.current) uploadRef.current.value = "";
    }
  };

  return (
    <section className="document-template-picker" aria-labelledby="template-picker-title">
      <header className="template-picker-header">
        <div>
          <h1 id="template-picker-title">Start a document</h1>
          <p>Choose a legal format, or bring a template you already trust.</p>
        </div>
        <div className="template-upload-actions">
          <input
            ref={uploadRef}
            className="template-upload-input"
            type="file"
            accept=".docx,.html,.htm,.txt"
            aria-label="Upload a document template"
            onChange={(event) => void handleUpload(event.target.files?.[0])}
          />
          <button className="template-upload-button" type="button" onClick={() => uploadRef.current?.click()} disabled={isAnalyzing}>
            <Upload aria-hidden="true" size={18} />
            {isAnalyzing ? "Reading template..." : "Upload a template"}
          </button>
        </div>
      </header>

      <div className="template-local-note">
        <Bot aria-hidden="true" size={19} />
        <p><strong>BatasBot can map the format.</strong> Uploaded files are analyzed in this browser only. It identifies structure and style cues; it does not verify legal content or connect to an AI service.</p>
      </div>

      {uploadError && <p className="template-upload-error" role="alert">{uploadError}</p>}

      {analysisPreview?.analysis && (
        <section className="template-analysis" aria-labelledby="template-analysis-title">
          <div className="template-analysis-icon"><Sparkles aria-hidden="true" size={19} /></div>
          <div className="template-analysis-copy">
            <div className="template-analysis-heading">
              <h2 id="template-analysis-title">BatasBot format scan</h2>
              <span>Local preview</span>
            </div>
            <strong>{analysisPreview.analysis.documentType} · {analysisPreview.analysis.style}</strong>
            <p>{analysisPreview.analysis.summary}</p>
            <div className="template-analysis-signals">
              {analysisPreview.analysis.signals.map((signal) => <span key={signal}>{signal}</span>)}
              <span className="template-analysis-font"><i style={{ backgroundColor: analysisPreview.analysis.accentColor }} />{analysisPreview.analysis.fontFamily}</span>
            </div>
          </div>
          <div className="template-analysis-actions">
            <button type="button" className="template-analysis-use" onClick={() => onSelect(analysisPreview)}>
              Use analyzed template <ArrowRight aria-hidden="true" size={16} />
            </button>
            <button type="button" className="template-analysis-dismiss" aria-label="Dismiss format scan" onClick={() => setAnalysisPreview(null)}>
              <X aria-hidden="true" size={18} />
            </button>
          </div>
        </section>
      )}

      <div className="template-library-controls">
        <div className="template-categories" role="group" aria-label="Filter document templates">
          {CATEGORIES.map((item) => (
            <button
              type="button"
              className={category === item ? "is-active" : ""}
              aria-pressed={category === item}
              key={item}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <label className="template-search">
          <Search aria-hidden="true" size={18} />
          <span className="sr-only">Search templates</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search templates" />
        </label>
      </div>

      <div className="template-library-heading">
        <h2>{category === "My templates" ? "My templates" : category === "All templates" ? "Templates for legal work" : category}</h2>
        <span>{visibleTemplates.length} available</span>
      </div>

      {visibleTemplates.length ? (
        <div className="document-template-grid">
          {visibleTemplates.map((template) => (
            <article className="document-template-card" key={template.id}>
              <div className={`document-template-preview document-template-preview--${template.previewTheme}`} aria-hidden="true">
                <div className="document-template-paper">
                  <span className="document-template-mark" />
                  <span className="document-template-preview-title">{template.name}</span>
                  <span className="document-template-rule" />
                  <span className="document-template-line document-template-line--wide" />
                  <span className="document-template-line" />
                  <span className="document-template-line document-template-line--short" />
                  <span className="document-template-preview-section" />
                  <span className="document-template-line document-template-line--wide" />
                  <span className="document-template-line" />
                  <span className="document-template-line document-template-line--short" />
                </div>
              </div>
              <div className="document-template-card-body">
                <div className="document-template-card-heading">
                  <h3>{template.name}</h3>
                  {template.source === "uploaded" && <span className="document-template-own-label"><Check aria-hidden="true" size={13} /> Yours</span>}
                </div>
                <p>{template.description}</p>
                <div className="document-template-card-footer">
                  <span>{template.category}</span>
                  <button type="button" onClick={() => onSelect(template)}>
                    Use template <ArrowRight aria-hidden="true" size={15} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="template-library-empty">
          <FileText aria-hidden="true" size={24} />
          <h3>{category === "My templates" ? "No personal templates yet" : "No matching templates"}</h3>
          <p>{category === "My templates" ? "Upload a DOCX, HTML, or TXT file to scan its structure and formatting." : "Try a different search or category."}</p>
          {category === "My templates" && (
            <button type="button" onClick={() => uploadRef.current?.click()}>
              Upload a template <Upload aria-hidden="true" size={16} />
            </button>
          )}
        </div>
      )}

      <p className="template-library-footnote">Personal uploads stay in this browser session. Review imported layouts and verify all legal content before use.</p>
    </section>
  );
}