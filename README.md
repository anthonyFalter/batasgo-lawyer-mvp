# BatasGO

BatasGO is a lawyer-facing MVP for reviewing client inquiries and managing related casework. It is a prototype, not a production case-management or legal-advice service.

## Walkthrough

Start at `/` and sign in through Clerk to open the workspace.

| Route | What to try |
| --- | --- |
| `/dashboard` | Review the intake queue, inspect triage details, and create or update an intake. |
| `/batasbot` | Chat with BatasBot and review saved conversations. |
| `/messages` | View citizen conversations and consented journal handoffs. |
| `/documents` | Explore the document assembly demo. |
| `/calendar` | Browse the calendar demo. |
| `/tasks` | Explore the task demo. |
| `/settings` | View the settings demo. |
| `/about` | Read about the project. |

Intakes, BatasBot conversations, and citizen messages/handoffs persist in Neon. Document Assembly, Calendar, and Tasks use browser-side sample data and are not saved to the server. Development workspaces may receive synthetic sample intakes; do not treat them as client records.

## Stack and project map

- Next.js App Router, React, and TypeScript.
- Clerk for lawyer-app authentication.
- Neon Postgres with Drizzle ORM for persistent data.
- Zod for server-side request validation.
- Gemini and optional Groq for AI features.

```text
src/
  app/                 Routes, layouts, API endpoints, and error pages
  features/            Workspace UI by feature (triage, messages, BatasBot, etc.)
  lib/
    db/                Database client, schema, and workspace helpers
    citizen/           Citizen API, messaging, audit, and encryption
    intakes/            Intake services, validation, and triage
    chat/              BatasBot session persistence
  hooks/                Shared React hooks
drizzle/                PostgreSQL schema migrations
```

The API routes live under `src/app/api/`. They authenticate requests and enforce workspace or conversation access on the server; do not rely on client-supplied IDs as authorization.

## Local development

Requirements: Node.js and npm.

```bash
npm ci
```

Copy `.env.example` to `.env.local` and configure the values described below. Keep `.env.local` private; it is ignored by Git.

```bash
npm run db:migrate
npm run dev
```

Open `http://localhost:3000`. For code changes, use:

```bash
npm run typecheck
npm run build
```

After changing `src/lib/db/schema.ts`, generate and review a migration, then apply it to the intended database:

```bash
npm run db:generate
npm run db:migrate
```

Never run a migration against production until you have verified `DATABASE_URL` and reviewed the generated SQL.

## Environment variables

Set secrets in the hosting provider's environment-variable manager, not in source code or client-side code.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string. |
| `MESSAGE_ENCRYPTION_KEY` | For citizen messages | Base64-encoded 32-byte key for AES-256-GCM message and handoff encryption. Keep it stable and backed up; losing it makes encrypted records unreadable. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Clerk publishable key; this is intended to be public. |
| `CLERK_SECRET_KEY` | Yes | Clerk server-side secret key. |
| `GEMINI_API_KEY` | For Gemini features | Server-side Gemini API key. |
| `GROQ_API_KEY` | Optional | Enables Groq provider/fallback features. |
| `CITIZEN_CLERK_JWT_KEY` | For citizen integration | Citizen Clerk instance's PEM JWT public key. |
| `CITIZEN_APP_ORIGINS` | For citizen integration | Comma-separated exact citizen-app origins; production origins must use HTTPS. |
| `GEMINI_MODEL`, `GROQ_MODEL`, `GROQ_CHAT_MODEL` | Optional | AI model overrides. |

See `.env.example` for the local template. Generate an encryption key with:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

## Deploying the MVP to Vercel

1. Import the GitHub repository into Vercel as a Next.js project. The project root is the repository root; the build command is `npm run build`.
2. Create a Neon database for the deployment. Use a separate database or branch for previews; do not let preview deployments access production data.
3. In **Vercel → Project → Settings → Environment Variables**, add the required values above for the appropriate environments. If testing on a Vercel `vercel.app` URL without a custom domain, the app can use Clerk development-instance keys temporarily; this is a limited test setup, not a production Clerk configuration.
4. Apply the Drizzle migrations once to the intended database by setting its `DATABASE_URL` locally and running `npm run db:migrate`. Verify the database target before running the command. Do not run migrations automatically during every Vercel build or preview deployment.
5. Deploy, then test sign-in, workspace isolation, messaging, and any AI features you enabled. Check Vercel function logs for configuration or runtime errors.
6. When environment variables change, redeploy so the new deployment receives them. Before wider production use, configure a Clerk production instance and domain, backups, access monitoring, and provider data-handling policies.

## Data and MVP limitations

- Keep this deployment limited to testing with synthetic data until database location, retention, backups, access controls, and organizational approval are confirmed.
- Intake details are saved to Neon. Requested AI reviews send relevant information to the configured AI provider; identifier masking is best-effort and is not anonymization.
- Citizen message and handoff content is encrypted at rest with the server-side `MESSAGE_ENCRYPTION_KEY`; it is not end-to-end encrypted. Existing plaintext citizen data must be encrypted before enabling the encryption-required flows. See `npm run db:encrypt-citizen-data` and the migration history before using this with existing records.
- There is currently no server-side rate limiting for messaging or AI requests. Keep access limited and monitor provider usage and spend.
- Lawyer directory profiles are not credential-verified. AI output is an aid and must be checked by a qualified professional.
- Document Assembly, Calendar, and Tasks are demos, not live records or services.

Review AI-provider retention and data-location terms before sending sensitive information. Never log or share API keys, database credentials, encryption keys, or client content.
