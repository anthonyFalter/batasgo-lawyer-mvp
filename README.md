# BatasGo

A lawyer-facing casework workspace built with the Next.js App Router and TypeScript.

## Getting started

Install dependencies, then start the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.
Open [http://localhost:3000/dashboard](http://localhost:3000/dashboard) for Case Overview, [http://localhost:3000/calendar](http://localhost:3000/calendar) for Calendar, and [http://localhost:3000/messages](http://localhost:3000/messages) for Messages. These screens use local sample data and are not connected to a backend. Case Overview supports search, filtering, sorting, local accept/decline decisions, and undo; Calendar supports month navigation, date selection, and appointment search; Messages supports conversation search, selection, and local replies.

Use `npm run build` for a production build and `npm run typecheck` to check TypeScript.

## Project structure

- `src/app/` contains routes, layouts, global styles, and API route handlers.
- `src/app/(marketing)/` groups public-facing pages without adding a URL segment.
- `src/app/(dashboard)/` groups workspace routes; `/dashboard` renders Case Overview, `/calendar` renders Calendar, and `/messages` renders Messages.
- `src/components/` is for shared UI and layout components.
- `src/features/` keeps feature-specific UI, styles, and logic together, including `triage/`, `calendar/`, and `messages/`; `workspace/` contains the shared application shell.
- `src/lib/`, `src/hooks/`, and `src/types/` hold shared utilities, hooks, and types.
- `assets/` contains source brand assets such as the BatasGO logo.
- `public/` is for static assets.
- `tests/` is for unit, integration, and end-to-end tests.
