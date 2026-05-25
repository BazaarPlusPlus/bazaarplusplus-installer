# Installer Foundation Reorg

Status: Approved (Spec 1 of 3)
Date: 2026-05-25

## Context

The installer is mid-redesign. A new UI is being designed in Claude Design that
adds a dedicated Chronicle (战绩) page, drops the in-app Changelog and Settings
routes, folds FFmpeg into the install bundle (no separate step), and introduces
a persistent left NavRail. The redesign also unifies header/footer/tag systems
and moves the reset-history modal from the installer to the Chronicle page.

That redesign will land in three specs. This is **Spec 1 — Foundation**. Its
job is to reshape the code so Specs 2 and 3 can land cleanly, and to delete
the surfaces the redesign has already obsoleted (the Changelog route, the
Settings stub, and their nav entries). The active install/repair/uninstall
flow, the Stream page, and the About page render and behave exactly as they do
today.

The structural model is borrowed from
[ansxuman/Clauge](https://github.com/ansxuman/Clauge), which uses the same
SvelteKit + Svelte 5 + Tauri v2 stack and co-locates each feature's UI, state,
types, and command wrappers under `src/lib/<feature>/` with cross-cutting UI at
`src/lib/components/<area>/`. The Rust side mirrors the same shape.

## Goals

- The active product surface (Install, Stream, About) renders and behaves
  unchanged.
- Co-locate each feature's UI under its feature folder.
- Delete code the redesign has already obsoleted: the `/changelog` and
  `/settings` routes, their nav entries, and the lib/component files that
  exist only to serve them.
- Mirror the same feature shape on the Rust side.
- Land in one PR.

## Non-goals

- No NavRail, no Chronicle page, no visible UI changes — those are Spec 2.
- No removal of `InstallerFfmpegStep.svelte` — it moves but stays. Spec 2
  retires it when FFmpeg is bundled silently into the install action.
- No header/footer/tag unification — Spec 3.
- No about-page redesign — Spec 3.
- No Steam auto-launch behavior — separate later spec.

## Deletions

These are dead code or are unreferenced once their single consumer is removed.

| Path | Reason |
| --- | --- |
| `src/lib/updater.ts` | Zero importers. Live updater logic is in `src/lib/installer/updater-flow.ts` and `src/lib/installer/controllers/updater-controller.ts`. |
| `src/lib/whats-new.ts` and `.test.ts` | Only consumer is the changelog route, which is being removed. |
| `src/lib/whats-new-format.ts` and `.test.ts` | Same. |
| `src/lib/components/InstallerUpdateHighlights.svelte` | Only consumer is the changelog route. |
| `src/routes/changelog/` (entire folder) | Tutorial content has moved to `https://bazaarplusplus.com/tutorial`. The endpoint is already wired up in `src/lib/config/endpoints.ts`. |
| `src/routes/settings/` (entire folder) | The page is a stub with only a header and back button — no functional settings exist. |

Three call sites reference the deleted routes and need their entries trimmed:

- `src/lib/components/navigation/EmbeddedNav.svelte` — remove `/changelog` and
  `/settings` nav items.
- `src/lib/components/installer/InstallerHeader.svelte` — remove the
  `/settings` link.
- `src/lib/components/stream/StreamModePanel.svelte` — remove the `/settings`
  link.

Localization keys that refer to the deleted routes (`navChangelog`,
`navSettings`, and their copy) are removed from the i18n message tables. Any
keys that survive get migrated as part of the i18n move below.

## Frontend moves

```
src/lib/components/installer/*       → src/lib/installer/components/*
src/lib/components/stream/*          → src/lib/stream/components/*
src/lib/components/supporters/*      → src/lib/about/components/*
src/lib/components/shell/HomeStatusCard.svelte
                                     → src/lib/installer/components/HomeStatusCard.svelte
src/lib/home/summary.ts              → src/lib/installer/home-summary.ts
src/lib/home/summary.test.ts         → src/lib/installer/home-summary.test.ts
src/lib/i18n.ts                      → src/lib/i18n/index.ts
src/lib/locale.ts                    → src/lib/i18n/locale.ts
src/lib/locale.test.ts               → src/lib/i18n/locale.test.ts
```

After the moves, `src/lib/home/` is removed and `src/lib/components/shell/`
contains only `AppShell.svelte`.

All co-located test files travel with their source. Imports are rewritten
mechanically.

## Frontend after the move

```
src/lib/
  installer/                  # mod install + repair + uninstall + Tauri self-updater
    components/                 (← components/installer/* + HomeStatusCard.svelte)
    controllers/                (existing)
    selectors/                  (existing)
    api.ts, state.ts, storage.ts, runtime.ts, page-model.ts,
    detect-flow.ts, install-guards.ts, repair-errors.ts,
    ffmpeg-errors.ts, ffmpeg-step-bundle.ts, updater-flow.ts
    home-summary.ts             (← home/summary.ts)
    *.test.ts
  stream/                     # OBS overlay + replay records
    components/                 (← components/stream/*)
    api.ts, state.ts            (existing)
  about/                      # project info + supporters
    content.ts, page-model.ts   (existing)
    components/                 (← components/supporters/*)
  i18n/                       # locale machinery
    index.ts                    (← i18n.ts)
    locale.ts, locale.test.ts   (← locale.ts, locale.test.ts)
  bridge/                     # untouched
  config/                     # untouched
  generated/                  # untouched (auto-regenerated)
  components/                 # cross-cutting only
    AppModal.svelte
    LocaleToggle.svelte
    shell/AppShell.svelte
    navigation/EmbeddedNav.svelte   (now without /changelog or /settings entries)
  types.ts                    # cross-cutting shared types
```

Routes after the cut: `install/`, `stream/`, `about/`. No `changelog/`, no
`settings/`.

## Convention

After this reorg, the rule for placing a file is:

- Used by exactly one feature → live inside that feature's folder.
- Used by two or more features → live in `src/lib/components/<area>/` (UI) or
  in a dedicated infra folder at the top of `src/lib/` (state / utilities).

This applies to both UI components and TypeScript modules.

## Rust backend reshape

The frontend reshape is mirrored on the Rust side. The installer feature gets
its own root module under `src-tauri/src/installer/`:

```
src-tauri/src/commands/bepinex/        → src-tauri/src/installer/bepinex/
src-tauri/src/commands/detect/         → src-tauri/src/installer/detect/
src-tauri/src/commands/ffmpeg/         → src-tauri/src/installer/ffmpeg/
src-tauri/src/commands/game_process.rs → src-tauri/src/installer/game_process.rs
src-tauri/src/commands/startup.rs      → src-tauri/src/installer/startup.rs
src-tauri/src/commands/steam.rs        → src-tauri/src/installer/steam.rs
src-tauri/src/commands/vdf.rs          → src-tauri/src/installer/vdf.rs
src-tauri/src/installer_db/            → src-tauri/src/installer/db/

src-tauri/src/commands/stream.rs       → src-tauri/src/stream/commands.rs
src-tauri/src/config.rs                → src-tauri/src/shared/config.rs

src-tauri/src/commands/mod.rs          → deleted (empty after moves)
```

After the moves:

```
src-tauri/src/
  installer/        # mod install + repair + uninstall feature
    mod.rs            (new — re-exports submodule public surface)
    bepinex/          (← commands/bepinex/)
    detect/           (← commands/detect/)
    ffmpeg/           (← commands/ffmpeg/)
    db/               (← installer_db/)
    game_process.rs   (← commands/game_process.rs)
    startup.rs        (← commands/startup.rs)
    steam.rs          (← commands/steam.rs)
    vdf.rs            (← commands/vdf.rs)
  stream/           # OBS overlay + replay records (existing shape)
    mod.rs, server.rs, http.rs, state.rs,
    overlay_settings.rs, path_resolution.rs,
    records/, commands.rs (← commands/stream.rs)
  shared/           # cross-feature utilities
    config.rs         (← config.rs)
  lib.rs            # updated module declarations + tauri::generate_handler!
  main.rs
```

`src-tauri/src/lib.rs` is updated for:

- New `mod installer;`, `mod shared;`, removal of `mod commands;` and
  `mod installer_db;`.
- All `crate::commands::*` and `crate::installer_db::*` paths in
  `tauri::generate_handler!` and elsewhere → their new locations.

After the Rust moves, `npm run generate:bindings` is run and the resulting
`src/lib/generated/bindings/` is committed.

## Verification

Required before the PR opens:

- `npm run check` — svelte-check + svelte-kit sync + bindings generation must
  pass.
- `npm run test` — vitest + `cargo test --manifest-path src-tauri/Cargo.toml`
  must pass.
- `npm run prebuild-check` — Rust module moves can affect bindings and the
  bundled-resource manifest; this catches drift early.
- `./build.sh` — launch the dev app, click through `/install`, `/stream`,
  `/about`, and confirm no broken imports, no missing routes, no console
  errors.

`./build.sh --prod` is not required for this spec; nothing in packaging or
release behavior changes.

## Documentation

`docs/architecture.md` is rewritten in the same pass. Its current text
documents the pre-reorg layout (`src/lib/installer/*` separated from
`src/lib/components/*`, plus `changelog/` and `settings/` routes) and would be
stale the moment this PR lands. The rewrite describes the new convention, lists
each feature folder and what lives there, and points at the migration rule of
thumb in the Convention section above.

`docs/updater-release-plan.md` and `docs/combat-replay-ffmpeg-deployment.md`
are checked for any references to deleted paths and patched if needed; no
content changes beyond path fixes.

## Risks and rollback

- **Generated bindings drift.** The Rust module moves change ts-rs export
  paths. `npm run generate:bindings` is rerun and the result is committed; CI
  would flag drift.
- **Stale imports.** `npm run check` catches stale TS imports. Cargo build
  catches stale Rust imports. Both gate the PR.
- **Hidden consumers of deleted files.** Verified pre-spec:
  `src/lib/updater.ts` has zero importers (grep);
  `InstallerUpdateHighlights.svelte` and `whats-new*` are consumed only by
  `src/routes/changelog/`; `/settings` and `/changelog` link sites are listed
  above. Any new consumer added between spec approval and PR land will be
  caught by `npm run check`.

Rollback: revert the PR. No data migrations, no schema changes, no behavior
change.

## What this unblocks

- **Spec 2 — NavRail + Chronicle.** With features co-located, adding a new
  `src/lib/chronicle/` folder + `src/routes/chronicle/` route fits the
  established pattern. NavRail lives at `src/lib/components/shell/NavRail.svelte`
  alongside `AppShell.svelte`.
- **Spec 3 — Visual polish.** Header / footer / tag unification has a single
  place to land for shared chrome, and the about redesign edits a single
  feature folder.
