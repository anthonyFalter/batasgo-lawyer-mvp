"use client";

import {
  ArrowRight,
  Bot,
  Check,
  CloudUpload,
  FileText,
  Search,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { type DragEvent, useEffect, useMemo, useRef, useState } from "react";

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
  onRecommend?: (templates: DocumentTemplate[]) => void;
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

async function convertDocxToHtml(arrayBuffer: ArrayBuffer) {
  const JSZip = (await import("jszip")).default;
  const archive = await JSZip.loadAsync(arrayBuffer);
  const documentFile = archive.file("word/document.xml");
  if (!documentFile) throw new Error("This DOCX file does not contain a readable document body.");

  const namespace = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const parser = new DOMParser();
  const documentXml = parser.parseFromString(await documentFile.async("string"), "application/xml");
  if (documentXml.querySelector("parsererror")) throw new Error("This DOCX file has invalid document markup.");

  const wordChildren = (element: Element) => Array.from(element.children).filter((child) => child.namespaceURI === namespace);
  const wordChild = (element: Element | null | undefined, name: string) => element ? wordChildren(element).find((child) => child.localName === name) : undefined;
  const wordValue = (element: Element | undefined) => element?.getAttributeNS(namespace, "val") ?? "";

  const convertRun = (run: Element) => {
    const properties = wordChild(run, "rPr");
    let text = wordChildren(run).map((child) => {
      if (child.localName === "t" || child.localName === "delText") return escapeHtml(child.textContent ?? "");
      if (child.localName === "tab") return "&emsp;";
      if (child.localName === "br" || child.localName === "cr") return "<br>";
      return "";
    }).join("");
    if (!text) return "";

    const isBold = Boolean(wordChild(properties, "b"));
    const isItalic = Boolean(wordChild(properties, "i"));
    if (isBold && isItalic) text = `<strong><em>${text}</em></strong>`;
    else if (isBold) text = `<strong>${text}</strong>`;
    else if (isItalic) text = `<em>${text}</em>`;
    if (wordChild(properties, "u")) text = `<u>${text}</u>`;

    const styles: string[] = [];
    const fonts = wordChild(properties, "rFonts");
    const runFont = fonts?.getAttributeNS(namespace, "ascii") ?? fonts?.getAttributeNS(namespace, "hAnsi");
    if (runFont && FONT_OPTIONS.some((font) => font.toLowerCase() === runFont.toLowerCase())) styles.push(`font-family: '${escapeHtml(runFont)}'`);
    const fontSize = wordValue(wordChild(properties, "sz"));
    if (fontSize && Number(fontSize) > 0 && Number(fontSize) <= 72) styles.push(`font-size: ${Number(fontSize) / 2}pt`);
    const color = wordValue(wordChild(properties, "color"));
    if (/^[\da-f]{6}$/i.test(color)) styles.push(`color: #${color}`);

    return styles.length ? `<span style="${styles.join("; ")}">${text}</span>` : text;
  };

  const convertParagraph = (paragraph: Element) => {
    const properties = wordChild(paragraph, "pPr");
    const styleId = wordValue(wordChild(properties, "pStyle")).toLowerCase();
    const headingMatch = styleId.match(/(?:heading|title)(\d?)/);
    const headingLevel = headingMatch ? Math.min(Number(headingMatch[1] || 1), 4) : 0;
    const tag = headingLevel ? `h${headingLevel}` : "p";
    const alignmentValue = wordValue(wordChild(properties, "jc"));
    const alignment = alignmentValue === "both" ? "justify" : alignmentValue;
    const text = wordChildren(paragraph).map((child) => {
      if (child.localName === "r") return convertRun(child);
      if (child.localName === "hyperlink") return wordChildren(child).map(convertRun).join("");
      return "";
    }).join("");
    if (!text.trim()) return "";
    const alignStyle = ["center", "right", "justify"].includes(alignment) ? ` style="text-align: ${alignment}"` : "";
    return `<${tag}${alignStyle}>${text}</${tag}>`;
  };

  const convertTable = (table: Element) => {
    const rows = wordChildren(table).filter((child) => child.localName === "tr").map((row) => {
      const cells = wordChildren(row).filter((child) => child.localName === "tc").map((cell) => {
        const content = wordChildren(cell).filter((child) => child.localName === "p").map(convertParagraph).join("");
        return `<td>${content || "<p><br></p>"}</td>`;
      }).join("");
      return `<tr>${cells}</tr>`;
    }).join("");
    return rows ? `<table><tbody>${rows}</tbody></table>` : "";
  };

  const body = documentXml.getElementsByTagNameNS(namespace, "body")[0];
  if (!body) throw new Error("This DOCX file does not contain a readable document body.");
  const content = wordChildren(body).map((child) => {
    if (child.localName === "p") return convertParagraph(child);
    if (child.localName === "tbl") return convertTable(child);
    return "";
  }).join("");
  const stylesFile = archive.file("word/styles.xml");
  const stylesXml = stylesFile ? parser.parseFromString(await stylesFile.async("string"), "application/xml") : null;
  const defaultRunProperties = stylesXml?.getElementsByTagNameNS(namespace, "rPr")[0];
  const defaultFonts = wordChild(defaultRunProperties, "rFonts");
  const rawFont = defaultFonts?.getAttributeNS(namespace, "ascii") ?? defaultFonts?.getAttributeNS(namespace, "hAnsi") ?? "";
  const documentFont = FONT_OPTIONS.find((font) => font.toLowerCase() === rawFont.toLowerCase()) ?? "Georgia";
  return `<div style="font-family: '${documentFont}'">${content}</div>`;
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

export default function DocumentTemplatePicker({ templates, onSelect, onRecommend }: DocumentTemplatePickerProps) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All templates");
  const [uploadedTemplates, setUploadedTemplates] = useState<DocumentTemplate[]>([]);
  const [analysisPreview, setAnalysisPreview] = useState<DocumentTemplate | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isUploadPromptOpen, setIsUploadPromptOpen] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);
  const uploadToggleRef = useRef<HTMLButtonElement>(null);
  const browseButtonRef = useRef<HTMLButtonElement>(null);
  const uploadDialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isUploadPromptOpen) return;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    browseButtonRef.current?.focus();
    const handleDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsUploadPromptOpen(false);
        return;
      }
      if (event.key !== "Tab" || !uploadDialogRef.current) return;

      const focusable = Array.from(uploadDialogRef.current.querySelectorAll<HTMLElement>("button:not(:disabled)"));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener("keydown", handleDialogKeyDown);
    return () => {
      document.removeEventListener("keydown", handleDialogKeyDown);
      previousFocus?.focus();
    };
  }, [isUploadPromptOpen]);

  const visibleTemplates = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...uploadedTemplates, ...templates].filter((template) => {
      const matchesCategory = category === "All templates"
        || (category === "My templates" ? template.source === "uploaded" : template.category === category);
      const matchesSearch = !query || `${template.name} ${template.description} ${template.category}`.toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [category, search, templates, uploadedTemplates]);
  const allTemplates = useMemo(() => [...uploadedTemplates, ...templates], [templates, uploadedTemplates]);

  const handleUpload = async (file?: File) => {
    if (!file) return;
    setUploadError("");
    setIsAnalyzing(true);

    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("Templates must be smaller than 10 MB.");
      const extension = file.name.split(".").pop()?.toLowerCase();
      let sourceMarkup = "";

      if (extension === "docx") {
        sourceMarkup = await convertDocxToHtml(await file.arrayBuffer());
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
      setIsUploadPromptOpen(false);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "This template could not be read.");
    } finally {
      setIsAnalyzing(false);
      if (uploadRef.current) uploadRef.current.value = "";
    }
  };

  const handleTemplateDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingFile(false);
    void handleUpload(event.dataTransfer.files[0]);
  };

  return (
    <section className="document-template-picker" aria-labelledby="template-picker-title">
      <header className="template-picker-header">
        <div>
          <h1 id="template-picker-title">Start a document</h1>
        </div>
        <div className="template-upload-actions">
          {onRecommend && (
            <button type="button" className="template-recommend-button" onClick={() => onRecommend(allTemplates)}>
              <Sparkles aria-hidden="true" size={12.06} />
              Let BatasBot choose
            </button>
          )}
          <input
            ref={uploadRef}
            className="template-upload-input"
            type="file"
            accept=".docx,.html,.htm,.txt"
            aria-label="Upload a document template"
            onChange={(event) => void handleUpload(event.target.files?.[0])}
          />
          <button
            className="template-upload-button"
            ref={uploadToggleRef}
            type="button"
            aria-expanded={isUploadPromptOpen}
            aria-controls="template-upload-prompt"
            disabled={isAnalyzing}
            onClick={() => {
              setUploadError("");
              setIsUploadPromptOpen((open) => !open);
            }}
          >
            <Upload aria-hidden="true" size={12.06} />
            {isAnalyzing ? "Reading template..." : isUploadPromptOpen ? "Close upload" : "Upload a template"}
          </button>
        </div>
      </header>

      {isUploadPromptOpen && (
        <div
          className="template-upload-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsUploadPromptOpen(false);
          }}
        >
          <section
            ref={uploadDialogRef}
            className="template-upload-dialog"
            id="template-upload-prompt"
            role="dialog"
            aria-modal="true"
            aria-labelledby="template-upload-prompt-title"
            aria-describedby="template-upload-prompt-description"
          >
            <header className="template-upload-dialog-header">
              <h2 id="template-upload-prompt-title">Upload your file template and let BatasBot handle the rest.</h2>
              <button type="button" className="template-upload-close" aria-label="Close upload dialog" onClick={() => setIsUploadPromptOpen(false)}>
                <X aria-hidden="true" size={13.4} />
              </button>
            </header>
            <p className="template-upload-dialog-description" id="template-upload-prompt-description">
              BatasBot scans the document structure and formatting in this browser. Your file is not sent to a service.
            </p>
            <div
              className={`template-upload-dropzone${isDraggingFile ? " is-dragging" : ""}`}
              onDragEnter={(event) => { event.preventDefault(); setIsDraggingFile(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDraggingFile(false);
              }}
              onDrop={handleTemplateDrop}
            >
              <span className="template-upload-dropzone-icon"><CloudUpload aria-hidden="true" size={22.78} /></span>
              <strong>{isAnalyzing ? "Reading your template..." : "Drop your template file here"}</strong>
              <span>DOCX, HTML, or TXT · Up to 10 MB</span>
              <button ref={browseButtonRef} className="template-upload-browse" type="button" onClick={() => uploadRef.current?.click()} disabled={isAnalyzing}>
                <Upload aria-hidden="true" size={11.39} />
                Browse files
              </button>
            </div>
            {uploadError && <p className="template-upload-error" role="alert">{uploadError}</p>}
          </section>
        </div>
      )}

      {analysisPreview?.analysis && (
        <section className="template-analysis" aria-labelledby="template-analysis-title">
          <div className="template-analysis-icon"><Sparkles aria-hidden="true" size={12.73} /></div>
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
              Use analyzed template <ArrowRight aria-hidden="true" size={10.72} />
            </button>
            <button type="button" className="template-analysis-dismiss" aria-label="Dismiss format scan" onClick={() => setAnalysisPreview(null)}>
              <X aria-hidden="true" size={12.06} />
            </button>
          </div>
        </section>
      )}

      <label className="template-search">
        <Search aria-hidden="true" size={12.73} />
        <span className="sr-only">Search templates</span>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search templates" />
      </label>

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
                  <span className="document-template-preview-section" />
                  <span className="document-template-line document-template-line--wide" />
                  <span className="document-template-line" />
                  <span className="document-template-line document-template-line--short" />
                </div>
              </div>
              <div className="document-template-card-body">
                <div className="document-template-card-heading">
                  <h3>{template.name}</h3>
                  {template.source === "uploaded" && <span className="document-template-own-label"><Check aria-hidden="true" size={8.71} /> Yours</span>}
                </div>
                <p>{template.description}</p>
                <div className="document-template-card-footer">
                  <span>{template.category}</span>
                  <button type="button" onClick={() => onSelect(template)}>
                    Use template <ArrowRight aria-hidden="true" size={10.05} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="template-library-empty">
          <FileText aria-hidden="true" size={16.08} />
          <h3>{category === "My templates" ? "No personal templates yet" : "No matching templates"}</h3>
          <p>{category === "My templates" ? "Upload a DOCX, HTML, or TXT file to scan its structure and formatting." : "Try a different search or category."}</p>
          {category === "My templates" && (
            <button type="button" onClick={() => uploadRef.current?.click()}>
              Upload a template <Upload aria-hidden="true" size={10.72} />
            </button>
          )}
        </div>
      )}

      <p className="template-library-footnote">Personal uploads stay in this browser session. Review imported layouts and verify all legal content before use.</p>
    </section>
  );
}