# Documentation

This directory is split into two groups:

- Current documents: use these to understand how the repository works in the current codebase.
- Design records: historical specs and implementation plans that may describe intended or partial work.

## Current

Read these in this order when you need the current truth:

- [architecture.md](architecture.md): current code layout, feature boundaries, and known maintenance hotspots
- [updater-release-plan.md](updater-release-plan.md): current release and updater workflow

## Design Records

These files are still useful for context, but they should not be treated as the source of truth for current behavior.

- [superpowers/specs/2026-04-08-changelog-design.md](superpowers/specs/2026-04-08-changelog-design.md)
- [superpowers/specs/2026-04-10-home-shell-and-stream-mode-design.md](superpowers/specs/2026-04-10-home-shell-and-stream-mode-design.md)
- [superpowers/specs/2026-04-15-stream-battle-list-and-overlay-unification-design.md](superpowers/specs/2026-04-15-stream-battle-list-and-overlay-unification-design.md)
- [superpowers/specs/2026-04-17-installer-cohesion-refactor-design.md](superpowers/specs/2026-04-17-installer-cohesion-refactor-design.md)
- [superpowers/plans/2026-04-10-home-shell-and-stream-mode-implementation.md](superpowers/plans/2026-04-10-home-shell-and-stream-mode-implementation.md)
- [superpowers/plans/2026-04-17-installer-phase-1-1-records-split.md](superpowers/plans/2026-04-17-installer-phase-1-1-records-split.md)
- [superpowers/plans/2026-04-17-installer-phase-1-2-detect-split.md](superpowers/plans/2026-04-17-installer-phase-1-2-detect-split.md)
- [superpowers/plans/2026-04-17-installer-phase-1-3-bepinex-split.md](superpowers/plans/2026-04-17-installer-phase-1-3-bepinex-split.md)
- [superpowers/plans/2026-04-17-installer-phase-2-identity-restructure.md](superpowers/plans/2026-04-17-installer-phase-2-identity-restructure.md)
- [superpowers/plans/2026-04-17-installer-phase-3-page-model-selectors.md](superpowers/plans/2026-04-17-installer-phase-3-page-model-selectors.md)

## Documentation Rules

- Keep `docs/README.md` as the top-level index for the folder.
- Update `architecture.md` when a structural decision changes the current codebase.
- Keep design specs under `docs/superpowers/` as records, not living architecture docs.
- Prefer adding a small current-state note instead of rewriting historical design documents after implementation diverges.
