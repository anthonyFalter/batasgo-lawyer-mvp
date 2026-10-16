# Triage dashboard

## Scope and mode

First lawyer-facing triage screen at `/dashboard`. Operate.

## Audience and job

A practicing lawyer reviews incoming client intake requests, prioritizes risk, then accepts or declines matters.

## Content and constraints

Use the user-provided triage reference for the screen composition. Use clearly identified sample records and local-only interactions: search, domain/risk filtering, sorting, and accept/decline with local queue updates. No backend, persistence, or change to the public home page.

## Direction contract

THESIS: Make the intake queue the lawyer's working center; refuse a generic analytics-first dashboard.

OWN-WORLD: Reproduce the supplied BatasGO triage screen's white workspace, pale blue-gray canvas, saturated blue active navigation and actions, compact sans-serif data labels, and crisp outlined panels.

STORY: Scan queue risk, narrow or order requests, inspect each summary, and accept or decline without leaving the queue.

FIRST VIEWPORT: At desktop, keep a fixed left navigation, full-width utility header, broad triage list in the middle, and compact diagnostics, schedule, and messages in a right rail. Put filters directly under the page title and decisions at the bottom of each intake row.

FORM: User-pinned triage reference; first and only selected form. No concept seed was generated because the request specifies the composition.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved decisions

No real intake data, persistence, or backend integration is in scope.
