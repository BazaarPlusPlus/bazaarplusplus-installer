# Changelog Page Design

## Goal

Replace the current single-version `What's New` page with a full-history `Changelog` page aimed at ordinary BazaarPlusPlus players rather than technical users.

The page should help a player answer two questions quickly:

1. What is the main point of this update?
2. Was the thing I care about added, improved, fixed, or removed?

## Scope

This design covers:

- Replacing the current `What's New` presentation model with a multi-version changelog
- Updating the installer entry point to link to `Changelog`
- Removing the auto-update post-install redirect into the old page
- Migrating the existing hand-authored release content into the new structure

This design does not cover:

- Pulling changelog content from Git, GitHub releases, or any remote source
- Introducing release dates
- Expanding the page into a marketing or support surface

## Product Direction

The current page behaves like a release spotlight. It is optimized for telling one version's story with a featured section, staged cards, and promotional emphasis.

The new page should instead behave like a readable historical record for players:

- Latest version first
- All versions available on one page
- Each version starts with one short summary sentence
- Details are grouped into four user-readable categories:
  - `Added`
  - `Improved`
  - `Fixed`
  - `Removed`

For Chinese UI, the category labels should be:

- `新增`
- `优化`
- `修复`
- `移除`

## Information Architecture

### Route

Use a dedicated `/changelog` route.

The old `what's-new` route is no longer the primary information architecture. Implementation may either remove it entirely or keep a redirect shim temporarily, but the canonical destination must be `/changelog`.

### Page Layout

The page should use a light-card layout that preserves the installer's existing dark and gold visual language without the current theatrical hero treatment.

Top section:

- Back-to-home button
- Locale toggle
- Title: `Changelog`
- One short descriptive sentence explaining that the page shows BazaarPlusPlus update history

Main section:

- Vertical list of release cards in reverse chronological order
- Latest release appears first
- No pagination in the initial version

### Release Card Layout

Each release card contains:

- Version number
- One short summary sentence for that release
- Up to four grouped sections:
  - `Added`
  - `Improved`
  - `Fixed`
  - `Removed`

Rules:

- Empty groups are hidden
- Group ordering is fixed even if some groups are missing
- Bullets are short and player-facing
- The version card should remain readable on mobile without timeline-specific layout complexity

## Data Model

The changelog remains hand-authored in source code.

Recommended shape:

```ts
type LocalizedText = {
  zh: string;
  en: string;
};

type ChangelogRelease = {
  version: string;
  summary: LocalizedText;
  added: LocalizedText[];
  improved: LocalizedText[];
  fixed: LocalizedText[];
  removed: LocalizedText[];
};
```

Design constraints:

- Releases are stored in descending order in source
- The first item is treated as the latest release
- No per-section badge, tone, CTA, or promotional metadata
- No release date field in the initial version

## Content Strategy

This page is for ordinary players, so wording should optimize for scanability instead of formal engineering precision.

Authoring guidance:

- Start each release with a plain-language summary sentence
- Prefer short bullets over long explanatory paragraphs
- Use player-visible language instead of internal implementation detail
- Put removed or discontinued behavior explicitly under `Removed`
- Avoid hiding removals inside `Improved`

## Migration From Current Content

The current `What's New` content is hand-maintained and should be migrated manually into the new structure.

Migration approach:

- Convert existing release records into changelog releases
- Rewrite the current highlighted sections into summary plus four fixed categories
- Preserve bilingual content
- Drop fields that only exist to support the current spotlight layout:
  - kicker
  - releaseLabel
  - sectionTitle
  - sectionSummary
  - tone
  - badge
  - actionLead
  - actionLabel

The support QR modal and related CTA should be removed from the changelog surface because it conflicts with the page's new purpose.

## Installer Integration

The installer should expose a single `Changelog` entry where `What's New` currently appears.

Expected behavior:

- The Step I side action links to `/changelog`
- The label is `Changelog` in both locales unless a localized product decision is made later
- The page is user-invoked, not auto-opened

## Post-Update Behavior

The current pending-launch mechanism for auto-opening the old `What's New` page after app update should be removed.

Remove the behavior that:

- Stores a pending post-update page launch in local storage
- Checks for that pending state on app startup
- Automatically redirects the user into update content after install

Reasoning:

- The user explicitly does not want auto-jump behavior
- A historical changelog works better as a voluntary reference page than a forced post-update destination

## Components And Responsibilities

Recommended component split:

- Route component for `/changelog`
  - Owns page chrome and locale-aware heading copy
- Changelog list component
  - Iterates releases
- Changelog release card component
  - Renders version, summary, and visible non-empty groups
- Changelog data module
  - Stores hand-authored releases and any helpers

This is intentionally simpler than the current spotlight component tree.

## Error Handling And Fallbacks

The initial design should avoid complex failure states.

Expected fallbacks:

- If changelog data is empty, render a minimal empty state instead of a broken page
- If older route links still exist temporarily, redirect or route them safely to `/changelog`
- Locale rendering should always fall back to the selected locale's strings already provided in source

## Testing And Verification

Because this is a Svelte UI and route change, the implementation should at minimum run:

```sh
npm run check
```

Recommended validation targets:

- `/changelog` renders without type or Svelte check failures
- Latest release appears first
- Empty groups are not rendered
- Installer Step I action links to `/changelog`
- Old auto-open post-update behavior is removed
- Existing string-based tests that target `what's-new` layout are updated or replaced to match the new semantics

## Open Decisions Already Resolved

The following decisions are fixed by user direction:

- Full history on one page, not one version per page
- No automatic jump after update
- No release dates in the initial version
- Fixed user-facing categories instead of free-form groups
- Audience is ordinary players, not technical users
- Use summary plus grouped details, not a marketing-style hero spotlight

## Implementation Notes

When implementation starts, prefer renaming old `what's-new` modules to `changelog`-oriented names instead of keeping the old naming with new behavior. The code should match the new product concept clearly.
