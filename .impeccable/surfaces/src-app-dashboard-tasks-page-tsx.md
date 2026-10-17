---
version: 1
slug: "src-app-dashboard-tasks-page-tsx"
primary_target: "src/app/(dashboard)/tasks/page.tsx"
related_targets:
  - "src/features/workspace/workspace-shell.tsx"
---

# Tasks

## Scope and mode

Lawyer task-management surface at `/tasks`. Operate.

## Audience and job

A practicing lawyer scans legal follow-ups, prioritizes due work, and records completion without leaving the workspace.

## Content and constraints

Use clearly labeled sample tasks and local-only interactions. Search, status and priority filters, task creation, and completion toggles operate in browser state only. No backend or persistence.

## Direction contract

THESIS: Put the task ledger first; help lawyers identify and complete the next follow-up without an analytics-first dashboard.

OWN-WORLD: Inherit BatasGO's established pale blue-gray canvas, white outlined surfaces, Inter typography, compact labels, and restrained blue, red, and yellow state accents.

STORY: Scan the task and matter, compare priority and due date, filter the list, then mark work complete or add a task inline.

FIRST VIEWPORT: Keep a single broad ledger beneath the Tasks heading. Place status filters and priority control directly above the rows. Each row shows task, matter, priority, due date, and completion state; put new-task entry inline rather than in a modal.

FORM: User-selected Action ledger structure. No reference image was supplied.

SIGNATURE INTERACTION: Completing a task updates its state and filtered counts immediately; completion is reversible.

HONEST RISK: All visible records are synthetic examples; actions are not persisted or sent to a backend.
