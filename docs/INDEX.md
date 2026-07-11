# Documentation Index

Current truth lives only in `docs/truth/`. Read `docs/archive/` only for historical context, and re-verify any claim against code before using it.

Last consolidation audit: `2026-06-11` on `7b18f73d4718d3e1406de9f526d1fbba09ac567f`.

## Current Manifest

| Path | Topic | Status | Last verified |
| --- | --- | --- | --- |
| `AGENTS.md` | agent instructions symlink to `CLAUDE.md` | operational | 2026-06-11 |
| `CLAUDE.md` | agent instructions | operational | 2026-06-11 |
| `README.md` | project entrypoint | current-entrypoint | 2026-06-11 |
| `.trae/rules/git-commit-message.md` | ignored local rule | ignored-operational | n/a |
| `docs/INDEX.md` | documentation manifest | manifest | 2026-06-11 |
| `docs/truth/overview.md` | overview | truth | `7b18f73d4718d3e1406de9f526d1fbba09ac567f` |
| `docs/truth/architecture.md` | architecture | truth | `a1461386ca7417a0fab4eff812fccdaef5420cec` |
| `docs/truth/frontend.md` | frontend | truth | `aaf01075c3e52acdd7940f3a41a4858c60dd851b` |
| `docs/truth/install-reset.md` | install-reset | truth | `aaf01075c3e52acdd7940f3a41a4858c60dd851b` |
| `docs/truth/launch-modes.md` | launch-modes | truth | `3d0c8c833169adde35bc9bca770ecc8b56fa8271` |
| `docs/truth/history-stream.md` | history-stream | truth | `c811ba4e0b25c72792487bbe80e5d3b3094637a3` |
| `docs/truth/updater-release.md` | updater-release | truth | `8c9c6a4e0e337f7b7230b8936f9e8edd0d24cfd1` |
| `docs/truth/verification.md` | verification | truth | `8c9c6a4e0e337f7b7230b8936f9e8edd0d24cfd1` |
| `docs/plans/manual-validation.md` | manual-validation | active-plan | `7b18f73d4718d3e1406de9f526d1fbba09ac567f` |
| `docs/decisions/001-documentation-truth-boundaries.md` | documentation-truth-boundaries | decision | n/a |
| `docs/decisions/002-in-app-updater.md` | in-app-updater | decision | n/a |
| `docs/decisions/003-macos-launch-trampoline.md` | macos-launch-trampoline | decision | n/a |
| `docs/decisions/004-steam-and-tempo-launch-flows.md` | steam-tempo-launch | superseded-by-006 | n/a |
| `docs/decisions/005-reset-local-data-contract.md` | reset-local-data | decision | n/a |
| `docs/decisions/006-steam-only-launch.md` | steam-only-launch | decision | n/a |
| `docs/decisions/007-steam-branch-switch.md` | steam-branch-switch | superseded-removed | n/a |
| `docs/archive/README.md` | old documentation index | superseded | archived 2026-06-11 |
| `docs/archive/architecture.md` | old architecture doc | superseded | archived 2026-06-11 |
| `docs/archive/updater-release-plan.md` | old updater release doc | superseded | archived 2026-06-11 |
| `docs/archive/native-feel-review.md` | native-feel audit | implemented | archived 2026-06-11 |
| `docs/archive/architecture-audit-2026-06-05.md` | architecture audit | implemented | archived 2026-06-11 |
| `docs/archive/macos27-bepinex-launch-trampoline.md` | macOS trampoline plan | implemented | archived 2026-06-11 |
| `docs/archive/superpowers/specs/2026-05-31-installer-product-surfaces-design.md` | product surface design | implemented | archived 2026-06-11 |
| `docs/archive/2026-06-06-installer-auto-update-restore-design.md` | auto-update design | implemented | archived 2026-06-11 |
| `docs/archive/superpowers/plans/2026-06-10-tempo-native-launch.md` | Tempo launch plan | implemented | archived 2026-06-11 |
| `docs/archive/superpowers/plans/2026-06-10-reset-local-data-ux.md` | reset local data plan | implemented | archived 2026-06-11 |
| `docs/archive/2026-07-03-steam-branch-switch.md` | steam-branch-switch (forensics) | superseded-by-007 | archived 2026-07-03 |
| `docs/archive/2026-07-03-steam-branch-switch-impl.md` | steam-branch-switch-impl (plan) | reverted-removed | archived 2026-07-04 |

## Original Inventory

| Original path | Type | Last commit date | Inbound references found before consolidation |
| --- | --- | --- | --- |
| `AGENTS.md` | agent instructions symlink | 2026-06-01 | none |
| `CLAUDE.md` | agent instructions target | 2026-06-04 | self-reference; `docs/architecture-audit-2026-06-05.md`; `docs/superpowers/plans/2026-06-10-tempo-native-launch.md` |
| `README.md` | project README | 2026-06-01 | `README.md`; `docs/README.md` |
| `docs/README.md` | documentation index | 2026-06-07 | `README.md`; `docs/README.md` |
| `docs/architecture.md` | architecture doc | 2026-06-07 | `README.md`; `docs/architecture-audit-2026-06-05.md`; product/update specs |
| `docs/updater-release-plan.md` | release doc | 2026-06-05 | `docs/README.md`; `docs/architecture-audit-2026-06-05.md`; auto-update spec |
| `docs/native-feel-review.md` | dated UX audit | 2026-06-05 | `docs/README.md`; `docs/architecture-audit-2026-06-05.md` |
| `docs/architecture-audit-2026-06-05.md` | architecture audit/plan | 2026-06-07 | none |
| `docs/macos27-bepinex-launch-trampoline.md` | macOS launch plan | 2026-06-09 | none |
| `docs/superpowers/specs/2026-05-31-installer-product-surfaces-design.md` | product design spec | 2026-06-07 | none |
| `docs/superpowers/specs/2026-06-06-installer-auto-update-restore-design.md` | updater design spec | 2026-06-07 | none |
| `docs/superpowers/plans/2026-06-10-tempo-native-launch.md` | implementation plan | 2026-06-10 | none |
| `docs/superpowers/plans/2026-06-10-reset-local-data-ux.md` | implementation plan | untracked before audit | none |
| `.trae/rules/git-commit-message.md` | ignored local rule | ignored/untracked | none |

## Consolidation Map

| Original path | Verdict | Confidence | Evidence | Disposition |
| --- | --- | --- | --- | --- |
| `AGENTS.md` | ACTIVE | high | symlink target `CLAUDE.md`; repo instruction source | kept; conventions appended through `CLAUDE.md` |
| `CLAUDE.md` | ACTIVE | high | repo instruction source | kept and appended |
| `README.md` | PARTIAL | high | stale documentation links and macOS limitation contradicted by `src-tauri/src/services/macos_version.rs:51-80` and trampoline code | updated in place |
| `docs/README.md` | OBSOLETE | high | old index pointed to moved docs | moved to `docs/archive/README.md` |
| `docs/architecture.md` | PARTIAL | high | current app shape verified by `package.json:2-21`, `src-tauri/tauri.conf.json:3-35`, `src-tauri/src/lib.rs:18-74` | distilled into `docs/truth/architecture.md`, then archived |
| `docs/updater-release-plan.md` | PARTIAL | high | updater and release flow verified by `src/features/about/updater.ts:6-240`, `build.sh:486-565`, `scripts/generate-latest-manifest.mjs:5-89` | distilled into `docs/truth/updater-release.md`, then archived |
| `docs/native-feel-review.md` | IMPLEMENTED/PARTIAL | medium | native-feel fixes verified by `src/styles/index.css:42-148`, `src/layouts/GlobalShell.tsx:31-52`, `src/layouts/ShellUpdateModal.tsx:40-194`; CSP still `null` in `src-tauri/tauri.conf.json:23-25` | verified current claims distilled into `docs/truth/frontend.md`; archive retained; CSP pending in `docs/plans/manual-validation.md` |
| `docs/architecture-audit-2026-06-05.md` | IMPLEMENTED/PARTIAL | medium | multiple old P0/P1 items verified in current updater, stream, reset, and build code; platform/manual claims not executable in this audit | distilled into truth docs; manual validation gaps kept in `docs/plans/manual-validation.md`; archived |
| `docs/macos27-bepinex-launch-trampoline.md` | IMPLEMENTED/PARTIAL | medium | implementation verified by `src-tauri/src/services/macos_version.rs:51-80`, `src-tauri/src/services/bepinex/trampoline.rs:384-525`, `src-tauri/src/services/install/mod.rs:67-88` | distilled into `docs/truth/launch-modes.md` and decision 003; live platform validation remains planned |
| `docs/superpowers/specs/2026-05-31-installer-product-surfaces-design.md` | IMPLEMENTED/SUPERSEDED | high | current surfaces verified by `src/pages/Install.tsx:52-85`, `src/pages/History.tsx:34-157`, `src/pages/RunDetail.tsx:65-285` | distilled into `docs/truth/frontend.md`; archived |
| `docs/superpowers/specs/2026-06-06-installer-auto-update-restore-design.md` | IMPLEMENTED | high | in-app updater verified by `src/features/about/updater.ts:6-240`, `src/layouts/ShellUpdateModal.tsx:23-194`, `src-tauri/capabilities/default.json:6-11` | distilled into `docs/truth/updater-release.md` and decision 002; archived |
| `docs/superpowers/plans/2026-06-10-tempo-native-launch.md` | IMPLEMENTED/PARTIAL | medium | launch flow verified by `src-tauri/src/services/install/mod.rs:177-210`, `src-tauri/src/services/tempo.rs:115-240`, frontend cancel/status in `src/features/install/useInstallPage.ts:135-248` | distilled into `docs/truth/launch-modes.md` and decision 004; live platform validation remains planned |
| `docs/superpowers/plans/2026-06-10-reset-local-data-ux.md` | IMPLEMENTED | high | typed reset and UI verified by `src-tauri/src/services/install/types.rs:19-24`, `src/features/install/ResetDataConfirmModal.tsx:71-105`, `src-tauri/src/services/bepinex/mod.rs:25-69` | distilled into `docs/truth/install-reset.md` and decision 005; archived |
| `.trae/rules/git-commit-message.md` | ACTIVE | medium | ignored local rule file; not part of tracked docs | kept in place; listed only |

## Pending Decisions

- Platform validation: macOS 27+ trampoline, macOS <= 26 opt-in, and Windows updater restart need real-environment validation; see `docs/plans/manual-validation.md`.
- CSP: current code sets Tauri CSP to `null` in `src-tauri/tauri.conf.json:23-25`; decide whether a hardening change is desired before documenting a policy.
