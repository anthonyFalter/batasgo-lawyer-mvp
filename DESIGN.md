---
name: BatasGO Lawyer Workspace
description: A clear, responsive workspace for reviewing legal intake.
colors:
  action-blue: "#4b78ff"
  action-blue-deep: "#3569ef"
  urgency-red: "#ff4b54"
  filter-yellow: "#ffda4d"
  canvas: "#f3f5f8"
  surface: "#ffffff"
  ink: "#292d35"
  muted-ink: "#758198"
  border: "#e0e5ee"
  focus-outline: "#86a7ff"
  selection-blue: "#dce7ff"
  input-ink: "#293243"
  icon-ink: "#30343a"
  heading-ink: "#30333a"
  button-shadow: "rgb(50 92 195 / 18%)"
  button-shadow-hover: "rgb(50 92 195 / 22%)"
  yellow-ink: "#3f3b2b"
  border-hover: "#cbd7f0"
  risk-muted: "#64738c"
  risk-yellow: "#ffc83d"
  risk-orange: "#ff9b42"
  timing-muted: "#8190a8"
  urgency-ink: "#a54438"
  accept-blue: "#3d7cf7"
  quiet-muted: "#8490a2"
  icon-blue: "#5376cb"
  pale-blue: "#d9e4ff"
  overline-muted: "#7f8ba0"
  schedule-muted: "#8491a6"
  metric-ink: "#30343b"
  metric-muted: "#697991"
  link-red: "#e74149"
  link-red-deep: "#ba2e37"
  message-blue: "#3569df"
  message-ink: "#40434a"
  message-muted: "#8c99ae"
  nav-hover-blue: "#285ed9"
  toast-surface: "#262c37"
  toast-border: "#3d4656"
  toast-action: "#a9c3ff"
  toast-shadow: "rgb(19 27 41 / 24%)"
  toast-shadow-low: "rgb(19 27 41 / 10%)"
  drawer-scrim: "rgb(22 30 45 / 42%)"
typography:
  title:
    fontFamily: "Inter Variable, Inter, sans-serif"
    fontSize: "clamp(21px, 1.7vw, 26px)"
    fontWeight: 720
    lineHeight: 1.2
    letterSpacing: "-0.035em"
  body:
    fontFamily: "Inter Variable, Inter, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter Variable, Inter, sans-serif"
    fontSize: "10px"
    fontWeight: 650
    lineHeight: 1.4
  micro:
    fontFamily: "Inter Variable, Inter, sans-serif"
    fontSize: "8px"
    fontWeight: 650
  caption:
    fontFamily: "Inter Variable, Inter, sans-serif"
    fontSize: "9px"
    fontWeight: 600
  compact:
    fontFamily: "Inter Variable, Inter, sans-serif"
    fontSize: "11px"
    fontWeight: 400
  control:
    fontFamily: "Inter Variable, Inter, sans-serif"
    fontSize: "12px"
    fontWeight: 600
  panel-title:
    fontFamily: "Inter Variable, Inter, sans-serif"
    fontSize: "14px"
    fontWeight: 700
  small-display:
    fontFamily: "Inter Variable, Inter, sans-serif"
    fontSize: "16px"
    fontWeight: 700
  metric-small:
    fontFamily: "Inter Variable, Inter, sans-serif"
    fontSize: "17px"
    fontWeight: 740
  action-symbol:
    fontFamily: "Inter Variable, Inter, sans-serif"
    fontSize: "18px"
    fontWeight: 400
rounded:
  xs: "4px"
  sm: "6px"
  tiny: "5px"
  button: "7px"
  md: "8px"
  panel-inset: "9px"
  lg: "10px"
  chip: "12px"
  decision: "18px"
  filter: "20px"
  account: "23px"
  pill: "24px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "22px"
components:
  button-primary:
    backgroundColor: "{colors.action-blue}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    height: "39px"
    padding: "0 14px"
  button-decision:
    backgroundColor: "{colors.action-blue}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    height: "33px"
    padding: "0 11px"
  input-search:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    height: "46px"
    padding: "0 14px"
  filter-dropdown:
    backgroundColor: "{colors.action-blue}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    height: "38px"
    padding: "0 14px"
  card-intake:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "15px 16px 13px"
  chip-critical:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted-ink}"
    rounded: "{rounded.pill}"
    height: "20px"
  navigation-active:
    backgroundColor: "#e9f0ff"
    textColor: "{colors.ink}"
    height: "58px"
    padding: "0 25px"
---

## Overview

**Creative North Star: "The Lawyer's Working Queue"**

BatasGO's lawyer workspace puts incoming matters first. Its visual language follows the supplied triage reference: a quiet, pale work surface, white panels, compact labels, and deliberate blue, red, and yellow accents for actions and quick scanning. The logo remains the brand signature; the interface itself stays practical and information-led.

**Key Characteristics:**
- Queue-first hierarchy with clear risk and decision states.
- Cool neutral surfaces and crisp panel outlines.
- Inter typography and compact, tabular case details.
- Strong blue for primary actions, red for decline and urgency, yellow for sorting.

## Colors

The palette is cool and restrained; saturated accents mark controls and urgency rather than decorating whole panels.

### Primary
- **Workspace Blue** (#4b78ff): Main action, selected navigation, and the domain filter.
- **Decision Red** (#ff4b54): Decline action, urgent markers, and the risk-sort control.

### Secondary
- **Filter Yellow** (#ffda4d): Sort-order control, paired with dark text for legibility.

### Neutral
- **Cool Canvas** (#f3f5f8): Page background behind the white work surfaces.
- **Paper Surface** (#ffffff): Navigation, intake rows, and utility panels.
- **Graphite Ink** (#292d35): Primary copy and high-priority labels.
- **Slate Muted** (#758198): Supporting descriptions and timestamps.
- **Panel Line** (#e0e5ee): Fine panel outlines and separators.

### Named Rules
**The Queue Accent Rule.** Use blue, red, and yellow to distinguish controls and states; keep the surrounding workspace neutral.

## Typography

**Display Font:** Inter Variable, Inter, sans-serif  
**Body Font:** Inter Variable, Inter, sans-serif  
**Label/Mono Font:** Inter Variable, Inter, sans-serif; tabular numerals are used for intake IDs and metrics.

**Character:** Compact, direct sans-serif typography keeps case details scannable without competing with urgency and action color.

### Hierarchy
- **Headline** (720, clamp(21px, 1.7vw, 26px), 1.2): Main workspace title.
- **Title** (700, 12–14px, normal): Panel headings and matter titles.
- **Body** (400, 11–13px, 1.5): Descriptions, supporting information, and message previews.
- **Label** (570–700, 8–11px, 1.4): Filters, metadata, risk, and timestamps.

### Named Rules
**The Scan-First Rule.** Keep case identifiers, risk, and actions visually distinct from supporting summaries.

## Layout

At desktop widths, a fixed left navigation and horizontal utility header frame a two-column work area: intake queue on the left and diagnostics, schedule, and messages on the right. The content is capped at 1800px. The desktop sidebar is 239px wide (214px at narrower desktop widths), and the main header is 94px tall.

At 980px and below, navigation becomes a slide-in drawer and the right rail moves below the queue. At 640px and below, filters form a two-column grid, card actions expand to share the row, the account control collapses to an avatar, and the rail stacks vertically. A 12–22px spacing rhythm organizes controls and panels.

## Elevation & Depth

Depth is mostly tonal: white panels sit against the cool canvas with fine borders. Low, soft shadows distinguish intake and rail panels; hover adds a clearer shadow and slight lift. Popovers and the decision toast receive stronger, offset shadows so they remain legible above the workspace.

### Shadow Vocabulary
- **Panel resting:** `0 2px 4px rgb(29 40 60 / 3%)`.
- **Panel hover:** `0 6px 16px rgb(29 40 60 / 7%)`.
- **Select menu:** `0 4px 12px rgb(29 40 60 / 10%)`.
- **Popover:** `0 14px 32px rgb(28 39 61 / 13%)`.

### Named Rules
**The Quiet Elevation Rule.** Reserve stronger elevation for hover and overlays; resting panels remain close to the canvas.

## Shapes

Panels use 10px corners, secondary controls use 6–8px corners, and capsule filters or decision buttons use pill shapes. Thin cool-gray borders define surfaces. The active navigation marker is a narrow blue edge; avoid heavy panel borders.

## Components

### Buttons
- **Shape:** Compact rounded rectangles for general actions (6–8px); pill-shaped queue decisions (18px).
- **Primary:** Blue fill, white text, 39px high for the main action.
- **Decision:** Blue accept and red decline actions, 33px high, aligned at each intake's foot.
- **Hover / Focus:** Darken slightly and lift on hover; use a visible 3px blue focus outline.

### Filter Select
- **Style:** Compact pill-shaped filter triggers with white text on blue/red and dark text on yellow.
- **Menu:** The white menu matches its trigger's width exactly, sits flush against it, and uses the trigger's accent for its outline. Its top corners remain square and its lower corners are generously rounded, with compact 32px options.
- **Option state:** Hovered or keyboard-focused rows use a faint tint of the trigger accent; the selected value and checkmark use a readable tone of the same accent without a persistent highlight.
- **State:** Keep the menu aligned to its trigger, square its lower trigger corners while open, and support keyboard navigation, selection, and Escape to dismiss.

### Profile Dropdown
- **Menu:** Match the account trigger's width, connect it without a gap, and continue its neutral border around the sides and lower edge. Keep the top corners square and round the lower corners.
- **State:** Square the open trigger's lower corners and preserve a readable compact layout on mobile, where the trigger collapses to an avatar.

### Calendar
- **Layout:** Keep the application shell, sidebar, utility bar, spacing, and typography consistent with Case Overview. Use a month grid as the primary work surface and a selected-day agenda alongside it.
- **Calendar grid:** White surface, fine cool-gray dividers, compact weekday labels, and a blue selected-day state. Keep adjacent-month dates muted.
- **Appointments:** Use the established blue, red, and yellow accents to distinguish consultations, hearings, and deadlines. Keep event details readable in the selected-day agenda, and label local sample records clearly.
- **Interaction:** Previous/next month controls, Today, date selection, and appointment search work locally; event creation remains a demo-only action.

### Messages
- **Layout:** Keep the shared workspace shell. Use a narrow Direct Messages list beside a full-height conversation thread; on mobile, show one pane at a time with an in-thread back action.
- **Conversation list:** Compact text-only rows with case name, last message, and time. The selected row uses a quiet neutral fill.
- **Thread:** Use a compact case header, light neutral inbound bubbles, workspace-blue outbound bubbles, and a rounded single-line composer docked to the bottom.
- **Interaction:** Search conversations and thread content separately, select a thread, and send a local demo reply. Label the sample conversation and clarify that replies are not sent; file attachment remains a demo-only action.

### Cards / Containers
- **Corner Style:** 10px.
- **Background:** White against the cool canvas.
- **Shadow Strategy:** Fine outline and quiet resting shadow; stronger elevation on hover.
- **Border:** 1px cool-gray.
- **Internal Padding:** 13–19px, depending on viewport.

### Inputs / Fields
- **Style:** White search field with a fine gray outline and pill corners.
- **Focus:** Blue border shift and a soft 3px focus halo.
- **Search:** Filters queue items by ID, domain, client label, and summary; Ctrl/Cmd+K focuses the field.

### Navigation
- **Style:** White fixed rail with compact dark labels and line icons.
- **Active:** Pale-blue background with a 6px blue edge.
- **Mobile:** Hidden off-canvas drawer opened from the header, with a dismissible scrim.

### Intake Row
The queue row combines matter ID and domain, risk status, concise summary, received/deadline metadata, and paired accept/decline controls. Decisions remove the item locally and offer an undo action.

## Do's and Don'ts

### Do:
- **Do** keep the queue as the largest and first-read area.
- **Do** label sample workspace data as a demo; it is not connected to live client records.
- **Do** pair the yellow sort control with dark text.
- **Do** preserve keyboard-visible focus and reduced-motion preferences.

### Don't:
- **Don't** present sample statistics or matter details as live account data.
- **Don't** introduce additional accent colors without a clear risk or action meaning.
- **Don't** hide the queue behind summary metrics or decorative charts.
