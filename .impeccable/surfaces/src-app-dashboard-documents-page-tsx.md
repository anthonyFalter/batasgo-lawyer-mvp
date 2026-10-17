---
version: 1
slug: "src-app-dashboard-documents-page-tsx"
primary_target: "src/app/(dashboard)/documents/page.tsx"
related_targets:
  - "src/features/workspace/workspace-shell.tsx"
---

# Document Assembly

## Scope and mode

Lawyer document assembly workspace at `/documents`. Operate.

## Audience and job

A practicing lawyer assembles a review draft using matter details, supporting exhibits, and calculated claim values.

## Content and constraints

Use clearly labeled sample matter data and local-only interactions. The editor, computed-sum insertion, file selection, review checklist, save state, HTML export, and BatasBot preview chat operate in the browser only. BatasBot uses delayed sample replies with a typing indicator and is not connected to client data or legal sources. No connected client data, legal verification, signature, filing, backend, or persistence.

## Direction contract

THESIS: Keep matter facts and evidence beside the working legal draft so practitioners can cross-check source information without leaving the assembly screen.

OWN-WORLD: Extend BatasGO's pale blue-gray canvas, white outlined panels, compact Inter controls, blue actions, and 10px panel corners. The draft itself uses restrained formal document typography.

STORY: Review matter context and exhibits or switch the reference pane to BatasBot for a sample chat, insert the computed total, edit the draft, verify facts and privacy, and export a local review copy.

FIRST VIEWPORT: A compact page heading and matter breadcrumb lead into a split assembly workspace. The reference pane switches between matter facts, claim computation, exhibits, and the client statement, or a BatasBot chat with suggested prompts and a message composer; the larger editor pane holds the draft title, ribbon controls, and a centered paper document.

FORM: Two-pane legal document editor based on `.context/reference-images/documentsystem.png` and `.context/reference-images/documentsystem_collapsed_sidebar.png`, with verification behavior informed by `.context/reference-images/e_stamp_document.png`.

SIGNATURE INTERACTION: Insert the computed sum into the draft, edit the document inline, then complete an explicit fact, law, and privacy checklist before exporting a review copy.

HONEST RISK: All information is synthetic. Export is a review copy only; users must independently verify facts and law. Nothing is signed, filed, uploaded, or saved to a service.
