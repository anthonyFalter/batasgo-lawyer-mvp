# BatasGo

A lawyer-facing casework workspace built with the Next.js App Router and TypeScript.

## Getting started

Install dependencies, then start the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.
Open [http://localhost:3000/dashboard](http://localhost:3000/dashboard) to try the intake triage demo. Its sample queue supports search, filtering, sorting, local accept/decline decisions, and undo; it is not connected to a backend.

Use `npm run build` for a production build and `npm run typecheck` to check TypeScript.

## Project structure

- `src/app/` contains routes, layouts, global styles, and API route handlers.
- `src/app/(marketing)/` groups public-facing pages without adding a URL segment.
- `src/app/(dashboard)/` groups dashboard routes; `/dashboard` renders the triage feature.
- `src/components/` is for shared UI and layout components.
- `src/features/` keeps feature-specific UI, styles, and logic together, beginning with `triage/`.
- `src/lib/`, `src/hooks/`, and `src/types/` hold shared utilities, hooks, and types.
- `assets/` contains source brand assets such as the BatasGO logo.
- `public/` is for static assets.
- `tests/` is for unit, integration, and end-to-end tests.
