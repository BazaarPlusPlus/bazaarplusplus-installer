# Architecture

This document describes the repository as it exists in the current codebase.

## Status Snapshot

- The app currently redirects `/` to `/install`.
- The install route is still the operational center of the product, but the route file is now mostly a composition layer around controllers, selectors, and Svelte components.
- Stream functionality exists as both a dedicated route and an embedded mode inside the install page. The OBS-facing overlay is still served by the local Tauri HTTP service from `src-tauri/resources/stream/`.
- The Tauri updater plugin, updater artifact generation, and R2 manifest upload flow are implemented. See `docs/updater-release-plan.md` for the release workflow.

## Top-Level Layout

```text
src/
  lib/
    bridge/       typed frontend wrapper for Tauri commands
    components/   shared Svelte UI
    config/       frontend constants such as external URLs
    generated/    TypeScript bindings generated from Rust ts-rs exports
    installer/    install controllers, selectors, runtime helpers, storage, API calls
    stream/       frontend stream-mode API and state
  routes/
    install/      primary install and repair workflow
    stream/       dedicated stream tools page
    about/        project metadata and support UI

src-tauri/
  src/
    commands/     Tauri command surface grouped by feature area
    stream/       local HTTP overlay service and SQLite-backed record reads
  resources/      bundled mod payloads, BPP data policy, stream overlay assets

scripts/
  build, binding generation, manifest, and verification helpers
```

## Frontend Boundaries

### `src/routes/install/+page.svelte`

This page remains the heaviest frontend entry point, but it should stay focused on wiring:

- instantiating `createInstallController` and `createUpdaterController`
- composing `createInstallPageModel`
- connecting modal/component props to controller methods
- starting the initial install detection and updater check on mount

New install-page behavior should not add large async branches directly to the route. Put side effects in a controller or flow helper, pure derivation in a selector, and UI structure in an installer component.

### `src/lib/installer/*`

Current responsibilities:

- `api.ts`: frontend-to-Tauri bridge for install operations
- `controllers/`: route-facing orchestration for install and updater behavior
- `detect-flow.ts`: environment detection orchestration
- `install-guards.ts`: install-time risk evaluation
- `page-model.ts`: compatibility composition layer over focused selectors
- `runtime.ts`: runtime capability detection
- `selectors/`: pure derived state for install gates, updater button, Steam modal, and mode labels
- `state.ts`: core install-page state derivation
- `storage.ts`: persisted install route preferences
- `updater-flow.ts`: updater check, decision, and download orchestration

Rule of thumb:

- Pure derivation belongs in `state.ts` or `selectors/`.
- Feature-specific async orchestration belongs in `controllers/` or `updater-flow.ts` before it is allowed back into a route file.
- Tauri calls stay in `api.ts`.
- Route files should mostly compose state, effects, and components.

### `src/lib/bridge/*` and `src/lib/generated/*`

Rust structs with `ts_rs::TS` derive are exported by `scripts/generate-bindings.mjs` into `src/lib/generated/bindings/`, then re-exported by `src/lib/generated/commands.ts`.

`src/lib/bridge/commands.ts` is the typed command wrapper used by frontend API modules. When adding or renaming a Tauri command, update both:

- the Rust command registration in `src-tauri/src/lib.rs`
- the `TauriCommandMap` entry in `src/lib/bridge/commands.ts`

Run `npm run generate:bindings` or a command that invokes it before relying on generated type changes.

### `src/lib/components/*`

Components are grouped by feature, but there are still a few large files. The current hotspot is:

- `src/lib/components/installer/InstallerStatusSteps.svelte`

If it keeps growing, split by subpanel or user task before adding new branches inside the existing file.

### `src/lib/about/*`

The about page now follows the same pattern as the install page:

- `content.ts`: static project metadata and external links
- `page-model.ts`: locale-dependent view data

Keep static lists out of `src/routes/about/+page.svelte` so the route stays focused on modal state and version loading.

## Backend Boundaries

### `src-tauri/src/commands/*`

Commands expose the desktop feature surface to the frontend. The current module split is:

- `commands/bepinex/`: install, repair, uninstall, payload, versioning, and ZIP handling
- `commands/detect/`: Steam discovery, .NET probing, and game path validation
- `commands/game_process.rs`: Bazaar process detection
- `commands/startup.rs`: startup context assembly
- `commands/steam.rs`: Steam process and launch-option operations
- `commands/stream.rs`: stream service commands
- `commands/vdf.rs`: VDF parsing and mutation

The largest command-side files are now `commands/vdf.rs` and the stream HTTP/record repository modules. Prefer extracting lower-level parsing, cache, filesystem, or HTTP helpers into submodules before adding more command-layer logic there.

### `src-tauri/src/stream/*`

The stream subsystem has a dedicated module boundary:

- `server.rs`: service lifecycle and port binding
- `state.rs`: runtime state
- `path_resolution.rs`: game path and database path resolution
- `overlay_settings.rs`: crop/display-mode persistence
- `records/`: SQLite reads, image path resolution, record mapping, and repository facade
- `http.rs`: overlay and JSON routes

This is the current reference for how new feature areas should be structured.

### Release And Packaging

`build.sh` is the release entry point:

- `./build.sh`: launch the local Tauri dev app
- `./build.sh --prod`: build release artifacts for the current host platform
- `./build.sh --upload`: upload existing artifacts for the current host platform and rebuild `latest.json`
- `./build.sh --prod --upload`: build and upload in one run

`npm run prebuild-check` validates version alignment, BPP data version policy, and platform resource ZIP contents. `./build.sh --prod` runs `scripts/version-sync.mjs` and `npm run prebuild-check` before bundling.

## Documentation Model

Keep `docs/*.md` as the current source of truth. Delete stale design records and implementation plans instead of leaving them beside current docs.

## Current Maintenance Priorities

The next high-value cleanup targets are:

1. Keep `src/routes/install/+page.svelte` near its current composition role. New side effects should land in controllers or flow modules.
2. Split `src/lib/components/installer/InstallerStatusSteps.svelte` by subpanel or action group if it keeps growing.
3. Extract focused helpers from `src-tauri/src/commands/vdf.rs` or `src-tauri/src/stream/records/repo.rs` before adding unrelated behavior there.
4. Keep `src/lib/bridge/commands.ts` synchronized with Rust command registrations and generated TypeScript bindings whenever the command surface changes.
