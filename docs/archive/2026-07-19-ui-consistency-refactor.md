---
status: implemented
topic: ui-consistency-refactor
last-verified: a2c197e7fcd8fe21ed07482bd8db8c787a91c29c
archived: 2026-07-19
note: Implemented UI consistency refactor. Current frontend behavior is documented in docs/truth/frontend.md.
---

# UI Consistency Refactor Plan

This is the end-to-end execution plan for aligning the BazaarPlusPlus desktop UI. It is deliberately self-contained: an implementation agent should be able to start from this file, work in order, verify every phase, update current truth, and hand off a finished worktree without reopening the original audit conversation.

## Destination

The four primary surfaces—Install, History, Stream, and About—use one coherent dark-industrial design system, with shared semantic colors, typography, controls, status surfaces, and spacing. The refactor preserves every existing workflow and accessibility contract, passes the relevant checks and tests, and finishes with verified macOS- and Windows-sized browser screenshots plus updated frontend truth.

## Execution Contract

- Work through the numbered tasks in order. Do not start a later task while an earlier task's required verification is red.
- Treat code as source of truth. The current UI boundaries are `src/layouts/`, `src/pages/`, `src/components/ui/`, `src/features/install/`, and `src/styles/index.css`; current behavior context is summarized in `docs/truth/frontend.md`.
- Never read `docs/archive/` for current behavior. It may only be used if the user explicitly asks for historical context.
- Preserve unrelated dirty-worktree changes. If any file listed in a task is already modified for unrelated work, stop before editing that file and ask the user how to proceed.
- Use `apply_patch` for source and documentation edits. Do not mechanically rewrite the entire stylesheet or page when a focused patch is possible.
- Do not modify generated bindings in `src/types/generated/commands.ts`.
- Do not alter backend commands, Stream workflow state, Install page state, confirmed-operation behavior, modal coordination, updater behavior, or route structure.
- Do not create a branch, commit, push, issue, or pull request unless the user separately authorizes it. If commits are authorized, use the optional Conventional Commit checkpoints listed below.
- Keep screenshots and working notes under `tmp/ui-consistency-refactor/`; do not add generated audit output to `docs/`.
- When a check fails, determine whether the failure existed at baseline. Do not hide, delete, or weaken tests to make the refactor pass.
- Mark task checkboxes as work is completed. Record justified deviations in the Execution Log at the end of this plan.

## Scope

### In Scope

- Shared color, typography, border, radius, spacing, focus, disabled, and motion rules.
- Header action grouping, navigation readability, and shared page heading consistency.
- Install action hierarchy and warning presentation.
- History summary readability and empty-state guidance.
- Stream information hierarchy and control differentiation.
- About fallback banner, credit hierarchy, and shared surface usage.
- Reusable UI primitives needed to prevent the same style drift from returning.
- Bilingual layout verification at both fixed platform window sizes.
- Tests that protect real semantics and behavior introduced by the refactor.
- `docs/truth/frontend.md` and documentation-index updates required by the final code.

### Out of Scope

- Brand redesign, new logo, new illustration system, or a new color direction.
- Changes to Tauri window dimensions or resize policy. macOS stays 1020×680 (`src-tauri/tauri.conf.json:16-24`); Windows stays 972×612 (`src-tauri/tauri.windows.conf.json:6-13`).
- Changes to Install/History/Stream backend APIs or generated command bindings.
- Changes to the OBS overlay/settings pages served by the Rust Stream runtime.
- New routes, settings, telemetry, onboarding, or product functionality.
- A full modal redesign. Existing dialogs are regression surfaces only because the audit did not capture every modal state.
- A claim of full WCAG compliance; this plan includes focused accessibility checks, not certification.
- Figma or any other external design-board deliverable.

## Current Code Anchors

- `GlobalShell` owns the header, navigation rail, scrollable main region, page transitions, and modal sources in `src/layouts/GlobalShell.tsx:18-119`.
- `PageShell` and `PageHeader` already provide the shared page structure in `src/components/ui/PageShell.tsx:4-22` and `src/components/ui/PageHeader.tsx:3-32`.
- Shared shell, panel, button, page, focus, motion, and scrollbar rules live in `src/styles/index.css:89-611` and `src/styles/index.css:1937-2028`.
- Install's current visual hierarchy is split between `src/features/install/InstallStatusPanel.tsx:51-132` and `src/features/install/InstallActionsPanel.tsx:28-90`.
- History summary, cleanup, empty, and run-list branches are in `src/pages/History.tsx:26-105`.
- Stream currently renders one large, densely spaced panel in `src/pages/Stream.tsx:34-318`; the framework-neutral state owner is `src/features/stream/streamWorkflow.ts` and must not change for this plan.
- About exposes a pure `AboutView` seam and uses shared problem semantics in `src/pages/About.tsx:44-65` and `src/pages/About.tsx:189-249`.
- `ProblemBanner` currently owns alert/status roles and live regions in `src/components/ui/ProblemBanner.tsx:3-43`.
- The translation catalog uses Chinese as the key-set source of truth and types English against it in `src/i18n/messages.ts:1-12`.
- Existing high-value test seams include `src/layouts/ShellHeader.test.tsx`, `src/pages/About.test.tsx`, `src/features/stream/streamCapabilityState.test.ts`, and `src/features/stream/streamWorkflow.test.ts`.

## Visual Contract

The implementation must retain the current direction and converge it around the following rules.

### Color Tokens

Define the final semantic values under `:root` in `src/styles/index.css`. Tailwind `@theme` values may alias these tokens, but must not remain a competing source of truth.

| Token | Value | Meaning |
| --- | --- | --- |
| `--bpp-bg` | `#0a0e12` | Application background |
| `--bpp-surface-1` | `#10151a` | Standard panel/card |
| `--bpp-surface-2` | `#161c21` | Hover/emphasis surface |
| `--bpp-surface-inset` | `#0c1014` | Input and nested surface |
| `--bpp-line` | `rgba(234, 230, 222, 0.10)` | Standard neutral border |
| `--bpp-line-subtle` | `rgba(234, 230, 222, 0.06)` | Nested/subtle border |
| `--bpp-line-accent` | `rgba(236, 143, 26, 0.40)` | Selected/emphasized border |
| `--bpp-text-1` | `#e6e0d5` | Primary text |
| `--bpp-text-2` | `#a49e93` | Secondary text |
| `--bpp-text-3` | `#8f8a82` | Low-priority metadata |
| `--bpp-accent` | `#ed8b18` | Primary brand/action accent |
| `--bpp-accent-hover` | `#f5a53a` | Accent hover/focus |
| `--bpp-accent-muted` | `#bd7a2a` | Muted accent |
| `--bpp-success` | `#57ba70` | Success/running |
| `--bpp-warning` | `#d9a34a` | Warning |
| `--bpp-danger` | `#d55b4f` | Error/destructive action |

Temporary aliases from existing names such as `--bpp-surface`, `--bpp-surface-hi`, `--bpp-line-neutral`, `--bpp-line-strong`, `--bpp-text`, `--bpp-muted`, `--bpp-gold`, and `--bpp-green` are allowed during migration. Remove an alias only after `rg` proves it has no consumers.

Platform-brand colors are the only exception to the no-arbitrary-product-colors rule. They may appear inside the corresponding social popover, but not as the default Header icon color.

### Typography

| Role | Size | Font | Rule |
| --- | --- | --- | --- |
| Brand title | 17–23px | Cinzel | Header/product name only |
| Page title | 27px | body font | Continue `bpp-page-title` |
| Key status | 16–18px | body font | 600 weight |
| Section heading | 14px | body font | 650 weight |
| Body | 12–13px | body font | User-facing explanations |
| Supporting copy | 11px minimum | body font | Never 8–10px for required guidance |
| Metadata/badge | 10px | Fira Code | Version/path/time/short labels only |
| Eyebrow | 10px | body font | Uppercase and tracking allowed |

The 8px navigation subtitle in `src/styles/index.css:381-388`, 9px History detail in `src/styles/index.css:680-688`, and 10px Install maintenance explanation in `src/features/install/InstallActionsPanel.tsx:121-127` are required migration targets.

### Radius and Spacing

- Control radius: 4px.
- Panel/stat-card radius: 8px.
- Single emphasized surface such as Install hero: 10px.
- Popover/dialog card radius: 6px unless a native platform constraint requires otherwise.
- Component spacing must use the 4/8/12/16/24/32 scale.
- Normal page section gap: 24px.
- Stream panel section gap: 16–20px, replacing the current 32px (`gap-8`).
- Glow is reserved for selected state or primary action; standard panels use only a subtle shadow.

### Interaction States

- Focus: preserve the global 2px `:focus-visible` outline in `src/styles/index.css:1950-1953`; no component may remove it without an equivalent visible ring.
- Disabled: keep structure and text legible; do not apply an overall opacity lower than 0.5 to a primary button or explanatory action tile.
- Loading: preserve control width; spinner/label changes must not move surrounding layout.
- Hover: normal buttons change color/border/surface but do not translate; action tiles may translate up by 1px.
- Motion: keep page transitions and the global reduced-motion rule in `src/styles/index.css:1969-1979`; new transitions stay between 150–200ms.
- Status: color is never the only signal; use text and/or an icon.

## Component Contract

Create only the components that earn a shared semantic boundary.

### `Button`

Location: `src/components/ui/Button.tsx`.

- Props extend native button props.
- Variants: `default`, `primary`, `danger`, `ghost`.
- Sizes: `small`, `default`, `icon`, `hero` only if the Install CTA can use it without awkward conditional CSS.
- Busy state is optional; if used, it sets `aria-busy`, disables the button, and preserves its label or accepts a busy label.
- The component always forwards native `type`, `disabled`, event, ref, and aria props.
- Links remain links; do not render navigation or external anchors as buttons merely to reuse styling. Provide shared CSS classes for link-shaped controls where needed.

### `SegmentedControl`

Location: `src/components/ui/SegmentedControl.tsx`.

- Generic over a string value or narrowly typed to the Stream display-mode union.
- Uses a labelled radio group and native radio inputs.
- Selected, disabled, and focus-visible states must be visually distinct.
- Supports keyboard behavior through native radio semantics; do not implement custom arrow-key state unless native behavior proves insufficient in the target WebViews.

### `ActionTile`

Location: `src/components/ui/ActionTile.tsx`.

- Renders a real button with icon, title, supporting copy, disabled, busy, and optional danger tone.
- Used by the four Install maintenance actions.
- Supporting copy is at least 11px and remains legible while disabled.

### `StatusBanner`

Location: `src/components/ui/StatusBanner.tsx`.

- Tones: `info`, `warning`, `error`, `success`.
- Error uses `role=alert`/assertive live behavior; the other tones use `role=status`/polite behavior unless a caller explicitly supplies a more appropriate role.
- Supports an icon, message/body, optional actions, and optional diagnostic disclosure content.
- `ProblemBanner` becomes a compatibility wrapper around this component so existing semantic-problem callers keep their current API and live-region behavior.

### `EmptyState`

Location: `src/components/ui/EmptyState.tsx`.

- Renders icon, heading, description, and optional primary/secondary actions.
- Used by History's ready-empty branch.
- Height is content-driven; do not encode a 192px empty box in the component.

### `SectionHeading`

Location: `src/components/ui/SectionHeading.tsx` only if migration proves that CSS alone cannot eliminate repeated JSX variants.

- Uses the shared 14px section-heading contract.
- It must not introduce a heading level automatically; callers must select the correct semantic element or pass it explicitly.

## Task 0 — Preflight and Baseline Health

### Work

- [x] Read root `AGENTS.md`, `CONTEXT.md`, `docs/truth/frontend.md`, and this plan.
- [x] Run `git status --short` and `git rev-parse HEAD`; record the starting hash in the Execution Log.
- [x] Inspect diffs for any already-modified in-scope file before editing.
- [x] Confirm Node and npm satisfy `package.json` engines: Node 22.12–24.x and npm 10–11.
- [x] Confirm dependencies are present. If `node_modules` is missing, install from `package-lock.json` with the repository's configured npm; do not change dependency versions.
- [x] Run baseline checks:

```text
npm run check
npm run test:unit
npm run build:frontend
```

### Stop Conditions

- Stop and report if an in-scope file contains unrelated uncommitted changes that cannot be safely preserved.
- If a baseline command fails, save its output under `tmp/ui-consistency-refactor/baseline/`, determine whether it is unrelated, and tell the user before proceeding with a plan that would obscure the failure.

### Done When

- [x] Starting state and baseline command results are recorded.
- [x] No unknown pre-existing failure will be attributed to the UI work.

## Task 1 — Capture the Reproducible Visual Baseline

### Work

- [x] Start Browser Preview exactly as documented by the repo:

```text
npm run dev -- --host 127.0.0.1 --port 14207
```

- [x] Capture and inspect screenshots at 1020×680 for `/`, `/history`, `/stream` (top and scrolled configuration), and `/about`.
- [x] Repeat representative screenshots in Chinese and English.
- [x] Capture the same routes at 972×612 as the Windows layout proxy.
- [x] Save accepted screenshots under:

```text
tmp/ui-consistency-refactor/baseline/macos-size/
tmp/ui-consistency-refactor/baseline/windows-size/
```

- [x] Save a short `observations.md` in the baseline folder recording scroll position, locale, route, and state for each screenshot.
- [x] Inventory current style drift with focused searches and save the output to `tmp/ui-consistency-refactor/baseline/style-inventory.txt`:

```text
rg -n "#[0-9a-fA-F]{3,8}|rgba?\(" src/pages src/layouts src/components src/features/install src/styles/index.css
rg -n "text-\[(8|9|10)px\]|font-size: (8|9|10)px" src
rg -n "bpp-button|bpp-install-secondary-button|bpp-install-maintenance-action" src
```

### Acceptance

- [x] Every screenshot shows the intended route and stable state; no screenshot is blank, loading, cropped to the wrong window, or captured at the wrong viewport.
- [x] Baseline evidence is sufficient to compare every later route.

## Task 2 — Consolidate Design Tokens Without Changing Behavior

### Files

- `src/styles/index.css`
- `src/styles/fonts.css` only if a verified font declaration is wrong; otherwise do not touch it.

### Work

- [x] Add the semantic tokens from the Visual Contract to `:root`.
- [x] Make existing token names temporary aliases so the UI remains stable while callers migrate.
- [x] Make `@theme` reference the semantic values rather than define a second palette.
- [x] Add radius/spacing tokens only where they reduce repeated literals; avoid tokenizing every numeric value.
- [x] Change the global body, panel, button, input, focus, scrollbar, and page-header rules to consume semantic tokens.
- [x] Do not yet perform page layout changes.
- [x] Use the style inventory to migrate only shared-shell literals whose semantics are unambiguous.

### Verification

```text
npm run check
npm run build:frontend
```

- [x] Compare Install and History against the 1020×680 baseline. This task should not introduce a large visible redesign.

### Stop Conditions

- If a literal serves multiple incompatible meanings, keep it temporarily and record it for the component/page task that owns the semantic decision.
- Do not delete an old token until `rg` returns no consumers.

### Optional Commit Checkpoint

`refactor(ui): consolidate shared design tokens`

## Task 3 — Add Shared Semantic UI Primitives

### Files

- Add `src/components/ui/Button.tsx`.
- Add `src/components/ui/SegmentedControl.tsx`.
- Add `src/components/ui/ActionTile.tsx`.
- Add `src/components/ui/StatusBanner.tsx`.
- Add `src/components/ui/EmptyState.tsx`.
- Add `src/components/ui/SectionHeading.tsx` only if the condition in the Component Contract is met.
- Update `src/components/ui/ProblemBanner.tsx` to compose `StatusBanner`.
- Update `src/styles/index.css` with shared component classes.
- Add targeted tests beside components only where they protect semantics.

### Work

- [x] Implement `Button` without replacing anchors or creating an `asChild` abstraction.
- [x] Implement `SegmentedControl` with native radio semantics and typed values.
- [x] Implement `ActionTile` as a real button and preserve native disabled behavior.
- [x] Implement `StatusBanner`; make `ProblemBanner` delegate visual structure while preserving `tone`, `message`, `actions`, `diagnostic`, and `diagnosticLabel` behavior.
- [x] Implement content-driven `EmptyState`.
- [x] Add CSS for every required state: default, hover, focus-visible, active, disabled, busy, selected, and danger.
- [x] Confirm disabled content does not rely on overall opacity below 0.5.

### Required Tests

- [x] Add `StatusBanner.test.tsx` covering error alert/assertive semantics, non-error status/polite semantics, actions, and diagnostic disclosure.
- [x] Add `SegmentedControl.test.tsx` covering group label, option labels, checked state, and disabled state.
- [x] Do not add tests that only assert exact color classes, border radii, or source text.

### Verification

```text
npx vitest run src/components/ui/StatusBanner.test.tsx src/components/ui/SegmentedControl.test.tsx src/components/ui/ConfirmDialog.test.tsx
npm run check
```

### Acceptance

- [x] Existing `ProblemBanner` callers render the same user-facing message, actions, and diagnostics with correct live-region semantics.
- [x] New primitives do not encode Install-, History-, Stream-, or About-specific business logic.

### Optional Commit Checkpoint

`refactor(ui): add semantic interface primitives`

## Task 4 — Unify Header Actions and Popovers

### Files

- `src/layouts/ShellHeader.tsx`
- `src/layouts/GlobalShell.tsx` only if grouping needs a structural wrapper; do not change disclosure state ownership.
- `src/styles/index.css`
- `src/layouts/ShellHeader.test.tsx`

### Work

- [x] Preserve the brand group and its current app-version source.
- [x] Split the visual action area into community links and application actions without changing URLs or menu state.
- [x] Make GitHub, X, Xiaohongshu, and Douyin 36×36 ghost icon controls with one default color, icon rhythm, hover, and focus treatment.
- [x] Keep Bilibili and Support as labelled controls; align their height, radius, border, font weight, and case rules.
- [x] Keep the language button and Windows controls 36×36.
- [x] Add a neutral divider between community links and application actions.
- [x] Migrate popover surface, border, radius, and shadow literals to shared tokens.
- [x] Preserve `aria-expanded`, `aria-controls`, `aria-haspopup`, menu roles, Escape close, outside-pointer close, and trigger focus restoration (`src/layouts/GlobalShell.tsx:40-65`).
- [x] Do not replace platform icons or source assets with emojis, CSS drawings, or new inline approximations.

### Required Tests

- [x] Extend `ShellHeader.test.tsx` only for meaningful structure or semantics introduced by grouping.
- [x] Keep the existing order and disclosure tests passing.

### Verification

```text
npx vitest run src/layouts/ShellHeader.test.tsx
npm run check
```

### Visual Acceptance

- [x] Header fits both fixed widths in Chinese and English.
- [x] The three visual groups are legible without adding clutter.
- [x] Popovers align to their triggers and remain fully visible at both target widths.
- [x] Keyboard focus is visible on every Header control.

### Optional Commit Checkpoint

`refactor(shell): unify header action hierarchy`

## Task 5 — Improve Navigation and Preserve Page Structure

### Files

- `src/layouts/ShellNavRail.tsx`
- `src/styles/index.css`
- `src/components/ui/PageShell.tsx` and `src/components/ui/PageHeader.tsx` only if a shared style hook is required.

### Work

- [x] Keep the four routes, icons, active-index mapping, and animated slider.
- [x] Raise Chinese-mode English subtitles from 8px to 10px and reduce tracking if needed.
- [x] Raise the footer tagline to at least 10px. If the two-line bilingual footer does not fit, show one localized line rather than shrinking required text.
- [x] Keep the current `prefers-reduced-motion` navigation bypass in `src/layouts/ShellNavRail.tsx:103-111`.
- [x] Preserve the shared `PageShell`/`PageHeader` markup and h2 page heading.
- [x] Do not add page-specific title treatments.

### Verification

```text
npm run check
```

### Visual Acceptance

- [x] Active and inactive navigation remain distinguishable without relying on subtitle text.
- [x] Chinese and English navigation fit at 972×612 without clipping or overlap.

### Optional Commit Checkpoint

`refactor(shell): improve navigation readability`

## Task 6 — Align the Install Surface

### Files

- `src/features/install/InstallStatusPanel.tsx`
- `src/features/install/InstallActionsPanel.tsx`
- `src/features/install/PrimaryInstallActionButton.tsx`
- `src/features/install/InstallProblemBanner.tsx`
- `src/styles/index.css`
- Translation files only if a visible label must change; do not rewrite working copy without a concrete need.

### Work

- [x] Preserve the Install hero, its derived install/reinstall/launch mode, path/version cards, warnings, and four maintenance actions.
- [x] Decide whether the primary CTA uses `Button` size `hero` or remains a focused Install component consuming shared tokens. Prefer the latter if making `Button` generic would introduce Install-only props.
- [x] Migrate Copy Path and Open Folder to shared small-button styling.
- [x] Migrate the four maintenance actions to `ActionTile`.
- [x] Ensure maintenance supporting copy is at least 11px and remains readable while disabled.
- [x] Keep Uninstall's danger tone only when it is available; its disabled presentation should be neutral and legible.
- [x] Render warnings through `StatusBanner` or a list-capable wrapper without changing `role=status`, `aria-live=polite`, warning order, or localized presentation.
- [x] Standardize ordinary information cards at 8px radius; keep the single hero at 10px.
- [x] Run `rg` for `InstallActionButton`, `InstallStatusCard`, and `InstallFactItem`. They are unreferenced at baseline. Delete each file only if it still has no imports after migration.

### Required Tests

- Existing Install page-state and problem tests must remain unchanged unless public copy or semantics legitimately changed.
- Add no pure styling tests.

### Verification

```text
npx vitest run src/features/install/installPageState.test.ts src/features/install/installProblems.test.ts src/features/about/updaterPresentation.test.ts
npm run check
```

### Visual Acceptance

- [x] At 1020×680, the hero, path/version information, warnings, and maintenance row are visible as in the baseline hierarchy.
- [x] At 972×612, the page scrolls cleanly with no horizontal overflow.
- [x] Disabled actions remain recognizable and readable but clearly inactive.
- [x] No Install workflow, gate, modal source, or updater entry point changed.

### Optional Commit Checkpoint

`refactor(install): align installer action surfaces`

## Task 7 — Improve History Readability and Empty Guidance

### Files

- `src/pages/History.tsx`
- `src/features/history/StorageCleanupCard.tsx` only for shared component adoption; do not change cleanup behavior.
- `src/styles/index.css`
- `src/i18n/messages.ts`
- `src/i18n/messages.test.ts`

### Work

- [x] Preserve the three summary metrics, refresh action, cleanup disclosure, ready-content list, and nested refresh/problem branches.
- [x] Raise summary supporting copy to at least 11px and migrate it to semantic text tokens.
- [x] Replace the `h-48` one-line ready-empty panel in `src/pages/History.tsx:89-93` with `EmptyState`.
- [x] Add localized empty-state description and action keys in both locales.
- [x] Provide Refresh as the primary empty-state action and a normal link to Install as the secondary action; do not introduce a new data dependency merely to decide whether the link is shown.
- [x] Keep RunCard images, result presentation, metrics, and detail links unchanged.
- [x] Keep Storage Cleanup's confirmed-operation target, preview, execute, and outcome behavior unchanged.

### Required Tests

- [x] Extend `messages.test.ts` through the existing typed catalog rather than adding duplicated key-list tests.
- [x] If History receives a new pure `HistoryView` seam to render the empty state, add one high-level test for heading, description, Refresh, and Install link. Do not create the seam solely for a snapshot test if the existing page can be tested meaningfully without it.

### Verification

```text
npx vitest run src/i18n/messages.test.ts src/features/history/historyPageState.test.ts src/features/history/historyProblems.test.ts src/features/history/storageCleanupProblems.test.ts
npm run check
```

### Visual Acceptance

- [x] Empty History explains what is missing and what the user can do next.
- [x] The empty state no longer reads as a large broken/unfinished panel.
- [x] Summary cards and cleanup use the same surface/border hierarchy as Install.

### Optional Commit Checkpoint

`feat(history): clarify the empty history state`

## Task 8 — Align About Without Removing Its Brand Character

### Files

- `src/pages/About.tsx`
- `src/pages/About.test.tsx`
- `src/i18n/messages.ts`
- `src/i18n/messages.test.ts`
- `src/styles/index.css`

### Work

- [x] Preserve `AboutView`, packaged-fallback provenance, retry, diagnostics, links, credits, licenses, and verified badge.
- [x] Migrate Browser Preview/loading/error feedback to the shared banner visual through the existing `ProblemBanner` path.
- [x] Remove the duplicate heading hierarchy where the section h3 and first group h4 both present Credits/致谢 (`src/pages/About.tsx:137-144`).
- [x] Prefer a new localized `aboutContributors` label for the team group; if the first group heading is omitted instead, confirm the remaining groups still have understandable headings.
- [x] Keep backend-provided role values intact; style them as metadata without pretending they are localized product copy.
- [x] Migrate About card/list arbitrary product colors to shared tokens.
- [x] Keep Cinzel for BazaarPlusPlus branding; use the shared section-heading treatment for Credits and other functional sections.

### Required Tests

- [x] Extend `About.test.tsx` to prove the accessible heading structure no longer repeats the same Credits label at adjacent h3/h4 levels.
- [x] Keep existing fallback, retry, diagnostic, version, and live-region tests passing.
- [x] Keep the typed bilingual message catalog passing.

### Verification

```text
npx vitest run src/pages/About.test.tsx src/i18n/messages.test.ts
npm run check
```

### Visual Acceptance

- [x] About still feels more brand-led than the functional pages without using a separate panel/button system.
- [x] Chinese and English versions fit at both viewport sizes.
- [x] Fallback, warning, and error states are visibly and semantically distinct.

### Optional Commit Checkpoint

`refactor(about): align branding and credit hierarchy`

## Task 9 — Restructure Stream Presentation Only

### Files

- `src/pages/Stream.tsx`
- Add `src/pages/Stream.test.tsx` only if a pure view seam is introduced.
- `src/styles/index.css`
- `src/components/ui/SegmentedControl.tsx`
- `src/features/stream/streamPresentation.ts` only if presentation copy needs a layout-neutral label; do not move layout state into the presenter.

### Protected Files

Do not change the behavior of:

- `src/features/stream/streamWorkflow.ts`
- `src/features/stream/useStreamPage.ts`
- `src/features/stream/streamApi.ts`
- `src/features/stream/streamProblems.ts`

If a visual requirement appears to need a workflow change, stop and document the exact blocker instead of broadening scope.

### Target Layout

1. Service status row: status icon/title/detail on the left; Open Preview and Restart on the right.
2. OBS address row: label, read-only value, Copy.
3. Runtime metrics row: Host, Port, DB, Window; More/Less History adjacent to Window.
4. Overlay configuration: `SegmentedControl`, then crop code with Apply/Reset/Calibration.

### Work

- [x] Keep `Stream` as the hook-owning entry point.
- [x] If useful for testing and readability, export a pure `StreamView` accepting the current `snapshot` and `intents`; do not duplicate or reconstruct workflow state inside the view.
- [x] Replace the single `gap-8 p-6` stack with named layout classes and 16–20px section gaps.
- [x] Reduce the inset-panel weight around runtime metrics; keep one light separator hierarchy.
- [x] Replace the radio-as-button implementation at `src/pages/Stream.tsx:261-277` with `SegmentedControl`.
- [x] Keep each service, polling, window, crop, and one-off problem next to the capability that can recover it.
- [x] Keep every current action gate and disabled condition exactly as derived from the snapshot.
- [x] Keep the URL value selectable and truncated without losing its accessible label.
- [x] Replace page-level arbitrary product colors with shared tokens/classes.
- [x] Keep success notices polite and semantic diagnostics optional.

### Required Tests

- [x] Keep `streamCapabilityState.test.ts` and `streamWorkflow.test.ts` passing unchanged.
- [x] If `StreamView` is added, create a small render helper using existing `idleStreamStatus`, `defaultCropSettings`, and workflow fixture builders rather than inventing a second snapshot shape.
- [x] Cover only user-visible contracts that could regress during layout work: status heading, labelled OBS value, checked display mode, disabled action gates, and nearby problem live regions.

### Verification

```text
npx vitest run src/features/stream/streamCapabilityState.test.ts src/features/stream/streamWorkflow.test.ts src/features/stream/streamProblems.test.ts src/pages/Stream.test.tsx
npm run check
```

If no `src/pages/Stream.test.tsx` was warranted or created, omit it from the command rather than adding a low-value test just to satisfy the written path.

### Visual Acceptance

- [x] At 1020×680, service status, OBS address, runtime metrics, and the display-mode selector are visible without scrolling.
- [x] The crop-code row may require one short scroll, but the first viewport must clearly reveal that more content exists.
- [x] At 972×612, the page has no horizontal overflow and the vertical scroll affordance is apparent.
- [x] Mode selection cannot be mistaken for three independent action buttons.
- [x] Idle, running, stale, degraded, DB-missing, crop-disabled, and action-problem states remain understandable.

### Optional Commit Checkpoint

`refactor(stream): clarify overlay control hierarchy`

## Task 10 — Finish Cross-Surface Style Migration

### Files

- `src/styles/index.css`
- In-scope callers under `src/layouts/`, `src/pages/`, `src/components/ui/`, and `src/features/install/`.

### Work

- [x] Re-run the baseline style-inventory commands.
- [x] Replace remaining page-level product colors with semantic tokens/classes.
- [x] Keep platform brand colors and image assets as documented exceptions.
- [x] Remove temporary token aliases only after `rg` proves they have no consumers.
- [x] Confirm all explanatory 8–10px text has been raised or is genuinely nonessential metadata.
- [x] Confirm Panel, nested surface, control, popover, and emphasized-surface radii match the contract.
- [x] Confirm `ProblemBanner`, Install notices, and About fallback no longer use conflicting visual systems.
- [x] Inspect `ConfirmDialog` and other uncaptured modal components only for regressions caused by shared-token changes. Do not expand into a modal redesign.
- [x] Delete any now-unused Install helper component only after a final import search.

### Verification

```text
npm run format:check
npm run check
npm run build:frontend
```

### Acceptance

- [x] No new product-level arbitrary color is introduced in page JSX.
- [x] Any remaining arbitrary color has a documented semantic or platform-brand reason in the Execution Log.
- [x] The stylesheet no longer has two competing gold/text/surface token systems.

## Task 11 — Run the Full Automated Verification Gate

### Required Commands

Run in this order and save failures before fixing them:

```text
npm run format:check
npm run check
npm run test:unit
npm run build:frontend
```

### Rules

- [x] Fix formatting with the repository formatter only after reviewing the diff; do not allow formatting to rewrite unrelated files.
- [x] Do not run `npm run prebuild-check` because this plan does not change versioning, bundled resources, Tauri config, or release packaging.
- [x] Do not run Rust tests because this plan does not change Rust code.
- [x] Do not run `./build.sh --prod`; packaging is out of scope.
- [x] If implementation unexpectedly touches any excluded area, stop and reassess the verification matrix using root `AGENTS.md` before continuing.

### Done When

- [x] All four commands pass from a clean invocation.
- [x] No test was deleted, skipped, or weakened to get green.

## Task 12 — Perform Final Browser Visual QA

### Setup

- [x] Start the dev server on `http://127.0.0.1:14207/`.
- [x] Save final screenshots under:

```text
tmp/ui-consistency-refactor/final/macos-size/
tmp/ui-consistency-refactor/final/windows-size/
```

### Viewports and Locales

- [x] 1020×680 Chinese.
- [x] 1020×680 English.
- [x] 972×612 Chinese.
- [x] 972×612 English.

### Required Routes and States

- [x] Install Browser Preview default state.
- [x] History empty state.
- [x] History cleanup closed and open.
- [x] Stream idle top and configuration area.
- [x] About packaged-fallback state.
- [x] Bilibili menu open.
- [x] Support menu open.
- [x] At least one keyboard-focused control on Header, Nav, and each route.
- [x] Reduced-motion mode for route transition and History cleanup disclosure.

### Additional States

Use existing tests/fixtures or a narrowly scoped temporary preview mechanism only if it already exists. Do not add production-only debug flags merely to manufacture screenshots.

- Install installed/reinstall/busy/modal states: verify in native/runtime smoke only when safely available.
- History with real run data: verify when local non-sensitive data is available; otherwise name the gap.
- Stream running/stale/degraded states: rely on workflow tests for behavior and capture native states only when safely available.

### Comparison

- [x] Compare each final screenshot with the corresponding baseline at the same viewport, locale, route, and scroll position.
- [x] Reject screenshots that show loading, wrong viewport, wrong route, blank content, or a cropped state.
- [x] Record results in `tmp/ui-consistency-refactor/final/visual-qa.md` with one row per screenshot and explicit pass/fail notes.

### Visual Acceptance Checklist

- [x] Header groups and hit areas are consistent.
- [x] Nav subtitles/footer are readable.
- [x] Page headings remain aligned across all routes.
- [x] Panels, buttons, banners, inputs, and selected states use the same tokens.
- [x] Explanatory text is readable and not clipped.
- [x] Stream shows its primary configuration entry at 1020×680.
- [x] Both fixed sizes have no horizontal overflow.
- [x] Focus indicators are visible.
- [x] Reduced motion is respected.

## Task 13 — Update Current Truth and Documentation Manifest

### Files

- `docs/truth/frontend.md`
- `docs/INDEX.md`
- `CONTEXT.md` only if a glossary/system-map statement actually changes; a visual refactor alone should not require it.
- This plan file.

### Work

- [x] Update `docs/truth/frontend.md` to describe the final semantic token/component system, Header grouping, History empty state, and Stream layout without turning the truth doc into a style guide.
- [x] Cite final code paths and line numbers. Re-run line-number inspection after formatting; do not reuse baseline line numbers blindly.
- [x] Update the frontend truth `last-verified` hash according to the repository's established documentation workflow. Do not invent a hash for uncommitted code.
- [x] Update `docs/INDEX.md` with the final truth-doc status and plan status.
- [x] When implementation is genuinely complete, move this plan to `docs/archive/2026-07-19-ui-consistency-refactor.md`, change frontmatter to implemented/historical status consistent with existing archive examples, preserve the body, and update `docs/INDEX.md` to point to the archived path.
- [x] If the user has not authorized commits and the truth hash cannot yet reference the final implementation commit, leave the plan active, explain the exact remaining hash/archive step in the handoff, and do not falsely mark it implemented. (Not applicable: commits were authorized, and the truth references the final code commit.)

### Verification

- [x] Check every new `file:line` citation against the final code.
- [x] Confirm `docs/INDEX.md` contains exactly one current entry for the plan (active or archived, never both).
- [x] Confirm no generated audit report was added outside ignored `tmp/`.

### Optional Commit Checkpoint

If commits are authorized, use a code commit first and a final documentation commit only if needed to truthfully stamp that code hash:

- `refactor(ui): unify desktop interface styling`
- `docs(ui): verify the completed consistency refactor`

## Task 14 — Final Worktree Audit and Handoff

### Work

- [x] Run `git status --short` and inspect the entire diff.
- [x] Confirm every changed source file belongs to the plan.
- [x] Confirm no generated binding, release resource, Tauri config, archive history, or unrelated file changed.
- [x] Re-run the full verification gate if any source changed after Task 11.
- [x] Confirm final screenshots and `visual-qa.md` exist under ignored `tmp/`.
- [x] Confirm the Execution Log below records baseline hash, deviations, command results, and any environment-only verification gaps.
- [x] If commits are authorized, confirm Conventional Commit format and do not push without separate authorization.

### Final Handoff Must Include

- [x] Outcome first: what is now visibly consistent.
- [x] Concise list of changed modules/surfaces.
- [x] Exact automated commands run and their result.
- [x] Link to final visual-QA output.
- [x] Named verification gaps, especially unavailable native Windows or real-data states.
- [x] Whether the plan was archived or remains active awaiting a truth-hash/commit step.
- [x] No claim of full accessibility compliance.

## Global Completion Definition

The work is complete only when all applicable items below are true:

- [x] Shared semantic tokens are the single source of product color/surface/text meaning.
- [x] Shared controls cover ordinary buttons, segmented selection, action tiles, status banners, and empty states.
- [x] Header has coherent community and application-action groups without losing disclosure behavior.
- [x] Navigation supporting text is readable at both fixed widths.
- [x] Install preserves its workflow while using consistent action, disabled, card, and warning visuals.
- [x] History empty state explains the state and offers Refresh plus Install navigation.
- [x] Stream preserves workflow capabilities while clearly separating status, OBS, runtime metrics, mode selection, and crop actions.
- [x] About preserves brand character while using shared surfaces and a non-duplicated credit heading hierarchy.
- [x] Chinese and English pass browser visual QA at 1020×680 and 972×612.
- [x] Focus, live-region, native radio, disclosure, and reduced-motion behavior are preserved.
- [x] `npm run format:check`, `npm run check`, `npm run test:unit`, and `npm run build:frontend` pass.
- [x] Final code-backed frontend truth is updated.
- [x] The worktree contains no unrelated change.
- [x] Remaining native/manual gaps are explicitly named rather than silently treated as passed.

## Execution Log

Implementation agents append short factual entries here. Do not paste raw command logs unless a failure needs exact evidence.

### Baseline

- Starting commit: `7430b8d1bc9f13bb42b60f96d9b92c67a28d2bfa`.
- Dirty-worktree notes: user-authored `docs/INDEX.md` active-plan entry plus untracked `docs/plans/ui-consistency-refactor.md`; no source files were modified, and both documentation changes are required inputs to this execution.
- Baseline checks: Node `v24.16.0`, npm `11.17.0`, and installed dependencies satisfy `package.json`; `npm run check`, `npm run test:unit` (43 files, 236 tests), and `npm run build:frontend` all passed on 2026-07-19.
- Baseline screenshots: 20 accepted Browser Preview captures (Chinese and English across Install, History, Stream top/configuration, and About) were visually inspected at 1020×680 and 972×612; inventory and per-capture observations are under `tmp/ui-consistency-refactor/baseline/`. One transition-phase History capture was rejected and replaced.

### Deviations

- Task 9's verification command names `src/features/stream/streamProblems.test.ts`, which does not exist. Vitest ran the two existing requested Stream suites (20 tests), and both passed. No placeholder test or pure `StreamView` seam was added solely to satisfy a written path.
- The final color inventory retains literal colors only for the Header's platform-specific social accents, BrandMark SVG artwork, light QR scan backgrounds, and neutral black shadows/backdrops. These are semantic platform/asset exceptions rather than a second product palette; the reviewed inventory is under `tmp/ui-consistency-refactor/final/style-inventory.txt`.
- Final standards/spec review found and the implementation corrected four contract gaps before the last gate: empty-History refresh now shares the busy gate, disabled confirmation opacity is at least 0.5, busy labels reserve stable width, and Header spacing/badge metadata uses the documented scale. The final code review had no unresolved high-priority finding.

### Final Verification

- Code commit: `a2c197e7fcd8fe21ed07482bd8db8c787a91c29c` (`refactor(ui): unify desktop interface styling`).
- Format: `npm run format:check` passed after final source changes.
- TypeScript: `npm run check` passed after final source changes; generated bindings remained unchanged.
- Unit tests: `npm run test:unit` passed (45 files, 243 tests).
- Frontend build: `npm run build:frontend` passed (1,845 modules transformed).
- Visual QA: 38 post-review screenshots passed visual inspection across Chinese/English at 1020×680 and 972×612; exact routes, viewport dimensions, route opacity, focus states, reduced-motion timing, and horizontal overflow were checked. Evidence is under `tmp/ui-consistency-refactor/final/`.
- Native/manual gaps: Browser Preview had no valid native game directory, local non-sensitive History run data, or running Stream service. Installed/reinstall/busy/ConfirmDialog runtime states, real Run/Run Detail media, and Stream running/stale/degraded states therefore remain external-environment checks; automated state/workflow tests passed and no production debug path was added to manufacture them.
