# BatasGO

BatasGO is a lawyer-facing workspace prototype for reviewing client inquiries and managing related casework. Its first backend-enabled MVP workflow is a persistent intake triage queue; documents, messages, calendar, tasks, and BatasBot remain local demonstrations.

This project uses Next.js. Clerk-authenticated intake records and accept/decline decisions are saved in Neon, scoped to the signed-in user's workspace. Development workspaces are seeded with clearly labeled synthetic examples. Other workspace features still use local sample content and are not live legal services or records.

## Technology

### In use

- Next.js App Router
- React
- TypeScript
- Clerk authentication with protected workspace routes
- Neon Postgres and Drizzle ORM for persistent intake and workspace data
- Zod for server-side request validation
- Google Gemini API with optional Groq fallback, restricted to explicitly synthetic demo intakes

### Planned for a backend-enabled MVP

- Citizen-app intake submission integration and APIs for matters, messages, documents, and tasks.
- An object-storage service for attachments, with file metadata and access rules kept in Postgres.
- A Next.js-compatible hosting provider such as Vercel, selected after reviewing data-region availability, privacy terms, and backup requirements.
- Gemini processing of real client data only after provider data-retention/privacy review and explicit approval.

Hosting and file storage remain undecided. The current citizen mobile app is not available, so there is no client submission integration yet.

## Getting started

You'll need Node.js and npm installed.

```bash
npm ci
```

For a fresh local setup, run `npx -y clerk@latest init` to configure Clerk and create local development credentials in `.env.local`. Keep that file private and do not overwrite the generated Clerk values. Set `DATABASE_URL` in `.env.local` to your Neon connection string and `GEMINI_API_KEY` to your Gemini key. Optionally set `GROQ_API_KEY` to enable Groq as a fallback; `GROQ_MODEL` can override its default model. Never commit or share `.env.local`. If you need to create `.env.local` manually, copy `.env.example` first and configure Clerk keys through your Clerk account.

Apply the existing schema migration to your Neon database with:

```bash
npm run db:migrate
```

The schema establishes workspaces, Clerk-user memberships, and intakes. After changing the Drizzle schema, generate a new migration with `npm run db:generate`, then apply it with `npm run db:migrate`. In development, the first authenticated Case Overview load creates an isolated workspace and seeds synthetic sample intakes if that workspace has no seed data. Do not treat these examples as client records.

Start the development server with:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the BatasGO intro and workspace sign-in link. Opening a workspace route while signed out redirects to Clerk sign-in.

## Workspace pages

| Route | Page |
| --- | --- |
| `/dashboard` | Case Overview: search, filter, sort, persist intake decisions, undo, and create intakes. |
| `/batasbot` | BatasBot: sample chat replies and links to workspace screens. |
| `/documents` | Document Assembly: edit a draft, review it, and export an HTML review copy. |
| `/calendar` | Calendar: browse months, select dates, and search appointments. |
| `/messages` | Messages: search conversations and compose local replies. |
| `/tasks` | Tasks: search, filter, sort, and try creating and updating tasks. |
| `/settings` | Settings workspace demo. |
| `/about` | About BatasGO (public). |
| `/sign-in` | Clerk sign-in page. |
| `/sign-up` | Clerk sign-up page. |

Case Overview intake records and decisions persist in Neon. The other workspace screens use demo data in the browser and are not saved to a server. Intake document selection currently saves file names only; file contents are not uploaded.

## Intake API

- `GET /api/intakes` — list intakes for the authenticated user's workspace.
- `POST /api/intakes` — create a workspace intake; risk and priority are calculated on the server.
- `PATCH /api/intakes/:intakeId` — update an intake's status (`pending`, `accepted`, or `declined`).
- `POST /api/intakes/:intakeId/summary` — generate and save an AI summary **only for synthetic sample records**. It tries Gemini first, then Groq when `GROQ_API_KEY` is configured and Gemini fails.

The intake endpoints require Clerk authentication and resolve workspace membership server-side; callers cannot select another workspace by sending an ID. The Gemini API key stays server-side, and manually created intakes are not sent to Gemini.

## Security and sensitive data

The citizen-app submission path is not connected. Manually entered intake details are persisted to Neon, so use synthetic data until database location, retention, access controls, and organizational approval are confirmed. Intake API operations require Clerk authentication and are scoped to the user's workspace.

- **Authorize every data operation.** Never trust client-supplied user, workspace, or matter IDs as proof of access. Keep health-check responses minimal and free of secrets or internal configuration.
- **Keep keys and credentials secret.** Store them in local environment files or the deployment platform's secret manager; never commit them or put them in source code. `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is intended to be public; keep `CLERK_SECRET_KEY`, `DATABASE_URL`, and `GEMINI_API_KEY` server-only. The `.env*` files are ignored by Git, and `.env.example` contains placeholders only. Rotate any credential that may have been exposed.
- **Validate and limit input.** Validate request bodies and query parameters on the server, apply appropriate size and rate limits, and return errors that do not reveal internal details.
- **Handle client data carefully.** Collect only what the feature needs, enforce access checks for database records and uploaded files, and avoid logging message contents, documents, credentials, or other sensitive personal information.
- **Review third-party services.** Before sending client data to AI, hosting, storage, or other providers, review their security, privacy, retention, and data-location practices.

The AI summary route checks the database `isSample` flag and does not accept intake text from the browser. It is intentionally unavailable for manually created intakes until data-processing approval is made. Configured providers receive the synthetic intake text; provider availability and free-tier quotas are not guaranteed.

## Available commands

```bash
npm run dev       # Start the local development server
npm run build     # Create a production build
npm run start     # Serve the production build
npm run typecheck # Run the TypeScript type check
npm run db:generate # Generate a database migration from schema changes
npm run db:migrate  # Apply pending database migrations
```

## Project structure

- `src/app/` — App Router pages, layouts, styles, error pages, and the health API route.
- `src/features/` — Feature workspaces, including triage, documents, messages, calendar, tasks, and BatasBot.
- `src/components/` — Shared UI components.
- `src/lib/`, `src/hooks/`, `src/types/` — Shared utilities, hooks, and types.
- `drizzle/` and `drizzle.config.ts` — Generated Postgres migrations and Drizzle Kit configuration.
- `assets/` — Source assets, including the BatasGO logo.
- `public/` — Static files served by the app.

## Current scope

This remains an MVP prototype, not a production case-management service. Intake records and decisions are persisted in Neon; development seed records are synthetic. Other displayed content is sample data. Citizen-app integration, file uploads, and AI analysis of manually entered intake data are not connected.
