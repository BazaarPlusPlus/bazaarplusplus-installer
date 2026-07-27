# Documentation Index

Current truth lives in root `CONTEXT.md` and `docs/truth/`. Read `docs/archive/` only for historical context, and re-verify any claim against code before using it.

Last consolidation audit: `2026-06-11` on `7b18f73d4718d3e1406de9f526d1fbba09ac567f` (record: `docs/archive/2026-06-11-doc-consolidation-audit.md`).

Last full citation verification: `2026-07-11` on `4366cda394fe304066b55564c3c44d1f917a2273` — every `file:line` claim in `CONTEXT.md`, `docs/truth/`, and `docs/plans/manual-validation.md` checked against code; stale line ranges corrected in `launch-modes.md`, `history-stream.md`, and `manual-validation.md`.

Architecture deepening citation refresh: `2026-07-18` on `7500016b1c4adfc7b5d0206c7def0ceabae514d5` — `CONTEXT.md`, the six affected truth topics, and the retained manual-validation items were checked against the final implementation and review fixes.

Build workflow citation refresh: `2026-07-18` on `45764680a4476063a46a92f4606dd520f0ce29ef` — the verification and updater-release truth topics were checked against the hardened build, resource, CI, and artifact-manifest implementation.

History page-state citation refresh: `2026-07-19` on `b07adb2e67f03480d039352837037c25a75f3472` — the context glossary plus architecture, frontend, History/Stream, and verification topics were checked against the semantic-problem and independent History loading implementation after review fixes.

Run Detail page-state citation refresh: `2026-07-19` on `68f2b1ef20e7c1c5c789bd5cde34821cf28efd57` — the context glossary plus architecture, frontend, History/Stream, and verification topics were checked against the nullable-detail, semantic-action, preserved-refresh, and single-flight implementation.

Install page-state citation refresh: `2026-07-19` on `f23d786ab3bf1998f556f5fe05b6e47467a7ea48` — the context glossary plus architecture, frontend, Install/Reset, Launch Modes, and verification topics were checked against completed native detection, semantic Install problems, preserved refresh state, and the single derived primary action.

Stream capability citation refresh: `2026-07-19` on `5bbe32c870bc06e35e5064f3c8403ff22b359d32` — the context glossary plus architecture, frontend, History/Stream, and verification topics were checked against the independent Stream capability states, stale polling contract, semantic problem presentation, and locale-stable workflow lifecycle.

Destructive-operation citation refresh: `2026-07-19` on `0f609de844c0cbc48e7fb53396a90d5f32776c2b` — the context glossary plus architecture, frontend, Install/Reset, History/Stream, and verification topics were checked against the target-bearing confirmation lifecycle, explicit active dismissal policies, retained semantic failures, and cleanup semantic native contract.

Modal-coordination citation refresh: `2026-07-19` on `838d5d6bf30e16a277e5b367b648333e8923759a` — the context glossary plus architecture, frontend, updater, and verification topics were checked against the global modal priority queue, source lifecycle, dismissal policy, focus restoration, and controlled shell disclosures.

Updater-recovery citation refresh: `2026-07-19` on `2bf15726776492127c3eca2162dd26306c3ab310` — the context glossary plus architecture, frontend, updater, and verification topics were checked against the explicit updater snapshot, semantic problems, shared header/modal presentation, accessible progress, and manual restart recovery.

About-bootstrap citation refresh: `2026-07-19` on `506e85b363a53511d14a44db22804a53331f2c03` — the context glossary plus architecture, frontend, and verification topics were checked against the explicit bootstrap resource states, packaged fallback provenance, semantic recovery, and accessible About feedback.

UI redesign integration citation refresh: `2026-07-19` on `3fd7a24bb6e734f5c50a69d3a69144e21d52fae9` — `CONTEXT.md` plus the architecture and frontend truth topics were checked against the fixed platform window chrome, refined `bpp-*` surfaces, Install maintenance update placement, and preserved master state-machine integrations.

UI redesign standards follow-up: `2026-07-19` on `2af743045b72631519a11dadea4b474c903519bd` — the architecture, Install/Reset, History/Stream, Updater/Release, and verification truth topics were rechecked after the portability fix and final standards review.

UI consistency citation refresh: `2026-07-19` on `a2c197e7fcd8fe21ed07482bd8db8c787a91c29c` — the frontend truth was rechecked against the semantic token/control system, grouped Header, guided History empty state, and restructured Stream presentation after final visual and automated verification.

Install workflow deep-module citation refresh: `2026-07-27` on `e0fa9a649114ddcab7409c2c86ebade41372cec7` — the context glossary plus architecture, frontend, Install/Reset, updater, and verification topics were checked against the framework-neutral Install workflow, React adapter, and black-box workflow tests after vertical replacement.

UX copy/layout citation refresh: `2026-07-27` on `c56cac3a94fea48f6711c45a5139cab3bc7322d8` — `CONTEXT.md`, all seven truth topics, and the manual-validation plan were re-verified after the eight UX PRs (#55–#62): localized eyebrows and window controls, maintenance danger signals with a confirmed uninstall, state-contradiction copy fixes, close-to-tray discoverability, the About check-update entry, accessibility hit targets, visual-system consolidation, and the terminology sweep. Dangling pre-squash `last-verified` stamps on frontend, install-reset, and verification were replaced with the master commit.

## Current Manifest

| Path | Topic | Status | Last verified |
| --- | --- | --- | --- |
| `AGENTS.md` | agent instructions symlink to `CLAUDE.md` | operational | 2026-06-11 |
| `CLAUDE.md` | agent instructions | operational | 2026-06-11 |
| `README.md` | project entrypoint | current-entrypoint | 2026-07-11 |
| `.trae/rules/git-commit-message.md` | ignored local rule | ignored-operational | n/a |
| `docs/INDEX.md` | documentation manifest | manifest | 2026-07-27|
| `CONTEXT.md` | entry map + glossary | truth | `c56cac3a94fea48f6711c45a5139cab3bc7322d8` |
| `docs/truth/architecture.md` | architecture | truth | `c56cac3a94fea48f6711c45a5139cab3bc7322d8` |
| `docs/truth/frontend.md` | frontend | truth | `c56cac3a94fea48f6711c45a5139cab3bc7322d8` |
| `docs/truth/install-reset.md` | install-reset | truth | `c56cac3a94fea48f6711c45a5139cab3bc7322d8` |
| `docs/truth/launch-modes.md` | launch-modes | truth | `c56cac3a94fea48f6711c45a5139cab3bc7322d8` |
| `docs/truth/history-stream.md` | history-stream | truth | `c56cac3a94fea48f6711c45a5139cab3bc7322d8` |
| `docs/truth/updater-release.md` | updater-release | truth | `c56cac3a94fea48f6711c45a5139cab3bc7322d8` |
| `docs/truth/verification.md` | verification | truth | `c56cac3a94fea48f6711c45a5139cab3bc7322d8` |
| `docs/plans/manual-validation.md` | manual-validation | active-plan | `c56cac3a94fea48f6711c45a5139cab3bc7322d8` |
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
| `docs/adr/008-command-names-artifact.md` | command-names-artifact | superseded-by-010 | n/a |
| `docs/adr/009-agent-skills-doc-layout.md` | agent-skills-doc-layout | decision | n/a |
| `docs/adr/010-tauri-specta-command-bindings.md` | tauri-specta-command-bindings | decision | n/a |
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
| `docs/archive/2026-07-18-architecture-deepening.md` | architecture-deepening (plan) | implemented | `7500016b1c4adfc7b5d0206c7def0ceabae514d5` |
| `docs/archive/2026-07-19-ui-consistency-refactor.md` | ui-consistency-refactor (plan) | implemented | `a2c197e7fcd8fe21ed07482bd8db8c787a91c29c` |

## Pending Decisions

- Platform validation: macOS 27+ trampoline, macOS <= 26 opt-in, and Windows updater restart need real-environment validation; see `docs/plans/manual-validation.md`.
- CSP: current code sets Tauri CSP to `null` in `src-tauri/tauri.conf.json:23-25`; decide whether a hardening change is desired before documenting a policy.
