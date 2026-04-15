# Stream Battle List And Overlay Unification Design

## Context

The project currently renders stream records in two separate ways:

- `src-tauri/resources/stream/overlay.js` builds overlay rows with hand-written HTML strings and imperative DOM updates.
- `src/lib/components/stream/StreamRecordLibrary.svelte` renders record summaries directly inside the main app.

This split already causes product and maintenance issues:

- Display mode changes in the overlay do not always invalidate existing rows.
- Badge sizing in the overlay is tied to viewport height and runtime height synchronization, so zoom and resize change the visual result.
- Adding a dedicated battle list in the main app would introduce a third presentation path unless record presentation is extracted first.

The goal of this refactor is to make the main app battle list and the OBS overlay consume the same data model and the same Svelte components while keeping the localhost overlay URL stable for OBS browser sources.

## Goals

- Keep the current OBS workflow intact: users still point OBS at the local `/overlay` URL.
- Replace the overlay's hand-written HTML/JS row renderer with Svelte-rendered UI.
- Extract a shared presenter for stream record to battle-list item transformation.
- Extract a shared list component stack that can render both the overlay and the main app battle list.
- Remove the runtime row height synchronization and replace it with stable CSS layout constraints.
- Make overlay display mode changes re-render the list immediately even when the record set is unchanged.

## Non-Goals

- Changing how screenshots are captured or cropped by the mod.
- Changing the SQLite schema or record loading endpoints.
- Redesigning stream mode service controls outside of battle-list-related touch points.
- Adding speculative filtering, sorting, or pagination features to the new battle list.

## Recommended Approach

Adopt a single Svelte-based battle list implementation with a shared presenter layer and reuse it from both the main app and the overlay entry page.

Why this approach:

- It is the only option that truly gives both surfaces the same components rather than just shared helpers.
- It fixes the existing dual-renderer drift instead of adding another view with duplicated logic.
- It lets layout stability be solved once in CSS rather than patched separately in imperative code.
- It preserves the user-facing OBS contract because the stream service still exposes `/overlay`.

Alternative approaches were considered and rejected:

- Keep `overlay.html` and only extract helper functions: too little reuse, still leaves two UI implementations.
- Keep an HTML shell and mount only the list with Svelte: reduces some duplication but still leaves overlay-specific outer state and rendering paths to drift.

## Architecture

The refactor will introduce three layers:

### 1. Shared record presenter

Create `src/lib/stream/battle-list-presenter.ts`.

Responsibilities:

- Accept raw `StreamRecordSummary` records plus the selected `StreamOverlayDisplayMode`.
- Normalize hero metadata and fallbacks.
- Resolve badge asset URLs for wins and the secondary badge.
- Resolve the screenshot strip URL.
- Produce UI-facing labels such as title fallback and captured-at label.
- Return a compact `BattleListItemViewModel[]` that is already safe for rendering.

This file becomes the only place that knows:

- Hero key mapping
- Wins badge asset rules
- Secondary badge asset rules for `current`, `hero`, and `herohalf`
- Fallback titles for missing hero names
- How image strip URLs are derived from `image_url`

### 2. Shared battle list components

Create a focused component group under `src/lib/components/stream/battle-list/`:

- `BattleList.svelte`
- `BattleListRow.svelte`
- `BattleBadgeStack.svelte`
- `BattleStrip.svelte`

Responsibilities:

- `BattleList.svelte`: list shell, empty state, looping, and high-level mode props
- `BattleListRow.svelte`: one row layout, optional action slot/button, composition of badge stack and strip
- `BattleBadgeStack.svelte`: badge image rendering only
- `BattleStrip.svelte`: screenshot strip frame and image rendering only

The components should accept view-model objects, not raw database records. That keeps all data decisions inside the presenter and makes both hosts render the same shape.

### 3. Two Svelte hosts

Main app host:

- Replace the row markup in `StreamRecordLibrary.svelte` with the shared `BattleList` component.
- Preserve app-only actions such as "reveal image" via props or row action slots.

Overlay host:

- Introduce a Svelte overlay entry page that fetches records, polling state, and display mode, then renders the same shared `BattleList`.
- Keep the stream HTTP server routing `/overlay` to this page so OBS continues to load the same URL.
- The overlay host owns polling, live/stale state, and empty-state message selection, but delegates row rendering to the shared list.

## Data Model

Add a render-oriented type in `src/lib/types.ts` or a nearby stream-specific type file:

- `BattleListItemViewModel`

Expected fields:

- `id`
- `title`
- `subtitle`
- `capturedAt`
- `capturedAtLabel`
- `wins`
- `battles`
- `imageStripUrl`
- `winsBadgeSrc`
- `winsBadgeAlt`
- `secondaryBadgeSrc`
- `secondaryBadgeAlt`
- `heroKey`
- `hasImage`

Optional host-driven fields may be passed separately, for example:

- whether the list is compact
- whether a row action is shown
- whether the host is interactive

That keeps the presenter pure and reusable.

## Overlay Entry Migration

The existing overlay currently depends on:

- `src-tauri/resources/stream/overlay.html`
- `src-tauri/resources/stream/overlay.js`
- `src-tauri/resources/stream/overlay.css`

The target state is:

- A Svelte-rendered overlay page becomes the source of truth for row markup and layout.
- The stream service still answers `/overlay`.
- Static badge assets remain served from the same HTTP service.
- `src-tauri/src/stream/http.rs` continues to own the route contract, but it should return a thin overlay bootstrap that mounts a compiled Svelte overlay entry instead of serving `overlay.js` as the row renderer.

The required migration shape is:

- `/overlay` continues to return HTML from the stream service.
- That HTML only provides the mount node and loads compiled overlay entry assets.
- Record polling, live/stale state, and display-mode refresh move into the Svelte overlay host.
- Row markup, badge rendering, and strip rendering are removed from the legacy `overlay.js` path.

If a thin HTML bootstrap file remains for the route, it must not contain duplicate row rendering logic.

## Layout Rules

The new row layout must avoid runtime geometry synchronization.

Required rules:

- The badge column width must be defined by stable container-relative or font-relative CSS, not `vh`.
- The screenshot strip must render inside a stable frame with a deterministic ratio or deterministic height policy.
- The row must align through CSS grid/flex constraints only.
- Negative-margin pixel nudges must not be required to stack the badges correctly.
- Browser zoom and window resize must preserve the relative structure without JS measuring heights.

Recommended direction:

- Use CSS grid with a fixed badge column and a flexible strip column.
- Let the strip frame define the row height.
- Let badge images fill fixed-width tiles rather than inheriting height from measured screenshot geometry.

## State And Refresh Behavior

Overlay refresh behavior should be updated as follows:

- Re-render when records change.
- Re-render when display mode changes even if records do not.
- Keep live/stale/empty state messaging in the overlay host.
- Continue polling on the same cadence unless implementation work reveals a reason to adjust it.

The cache key for overlay rendering must therefore include both:

- the rendered record identity set
- the selected display mode

This directly addresses the current stale-mode bug.

## Error Handling

Main app:

- Failure to load records should fall back to an empty list with existing console logging behavior unless current patterns suggest a better localized message.

Overlay:

- If the service can still show cached content, keep the stale-state treatment.
- If no content is available, show the empty state with the existing startup-oriented messaging.
- Failure to fetch display mode should not crash rendering; the host may fall back to the most recently known mode or `current`.

## Verification Strategy

Verification should be proportional to the refactor:

- Add small focused tests for the new presenter because it contains behavior-critical asset and fallback decisions.
- Run `npm run check` because this changes Svelte and TypeScript UI code.
- Run the smallest relevant automated coverage for any new presenter tests.
- Manually verify that:
  - the main app stream page renders the shared battle list
  - overlay display mode changes update immediately without a page reload
  - browser zoom or window resize no longer causes badge/strip drift
  - the OBS-facing overlay URL still loads

No packaging build is required unless the implementation ends up touching Tauri bundling or release configuration.

## File-Level Plan For Implementation

Expected new or modified files:

- Create `src/lib/stream/battle-list-presenter.ts`
- Create `src/lib/components/stream/battle-list/BattleList.svelte`
- Create `src/lib/components/stream/battle-list/BattleListRow.svelte`
- Create `src/lib/components/stream/battle-list/BattleBadgeStack.svelte`
- Create `src/lib/components/stream/battle-list/BattleStrip.svelte`
- Modify `src/lib/components/stream/StreamRecordLibrary.svelte`
- Modify the overlay entry implementation so `/overlay` renders the shared Svelte list
- Modify `src/lib/types.ts` if shared view-model typing belongs there
- Remove obsolete row-rendering and row-height-sync code from the old overlay implementation

## Risks

- The overlay HTTP service may require a small amount of integration work to serve the new Svelte output cleanly.
- If the shared components absorb too much host-specific state, the abstraction could become muddy. The host/presenter/component boundary must stay strict.
- CSS stability must be verified in the actual overlay environment, not only inside the main app shell.

## Acceptance Criteria

- The localhost `/overlay` URL still works in OBS without requiring users to change their workflow.
- Main app battle list and overlay rows are rendered by the same Svelte component stack.
- Badge and strip asset selection comes from one shared presenter.
- Changing overlay display mode updates visible rows immediately even when record data is unchanged.
- Row layout remains visually stable under browser zoom and window resize without runtime height syncing.
