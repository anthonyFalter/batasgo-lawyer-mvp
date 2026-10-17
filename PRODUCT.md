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

- The Case Overview, BatasBot, Document Assembly, Calendar, Messages, and Tasks remain front-end interaction demos using local sample data only. Clerk authentication protects workspace routes, but no client-data APIs or persistent matter data are connected.
- Search, domain and risk filtering, sorting, and accept/decline actions operate locally on Case Overview. BatasBot provides local sample chat replies and navigation links to workspace screens; it is not connected to a language model or live matter data. Document Assembly provides a local editable draft, matter reference, exhibit attachment preview, computed-sum insertion, review checklist, HTML review-copy export, and an embedded BatasBot preview chat. The Calendar supports local month navigation, date selection, and appointment search. Messages supports local conversation search, selection, and composing local replies. Tasks supports local search, status and priority filters, sorting, creating, completing, reopening, and deleting tasks. These feature changes are not persisted.
- The root route `/` shows a brief BatasGO intro with a link to the workspace. Workspace routes redirect unauthenticated visitors to `/sign-in`; sign-up is available at `/sign-up`. The public health route `/api/health` reports service liveness only. BatasBot lives at `/batasbot`, Document Assembly at `/documents`, the Calendar at `/calendar`, Messages at `/messages`, and Tasks at `/tasks`.
- The current application uses Next.js App Router, React, and TypeScript. Clerk sign-in and route protection are configured. Neon Postgres, Drizzle ORM, and Zod are installed for the backend foundation; the database connection and application data APIs are not yet live.

## Backend Technology Direction

The backend is being set up incrementally. The current state and remaining choices are:

- **Database:** Neon Postgres is selected. `DATABASE_URL` must be configured and migrations applied before the database is connected.
- **Database access and migrations:** Drizzle ORM and Drizzle Kit are set up. The initial schema defines workspaces and Clerk-user memberships as the basis for workspace-level data isolation.
- **Validation:** Zod is set up for server-side configuration validation; request validation should be added as data APIs are implemented.
- **Authentication:** Clerk sign-in routes and workspace route protection are configured. Data access still needs server-side membership and permission checks; linking identity with the citizen app remains to be decided.
- **File storage:** Select an object-storage service for attachments; store file metadata and access rules in Postgres and use short-lived links for file access.
- **Hosting:** Evaluate a Next.js-compatible host such as Vercel, considering data-region availability, privacy terms, backups, and operational requirements.
- **AI integrations:** Add only when ready; call providers from server-side code, keep credentials out of the browser, and review data-retention terms before sending client information.

Object storage, hosting, and AI provider remain undecided. Clerk's local development setup is not a production deployment or a substitute for authorization on data operations.

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
