# BatasGO

BatasGO is a lawyer-facing workspace prototype for reviewing client inquiries and managing related casework. The current MVP centers on an intake triage queue and includes connected workspace screens for documents, messages, a calendar, tasks, and BatasBot.

This project uses Next.js. The workspace features still use local sample content; Clerk sign-in protects workspace routes, but there is no connected matter-data API or persistent application data yet. Actions and chatbot replies are demonstrations, not live legal services or records.

## Technology

### In use

- Next.js App Router
- React
- TypeScript
- Clerk authentication with protected workspace routes
- Neon serverless Postgres driver and Drizzle ORM for the database foundation
- Zod for server-side configuration validation

### Planned for a backend-enabled MVP

- Data APIs and per-workspace authorization for client matters, messages, documents, and tasks.
- An object-storage service for attachments, with file metadata and access rules kept in Postgres.
- A Next.js-compatible hosting provider such as Vercel, selected after reviewing data-region availability, privacy terms, and backup requirements.
- Server-side AI integrations only after reviewing provider data-retention terms and deciding which client information may be sent.

The Neon database is not connected until `DATABASE_URL` is configured and migrations are applied. Hosting, file storage, and AI provider choices are still undecided. The current application has no persistent matter data or AI service.

## Getting started

You'll need Node.js and npm installed.

```bash
npm ci
```

For a fresh local setup, run `npx -y clerk@latest init` to configure Clerk and create local development credentials in `.env.local`. Keep that file private and do not overwrite the generated Clerk values. Set `DATABASE_URL` in `.env.local` to your Neon connection string; never commit the file or share the connection string. If you need to create `.env.local` manually, copy `.env.example` first and configure Clerk keys through your Clerk account.

Apply the existing schema migration to your Neon database with:

```bash
npm run db:migrate
```

The initial schema establishes workspaces and Clerk-user memberships as the basis for firm-level data isolation. After changing the Drizzle schema, generate a new migration with `npm run db:generate`, then apply it with `npm run db:migrate`. The current proxy protects workspace routes; the public `/api/health` endpoint only reports service liveness. No client-data API is implemented yet. Do not add live matter data until each data operation checks the authenticated user's workspace membership and permissions.

Start the development server with:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the BatasGO intro and workspace sign-in link. Opening a workspace route while signed out redirects to Clerk sign-in.

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
| `/about` | About BatasGO (public). |
| `/sign-in` | Clerk sign-in page. |
| `/sign-up` | Clerk sign-up page. |

All interactive changes use demo data in the browser; they are not saved to a server.

## Security and sensitive data

The prototype does not yet handle live client records. Clerk authentication protects workspace routes, but there are no APIs for reading or writing matter data yet. Before adding those endpoints:

- **Authorize every data operation.** Authentication alone is not enough. Check the Clerk identity and database workspace membership on the server for every request; never trust client-supplied user, workspace, or matter IDs as proof of access. Keep health-check responses minimal and free of secrets or internal configuration.
- **Keep keys and credentials secret.** Store them in local environment files or the deployment platform's secret manager; never commit them or put them in source code. `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is intended to be public; keep `CLERK_SECRET_KEY` and `DATABASE_URL` server-only. The `.env*` files are ignored by Git, and `.env.example` contains placeholders only. Rotate any credential that may have been exposed.
- **Validate and limit input.** Validate request bodies and query parameters on the server, apply appropriate size and rate limits, and return errors that do not reveal internal details.
- **Handle client data carefully.** Collect only what the feature needs, enforce access checks for database records and uploaded files, and avoid logging message contents, documents, credentials, or other sensitive personal information.
- **Review third-party services.** Before sending client data to AI, hosting, storage, or other providers, review their security, privacy, retention, and data-location practices.

Clerk authentication protects workspace routes. Because client-data APIs are not implemented, per-record API authorization is still future work; this guidance does not claim production-ready security.

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

This is an MVP prototype of the lawyer tool, not a production case-management service. Intake examples and other displayed content are sample data. Clerk sign-in and workspace route protection are configured; Neon-backed application data, business APIs, and persistent storage are not connected yet.
