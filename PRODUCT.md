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

- The Case Overview, BatasBot, Document Assembly, Calendar, Messages, and Tasks are front-end interaction demos using local sample data only.
- Search, domain and risk filtering, sorting, and accept/decline actions operate locally on Case Overview. BatasBot provides local sample chat replies and navigation links to workspace screens; it is not connected to a language model or live matter data. Document Assembly provides a local editable draft, matter reference, exhibit attachment preview, computed-sum insertion, review checklist, HTML review-copy export, and an embedded BatasBot preview chat. The Calendar supports local month navigation, date selection, and appointment search. Messages supports local conversation search, selection, and composing local replies. Tasks supports local search, status and priority filters, sorting, creating, completing, reopening, and deleting tasks. No backend or persistence is connected.
- The root route `/` shows a brief BatasGO logo intro before opening Case Overview at `/dashboard`. BatasBot lives at `/batasbot`, Document Assembly lives at `/documents`, the Calendar lives at `/calendar`, Messages lives at `/messages`, and Tasks lives at `/tasks`.
- The current front end uses Next.js App Router, React, and TypeScript. These technologies are in use; backend services are not yet connected.

## Planned Technology Direction

The following is a proposed direction for building beyond the front-end demo, not an implemented stack:

- **Database:** Neon Postgres for persistent user, workspace, intake, matter, message, and task data.
- **Database access and migrations:** Drizzle ORM for typed database access and schema migrations.
- **Validation:** Zod to validate data at server-side input boundaries.
- **Authentication:** Choose a managed authentication provider, preferably the one used by the BatasGO citizen app if available, so accounts and submitted inquiries can be linked consistently.
- **File storage:** Select an object-storage service for attachments; store file metadata and access rules in Postgres and use short-lived links for file access.
- **Hosting:** Evaluate a Next.js-compatible host such as Vercel, considering data-region availability, privacy terms, backups, and operational requirements.
- **AI integrations:** Add only when ready; call providers from server-side code, keep credentials out of the browser, and review data-retention terms before sending client information.

The specific authentication provider, object-storage service, hosting setup, and AI provider remain undecided. Do not treat this plan as evidence that these services or integrations are already configured.

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
- No production intake records, testimonials, or connected backend are available; sample interface content must not be presented as live customer data.

## Product Principles

- Keep the MVP focused on the lawyer's workflow.
- Make incoming matters easy to scan and prioritize.
- Keep triage decisions explicit and reversible in the UI demo.
- Clearly distinguish sample content from live records.
