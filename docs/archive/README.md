---
status: superseded
topic: documentation-index
archived: 2026-06-11
superseded-by: docs/INDEX.md
---
# Documentation

This directory contains the current project documents. Deleted historical design records should not be treated as project truth.

## Current

Read these in this order when you need the current truth:

- [architecture.md](architecture.md): current code layout, feature boundaries, and data boundaries
- [updater-release-plan.md](updater-release-plan.md): current release and updater workflow
- [native-feel-review.md](native-feel-review.md): point-in-time native-feel/UX review of the frontend (stamped to `master` @ `2d05f9e`, 2026-06-05); a dated assessment, not perpetual truth — re-verify line citations before acting

## Documentation Rules

- Keep `docs/README.md` as the top-level index for the folder.
- Update `architecture.md` when a structural decision changes the current codebase.
- Delete stale implementation plans and design records instead of keeping them as competing sources of truth.
