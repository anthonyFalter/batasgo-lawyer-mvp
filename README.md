# BatasGo

A lawyer-facing casework workspace built with the Next.js App Router and TypeScript.

## Getting started

Install dependencies, then start the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the BatasGO logo intro, which then opens Case Overview.
Open [http://localhost:3000/dashboard](http://localhost:3000/dashboard) for Case Overview, [http://localhost:3000/batasbot](http://localhost:3000/batasbot) for BatasBot, [http://localhost:3000/documents](http://localhost:3000/documents) for Document Assembly, [http://localhost:3000/calendar](http://localhost:3000/calendar) for Calendar, [http://localhost:3000/messages](http://localhost:3000/messages) for Messages, and [http://localhost:3000/tasks](http://localhost:3000/tasks) for Tasks. These screens use local sample data and are not connected to a backend. Case Overview supports search, filtering, sorting, local accept/decline decisions, and undo; BatasBot provides local sample replies and links into the workspace; Document Assembly supports local draft editing, matter reference, exhibit selection, computed-sum insertion, review, and HTML review-copy export; Calendar supports month navigation, date selection, and appointment search; Messages supports conversation search, selection, and local replies; Tasks supports search, status and priority filtering, sorting, task creation, completion, and deletion.

Use `npm run build` for a production build and `npm run typecheck` to check TypeScript.

## Project structure

- `src/app/` contains routes, layouts, global styles, and API route handlers.
- `src/app/(marketing)/` groups public-facing pages without adding a URL segment.
- `src/app/(dashboard)/` groups workspace routes; `/dashboard` renders Case Overview, `/batasbot` renders BatasBot, `/documents` renders Document Assembly, `/calendar` renders Calendar, `/messages` renders Messages, and `/tasks` renders Tasks.
- `src/components/` is for shared UI and layout components.
- `src/features/` keeps feature-specific UI, styles, and logic together, including `triage/`, `batasbot/`, `documents/`, `calendar/`, `messages/`, and `tasks/`; `workspace/` contains the shared application shell.
- `src/lib/`, `src/hooks/`, and `src/types/` hold shared utilities, hooks, and types.
- `assets/` contains source brand assets such as the BatasGO logo.
- `public/` is for static assets.
- `tests/` is for unit, integration, and end-to-end tests.
