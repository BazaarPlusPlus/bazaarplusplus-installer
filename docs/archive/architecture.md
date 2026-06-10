---
status: superseded
topic: architecture
archived: 2026-06-11
superseded-by: docs/truth/architecture.md
---
# Architecture

This document describes the current repository structure.

## App Shape

- The desktop shell is a Tauri 2 app.
- The frontend is a React + React Router + Vite app under `src/`.
- The native backend is Rust under `src-tauri/src/`.
- Stream overlay and settings pages are served by the local Tauri HTTP service from `src-tauri/resources/stream/`.
- Release packaging, updater metadata, and platform resource checks are handled by `build.sh` and `scripts/`.

## Top-Level Layout

```text
src/
  api/          typed frontend helpers for Tauri invoke and local HTTP URLs
  components/   shared UI primitives
  features/     route state, API wrappers, and view models grouped by product area
  i18n/         locale provider and message catalogue
  layouts/      shared app shell
  pages/        React route components
  styles/       global styles
  types/        Rust-generated TypeScript bindings and barrels

src-tauri/
  src/
    commands/   Tauri command surface grouped by product area
    history/    SQLite-backed run history reads and video actions
    services/   install, detection, Steam/VDF, game-path, and path helpers
    stream/     local HTTP overlay service, stream state, and record reads
  resources/    bundled payloads and stream overlay assets

scripts/
  binding generation, release manifest, cleanup, and verification helpers
```

## Frontend Boundaries

- `src/App.tsx` owns routing.
- `src/layouts/GlobalShell.tsx` composes the app shell: it wraps the bootstrap and updater providers, mounts the shared header and nav rail, and gates the update and payment modals.
- `src/pages/*` should stay focused on rendering and user actions.
- `src/features/*` owns route loading state, action state, API calls, and pure view-model derivation.
- `src/features/shared/*` owns cross-feature helpers such as async action state, error parsing, and stream session effects.
- `src/api/tauri.ts` is the typed command boundary. When adding or renaming a command, update the command map there and the Rust registration in `src-tauri/src/commands/registry.rs` (the `with_commands!` list).
- Rust structs with `ts_rs::TS` derive are exported by `scripts/generate-bindings.mjs` into `src/types/generated/`.

## Backend Boundaries

- `commands/app.rs`: app bootstrap metadata and external links.
- `commands/install.rs`: product-facing install, data reset, uninstall, directory selection, and launch actions.
- `commands/history.rs`: run list/detail, screenshot reveal, and battle-video actions.
- `commands/stream.rs`: stream session, overlay settings, and stream window actions.
- `services/bepinex/`: payload install, data reset, uninstall, ZIP handling, and version reads.
- `services/detect/`, `services/game_path.rs`, `services/paths.rs`, `services/steam.rs`, and `services/vdf/`: platform discovery, game/data path ownership, Steam process handling, and launch option mutation.
- `history/repo.rs`: read-mostly access to the mod-owned SQLite run history schema.
- `stream/`: local HTTP service lifecycle, overlay/settings routes, image strip generation, stream runtime state, and record reads.

## Data Boundaries

- The mod owns the SQLite schema under the Bazaar data directory. The installer reads it and performs only narrow user-triggered video deletes.
- React does not render full local screenshot paths. It receives relative strip-preview paths and composes them with the local stream service `base_url`.
- Generated TypeScript files under `src/types/generated/` are committed but not manually formatted or edited.

## Verification

- Frontend or TypeScript changes should run `npm run check`.
- Script changes should run the smallest relevant Vitest coverage when available, for example `npx vitest run scripts/<file>.test.mjs`; when no test seam exists, run the touched script directly if practical.
- Tauri command, generated binding, stream, history, or install backend changes should run `npm run test:rust` and `npm run test:unit` as applicable.
- Packaging, bundled resource, versioning, or Tauri config changes should run `npm run prebuild-check`.
- Release-oriented changes should run `./build.sh --prod`.
