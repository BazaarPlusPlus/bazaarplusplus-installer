# Architecture

This document describes the repository as it exists today.

## Status Snapshot

- The app currently redirects `/` to `/install`.
- The install route is still the operational center of the product.
- Stream functionality exists as both a dedicated route and an embedded mode inside the install page.
- Some design documents under `docs/superpowers/` describe a broader app shell that is only partially reflected in the current implementation.

## Top-Level Layout

```text
src/
  lib/
    components/   shared Svelte UI
    home/         home-page summary helpers
    identity/     account observation, local installation identity, remote identity API
    installer/    install flow state, runtime helpers, page model, storage, API calls
    stream/       frontend stream-mode API and state
  routes/
    install/      primary install and repair workflow
    stream/       dedicated stream tools page
    changelog/    release notes UI
    about/        project metadata and support UI

src-tauri/
  src/
    commands/     Tauri command surface grouped by feature area
    stream/       local HTTP overlay service and SQLite-backed record reads
  resources/      bundled mod payloads and stream overlay assets

scripts/
  build and verification helpers
```

## Frontend Boundaries

### `src/routes/install/+page.svelte`

This page is still the heaviest frontend entry point. It owns:

- install and repair actions
- updater flow
- identity flow
- Steam prompt handling
- stream-mode toggle for the embedded variant

To reduce page-level complexity, derived state now lives in `src/lib/installer/page-model.ts`. New install-page logic should prefer adding pure derivation there or moving side effects into feature-specific helpers instead of growing the route file further.

### `src/lib/installer/*`

Current responsibilities:

- `api.ts`: frontend-to-Tauri bridge for install operations
- `detect-flow.ts`: environment detection orchestration
- `identity-flow.ts`: local identity load/activation/relogin orchestration
- `install-guards.ts`: install-time risk evaluation
- `page-model.ts`: install-page derived state and formatting helpers
- `runtime.ts`: runtime capability detection
- `state.ts`: core install-page state derivation
- `storage.ts`: persisted install route preferences
- `updater-flow.ts`: updater check, decision, and download orchestration

Rule of thumb:

- Pure derivation belongs in `state.ts`, `detect-flow.ts`, or `page-model.ts`.
- Feature-specific async orchestration belongs in `identity-flow.ts` or `updater-flow.ts` before it is allowed back into a route file.
- Tauri calls stay in `api.ts`.
- Route files should mostly compose state, effects, and components.

### `src/lib/components/*`

Components are grouped by feature, but there are still a few large files. Current hotspots:

- `src/lib/components/installer/InstallerStatusSteps.svelte`
- `src/lib/components/InstallerUpdateHighlights.svelte`

If those areas keep growing, split by subpanel or user task before adding new branches inside the existing file.

### `src/lib/about/*`

The about page now follows the same pattern as the install page:

- `content.ts`: static project metadata and external links
- `page-model.ts`: locale-dependent view data

Keep static lists out of `src/routes/about/+page.svelte` so the route stays focused on modal state and version loading.

## Backend Boundaries

### `src-tauri/src/commands/*`

Commands expose the desktop feature surface to the frontend. The current split is directionally good, but some files are still large:

- `commands/bepinex.rs`
- `commands/detect.rs`
- `commands/vdf.rs`

Prefer extracting lower-level filesystem, registry, or parsing helpers into submodules before adding more command-layer logic.

### `src-tauri/src/stream/*`

The stream subsystem already has a stronger module boundary:

- `server.rs`: service lifecycle and port binding
- `state.rs`: runtime state
- `records.rs`: SQLite reads and record mapping
- `http.rs`: overlay and JSON routes

This is the current reference for how new feature areas should be structured.

## Documentation Model

Use documentation in two layers:

- Current-state docs in `docs/*.md`
- Historical design records in `docs/superpowers/`

When implementation diverges from an older design spec, do not silently assume the spec is current. Update `docs/architecture.md` or add a small status note in `docs/README.md`.

## Current Maintenance Priorities

The next high-value cleanup targets are:

1. Split `src/lib/components/installer/InstallerStatusSteps.svelte` by subpanel or action group.
2. Add an install-page controller layer if route-level side effects start growing again.
3. Extract helper modules from large Rust command files before they absorb more unrelated behavior.
