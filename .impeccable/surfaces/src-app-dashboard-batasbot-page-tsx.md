---
version: 1
slug: "src-app-dashboard-batasbot-page-tsx"
primary_target: "src/app/(dashboard)/batasbot/page.tsx"
related_targets:
  - "src/features/batasbot/batasbot-workspace.tsx"
  - "src/features/batasbot/batasbot-workspace.css"
  - "src/features/workspace/workspace-shell.tsx"
---

# BatasBot

## Scope and mode

Main workspace assistant at `/batasbot`. Operate.

## Audience and job

A practicing lawyer uses a conversational interface to find the right workspace area and get help with drafting and casework workflows.

## Content and constraints

The assistant uses local sample replies only. It is not connected to an AI model, matter data, document generation service, or backend. Navigation links lead to existing local-demo screens. Clearly disclose that responses are sample text and not legal advice.

## Direction contract

THESIS: Give lawyers a familiar conversational starting point for navigating the workspace and exploring drafting workflows.

OWN-WORLD: Extend BatasGO's pale blue-gray canvas, white surfaces, outlined controls, compact Inter typography, and blue actions. Keep the chat calm, spacious, and consistent with the workspace shell.

STORY: Start with a clear assistant welcome and relevant suggested prompts; continue in a scrollable conversation with a persistent composer and useful links into the app.

FIRST VIEWPORT: The shared navigation highlights BatasBot. The page presents a compact assistant header, a centered welcome with prompt suggestions, and a composer anchored to the bottom of the chat area.

FORM: Familiar full-page assistant chat with prompt starters, user and assistant turns, typing feedback, and in-product navigation links.

SIGNATURE INTERACTION: Ask where to find a matter, how to start a document, or what to prepare; receive a clearly labeled sample reply and a link to the corresponding workspace screen.

HONEST RISK: Replies are canned demo text and do not inspect, draft, or verify live legal materials. Users must independently verify facts and law.
