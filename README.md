# BatasGo

A Next.js App Router starter using TypeScript.

## Getting started

Install dependencies, then start the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

Use `npm run build` for a production build and `npm run typecheck` to check TypeScript.

## Project structure

- `src/app/` contains routes, layouts, global styles, and API route handlers.
- `src/app/(marketing)/` groups public-facing pages without adding a URL segment.
- `src/app/(dashboard)/` groups dashboard pages.
- `src/components/` is for shared UI and layout components.
- `src/features/` keeps feature-specific components and logic together.
- `src/lib/`, `src/hooks/`, and `src/types/` hold shared utilities, hooks, and types.
- `public/` is for static assets.
- `tests/` is for unit, integration, and end-to-end tests.
