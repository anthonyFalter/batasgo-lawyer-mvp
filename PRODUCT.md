# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Practicing lawyers and legal practitioners reviewing prospective client matters.

## Product Purpose

BatasGO's lawyer tool helps legal practitioners handle client inquiries and related casework. The first workflow being built is an intake triage queue where a lawyer reviews requests, prioritizes risk, and decides whether to accept or decline a matter.

## Positioning

A lawyer-facing casework tool focused on making client intake and matter handling more manageable for practitioners.

## Operating Context

Lawyers review intake information and case materials, communicate with clients, and coordinate consultations and follow-up work. The MVP focus is the lawyer's tool application.

## Capabilities and Constraints

- The Case Overview, Calendar, Messages, and Tasks are front-end interaction demos using local sample data only.
- Search, domain and risk filtering, sorting, and accept/decline actions operate locally on Case Overview. The Calendar supports local month navigation, date selection, and appointment search. Messages supports local conversation search, selection, and composing local replies. Tasks supports local search, status and priority filters, sorting, creating tasks, and toggling completion. No backend or persistence is connected.
- Case Overview lives at `/dashboard`, the Calendar lives at `/calendar`, Messages lives at `/messages`, Tasks lives at `/tasks`, and the public home page remains unchanged.
- The stack is Next.js App Router, React, and TypeScript.

## Brand Commitments

- Use the BatasGO name and the supplied logo at `assets/batasgo_logo.png`.
- The user-provided triage reference image is the layout and interaction reference for the first screen.

## Evidence on Hand

- BatasGO logo: `assets/batasgo_logo.png`.
- Product and lawyer-tool context: `.context/what-is-batasgo.md`.
- UI reference images: `.context/reference-images/`.
- No production intake records, testimonials, or connected backend are available; sample interface content must not be presented as live customer data.

## Product Principles

- Keep the MVP focused on the lawyer's workflow.
- Make incoming matters easy to scan and prioritize.
- Keep triage decisions explicit and reversible in the UI demo.
- Clearly distinguish sample content from live records.
