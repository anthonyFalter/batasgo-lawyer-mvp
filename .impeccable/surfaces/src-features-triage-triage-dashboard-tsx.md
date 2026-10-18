---
version: 1
slug: "src-features-triage-triage-dashboard-tsx"
primary_target: "src/features/triage/triage-dashboard.tsx"
related_targets:
  - "src/features/triage/triage-dashboard.css"
---

# New intake flow

## Scope and mode

The New Intake dialog on `/dashboard`. Operate.

## Audience and job

A lawyer starts an intake by document or manual entry, verifies facts, then confirms an AI urgency score.

## Content and constraints

Keep the existing BatasGO workspace visual system. Preserve the current urgency formula and score thresholds. Require explicit provider consent before document contents are sent; show AI-filled facts as editable and identify their source where possible. Manual entry sends details to AI only when the lawyer explicitly requests scoring. Keep document contents transient and preserve selected files when extraction fails.

## Direction contract

THESIS: Put the lawyer in control of one continuous intake review; refuse hidden scoring and silent AI extraction.

OWN-WORLD: Existing white workspace, pale blue-gray canvas, crisp outlined panels, saturated blue actions, compact sans-serif labels; use a quiet vertical progress rail and a readable two-column review board.

STORY: Choose a path, disclose provider processing, inspect editable facts and unknowns, confirm, then inspect the existing score breakdown.

FIRST VIEWPORT: Dialog header and progress rail above a two-column workspace; primary action fixed at the lower right, privacy and source notes adjacent to the relevant action or field.

FORM: Review board composition selected by the user; surface seed 4fee57c3.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
