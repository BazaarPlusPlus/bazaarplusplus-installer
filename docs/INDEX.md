# Documentation Index

Current truth lives in root `CONTEXT.md` and `docs/truth/`. Read `docs/archive/` only for historical context, and re-verify any claim against code before using it.

Last consolidation audit: `2026-06-11` on `7b18f73d4718d3e1406de9f526d1fbba09ac567f` (record: `docs/archive/2026-06-11-doc-consolidation-audit.md`).

## Current Manifest

| Path | Topic | Status | Last verified |
| --- | --- | --- | --- |
| `AGENTS.md` | agent instructions symlink to `CLAUDE.md` | operational | 2026-06-11 |
| `CLAUDE.md` | agent instructions | operational | 2026-06-11 |
| `README.md` | project entrypoint | current-entrypoint | 2026-06-11 |
| `.trae/rules/git-commit-message.md` | ignored local rule | ignored-operational | n/a |
| `docs/INDEX.md` | documentation manifest | manifest | 2026-07-11 |
| `CONTEXT.md` | entry map + glossary | truth | `86e18d23d3f05dc15c71e762aac689f791aa1ebe` |
| `docs/truth/architecture.md` | architecture | truth | `386734973e69736d18e3c4a9417183a04994da33` |
| `docs/truth/frontend.md` | frontend | truth | `aaf01075c3e52acdd7940f3a41a4858c60dd851b` |
| `docs/truth/install-reset.md` | install-reset | truth | `386734973e69736d18e3c4a9417183a04994da33` |
| `docs/truth/launch-modes.md` | launch-modes | truth | `3d0c8c833169adde35bc9bca770ecc8b56fa8271` |
| `docs/truth/history-stream.md` | history-stream | truth | `c811ba4e0b25c72792487bbe80e5d3b3094637a3` |
| `docs/truth/updater-release.md` | updater-release | truth | `386734973e69736d18e3c4a9417183a04994da33` |
| `docs/truth/verification.md` | verification | truth | `386734973e69736d18e3c4a9417183a04994da33` |
| `docs/plans/manual-validation.md` | manual-validation | active-plan | `386734973e69736d18e3c4a9417183a04994da33` |
| `docs/agents/issue-tracker.md` | agent skills: issue tracker | operational | 2026-07-11 |
| `docs/agents/triage-labels.md` | agent skills: triage labels | operational | 2026-07-11 |
| `docs/agents/domain.md` | agent skills: domain doc rules | operational | 2026-07-11 |
| `docs/adr/001-documentation-truth-boundaries.md` | documentation-truth-boundaries | decision (path amended by 009) | n/a |
| `docs/adr/002-in-app-updater.md` | in-app-updater | decision | n/a |
| `docs/adr/003-macos-launch-trampoline.md` | macos-launch-trampoline | decision | n/a |
| `docs/adr/004-steam-and-tempo-launch-flows.md` | steam-tempo-launch | superseded-by-006 | n/a |
| `docs/adr/005-reset-local-data-contract.md` | reset-local-data | decision | n/a |
| `docs/adr/006-steam-only-launch.md` | steam-only-launch | decision | n/a |
| `docs/adr/007-steam-branch-switch.md` | steam-branch-switch | superseded-removed | n/a |
| `docs/adr/008-command-names-artifact.md` | command-names-artifact | decision | n/a |
| `docs/adr/009-agent-skills-doc-layout.md` | agent-skills-doc-layout | decision | n/a |
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
| `docs/archive/2026-06-11-doc-consolidation-audit.md` | consolidation audit record | historical-record | archived 2026-07-11 |
| `docs/archive/2026-07-03-steam-branch-switch.md` | steam-branch-switch (forensics) | superseded-by-007 | archived 2026-07-03 |
| `docs/archive/2026-07-03-steam-branch-switch-impl.md` | steam-branch-switch-impl (plan) | reverted-removed | archived 2026-07-04 |
| `docs/archive/2026-07-02-payload-ownership-hardening.md` | payload-ownership (plan) | implemented | archived 2026-07-02 |
| `docs/archive/2026-07-02-storage-cleanup.md` | storage-cleanup (plan) | implemented | archived 2026-07-11 |

## Pending Decisions

- Platform validation: macOS 27+ trampoline, macOS <= 26 opt-in, and Windows updater restart need real-environment validation; see `docs/plans/manual-validation.md`.
- CSP: current code sets Tauri CSP to `null` in `src-tauri/tauri.conf.json:23-25`; decide whether a hardening change is desired before documenting a policy.
