# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Practicing lawyers and legal practitioners reviewing prospective client matters.

## Product Purpose

BatasGO's lawyer tool helps legal practitioners handle client inquiries and related casework. The first workflow being built is an intake triage queue where a lawyer reviews requests, prioritizes risk, and decides whether to accept or decline a matter.

## Positioning

A lawyer-facing casework tool focused on making client intake and matter handling more manageable for practitioners.

## Operating Context

Lawyers review intake information and case materials, communicate with clients, and coordinate consultations and follow-up work. The MVP focus is the lawyer's tool application.

## Capabilities and Constraints

- Case Overview intakes and accept/decline decisions are persisted in Neon and scoped to the authenticated user's workspace. Development workspaces are seeded with synthetic sample intakes. Creating an intake stores its selected document names only; document contents are not uploaded.
- The Case Overview supports local search, domain and risk filtering, and sorting over workspace-scoped persistent intakes. Gemini summaries are generated server-side only for database records marked as synthetic samples; user-created intakes are never sent to Gemini. Decisions can be undone by restoring an intake to pending status.
- BatasBot provides local sample chat replies and navigation links to workspace screens; it is not connected to live matter data. Document Assembly provides a local editable draft, matter reference, exhibit attachment preview, computed-sum insertion, review checklist, HTML review-copy export, and an embedded BatasBot preview chat. The Calendar supports local month navigation, date selection, and appointment search. Messages supports local conversation search, selection, and composing local replies. Tasks supports local search, status and priority filters, sorting, creating, completing, reopening, and deleting tasks. These other feature changes are not persisted.
- The root route `/` shows a brief BatasGO intro with a link to the workspace. Workspace routes redirect unauthenticated visitors to `/sign-in`; sign-up is available at `/sign-up`. The public health route `/api/health` reports service liveness only. BatasBot lives at `/batasbot`, Document Assembly at `/documents`, the Calendar at `/calendar`, Messages at `/messages`, and Tasks at `/tasks`.
- The current application uses Next.js App Router, React, and TypeScript. Clerk sign-in and route protection are configured. Neon Postgres, Drizzle ORM, and Zod back the intake API; Google Gemini is available for summaries of synthetic sample records only.

## Backend Technology Direction

The backend is being set up incrementally. The current state and remaining choices are:

- **Database:** Neon Postgres is connected; workspace and intake migrations are applied.
- **Database access and migrations:** Drizzle ORM and Drizzle Kit manage schema and migrations. Workspaces are provisioned per authenticated Clerk user and intake queries are restricted to the resolved workspace.
- **Validation:** Zod validates intake create and status-change request payloads.
- **Authentication:** Clerk sign-in routes and workspace route protection are configured. Intake data operations check the Clerk user and workspace membership. Linking identity with the future citizen app remains to be decided.
- **File storage:** Select an object-storage service for attachments; store file metadata and access rules in Postgres and use short-lived links for file access.
- **Hosting:** Evaluate a Next.js-compatible host such as Vercel, considering data-region availability, privacy terms, backups, and operational requirements.
- **AI integrations:** Gemini is configured for explicitly synthetic sample records only. Processing real client information requires provider data-retention/privacy review and explicit approval.

Object storage and hosting remain undecided. This development setup is not a production deployment.

## IMPORTANT
- We are only building the MVP for this part.
- For lawyer we only want to showcase this: Document Generation, Message Receival from users of BatasGO app, intake summary, triage system and AI case summary, BatasBot chatbot, messaging feature including its AI functionality

## Brand Commitments

- Use the BatasGO name and the supplied logo at `assets/batasgo_logo.png`.
- The user-provided triage reference image is the layout and interaction reference for the first screen.

## Evidence on Hand

- BatasGO logo: `assets/batasgo_logo.png`.
- Product and lawyer-tool context: `.context/what-is-batasgo.md`.
- UI reference images: `.context/reference-images/`.
- No production intake records or testimonials are available. Development seed intakes are synthetic; sample interface content must not be presented as live customer data.

## Product Principles

- Keep the MVP focused on the lawyer's workflow.
- Make incoming matters easy to scan and prioritize.
- Keep triage decisions explicit and reversible in the UI demo.
- Clearly distinguish sample content from live records.
