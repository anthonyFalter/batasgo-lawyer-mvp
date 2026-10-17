# BatasGO

BatasGO is a lawyer-facing workspace prototype for reviewing client inquiries and managing related casework. The current MVP centers on an intake triage queue and includes connected workspace screens for documents, messages, a calendar, tasks, and BatasBot.

This project uses Next.js. The workspace is a front-end demo: screens use local sample content, and there is no connected backend or data persistence. Actions and chatbot replies are demonstrations, not live legal services or records.

## Technology

### In use

- Next.js App Router
- React
- TypeScript

### Planned for a backend-enabled MVP

These are proposed choices, not currently installed or connected:

- **Neon Postgres** for persistent application data.
- **Drizzle ORM** for typed database access and migrations.
- **Zod** for server-side input validation.
- A managed authentication provider, ideally shared with the BatasGO citizen app if available.
- An object-storage service for attachments, with file metadata and access rules kept in Postgres.
- A Next.js-compatible hosting provider such as Vercel, selected after reviewing data-region availability, privacy terms, and backup requirements.
- Server-side AI integrations only after reviewing provider data-retention terms and deciding which client information may be sent.

Authentication, hosting, file storage, and AI provider choices are still undecided. The current application has no connected database, authentication, AI service, or persistent storage.

## Getting started

You'll need Node.js and npm installed.

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The home page shows a brief BatasGO intro before opening Case Overview.

## Workspace pages

| Route | Page |
| --- | --- |
| `/dashboard` | Case Overview: search, filter, sort, and try local accept or decline decisions. |
| `/batasbot` | BatasBot: sample chat replies and links to workspace screens. |
| `/documents` | Document Assembly: edit a draft, review it, and export an HTML review copy. |
| `/calendar` | Calendar: browse months, select dates, and search appointments. |
| `/messages` | Messages: search conversations and compose local replies. |
| `/tasks` | Tasks: search, filter, sort, and try creating and updating tasks. |
| `/settings` | Settings workspace demo. |
| `/about` | About BatasGO. |

All interactive changes use demo data in the browser; they are not saved to a server.

## Security and sensitive data

This prototype does not yet handle live client records or use secret-backed services. Treat security as a requirement before connecting real data or adding production API endpoints:

- **Protect every API endpoint.** Require authentication and authorize each request against the user's firm, workspace, and record access. Do not rely on hidden UI controls or client-supplied user, firm, or matter IDs as proof of access. Keep health-check responses minimal and free of secrets or internal configuration.
- **Keep keys and credentials secret.** Store them in local environment files or the deployment platform's secret manager; never commit them, put them in source code, or expose them through `NEXT_PUBLIC_` variables. The `.env*` files are ignored by Git, and `.env.example` is for placeholder names only. Rotate any credential that may have been exposed.
- **Validate and limit input.** Validate request bodies and query parameters on the server, apply appropriate size and rate limits, and return errors that do not reveal internal details.
- **Handle client data carefully.** Collect only what the feature needs, enforce access checks for database records and uploaded files, and avoid logging message contents, documents, credentials, or other sensitive personal information.
- **Review third-party services.** Before sending client data to AI, hosting, storage, or other providers, review their security, privacy, retention, and data-location practices.

These notes describe safeguards to implement; they do not mean authentication, API authorization, or production security controls are currently in place.

## Available commands

```bash
npm run dev       # Start the local development server
npm run build     # Create a production build
npm run start     # Serve the production build
npm run typecheck # Run the TypeScript type check
```

## Project structure

- `src/app/` — App Router pages, layouts, styles, error pages, and the health API route.
- `src/features/` — Feature workspaces, including triage, documents, messages, calendar, tasks, and BatasBot.
- `src/components/` — Shared UI components.
- `src/lib/`, `src/hooks/`, `src/types/` — Shared utilities, hooks, and types.
- `assets/` — Source assets, including the BatasGO logo.
- `public/` — Static files served by the app.

## Current scope

This is an MVP prototype of the lawyer tool, not a production case-management service. Intake examples and other displayed content are sample data. Authentication, backend integrations, and persistent storage are not connected.
