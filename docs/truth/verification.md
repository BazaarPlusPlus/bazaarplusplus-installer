---
status: truth
topic: verification
last-verified: 2bf15726776492127c3eca2162dd26306c3ab310
---

# Verification

Use the smallest command that verifies the changed behavior; use the authoritative gate before release work.

## Authoritative Gates

- `npm run verify` is the release-resource gate. `npm run verify -- --source-only` is the source-only gate for clean checkouts without private payloads, and `--release-platform <macos|windows>` narrows release payload validation to one platform in `scripts/verify.mjs:121-145`.
- The gate sequentially generates bindings while running the full Rust tests once, checks binding drift and formatting, type-checks TypeScript, runs Vitest, checks Rust formatting and the locked Cargo graph, runs strict Clippy and rustdoc, applies the selected prebuild guard, and builds the production frontend in `scripts/verify.mjs:16-89`. It stops on the first failure and returns that command's status in `scripts/verify.mjs:92-118`.
- Source CI runs the same gate on macOS and Windows with pinned Node/npm, npm and Cargo caches, `npm ci`, and an explicitly non-release Tauri resource fixture in `.github/workflows/verify.yml:11-47`. Real payload validation is a separately dispatched, release-environment job in `.github/workflows/release-resources.yml:26-73`.

## Common Commands

- `npm run check` regenerates bindings and runs `tsc --noEmit`; `npm run test` generates bindings while running all Rust tests once, checks drift, then runs Vitest; and `npm run prebuild-check` generates bindings before the release prebuild guard in `package.json:12-35`.
- `npm run build` generates bindings once, then runs the release prebuild guard, TypeScript check, and Vite production build in `package.json:22-24`.
- A direct Tauri build invokes that guarded `npm run build` hook in `src-tauri/tauri.conf.json:6-11`. The already-verified release path adds `src-tauri/tauri.release.conf.json`, which disables only the duplicate hook in `src-tauri/tauri.release.conf.json:1-5`, before building and bundling in `build.sh:607-653`.
- `./build.sh --prod` runs version synchronization, deterministic resource preparation, and `npm run verify -- --release-platform <platform>` before Tauri packaging in `build.sh:450-457` and `build.sh:721-736`.

## Generated Binding Guard

- Standalone generation runs one locked filtered Cargo test; the verification/test variant runs the full locked Rust suite in that same binding-export invocation in `scripts/generate-bindings.mjs:91-125`.
- Generation normalizes and validates a temporary result before atomically replacing `src/types/generated` in `scripts/generate-bindings.mjs:20-89`; the prebuild guard then fails on any generated-directory git drift without regenerating it in `scripts/prebuild-check.mjs:100-125`.
- Generator tests verify atomic replacement, missing/empty artifact failures, and preservation of the prior artifact when its backup rename fails in `scripts/generate-bindings.test.mjs:11-100`; orchestration tests verify one binding step and original failure-code propagation in `scripts/verify.test.mjs:5-64`.

## Build Incrementality

- The macOS build script watches both trampoline source and output, but invokes arm64 `clang -O2` only when the output is absent or older than the source in `src-tauri/build.rs:16-57`.
- The missing, source-newer, and output-fresh decisions are covered through the pure timestamp seam in `src-tauri/tests/trampoline_build_support.rs:6-36`.

## Architecture Behavior Tests

- Selected installation priority and invalid-explicit-path preservation are tested without Tauri state in `src-tauri/src/services/selected_game_installation.rs:138-231`.
- The complete install operation tests payload classification, fresh/changed installs, current-install no-op, launch-mode-only repair, production ordering, first-error truncation, and refreshed outcomes through its private effect boundary in `src-tauri/src/services/install/operation.rs:165-289`.
- Stream runtime tests exercise concurrent ensure, lifecycle transitions, failed start, and exclusive maintenance blocking in `src-tauri/src/stream/runtime.rs:440-572`.
- The History facade's tempfile tests classify cleanup preview/execute failures into semantic operation parameters and use a real SQLite schema plus managed files across queries, reveal/delete, and both cleanup scopes in `src-tauri/src/services/history.rs:621-659` and `src-tauri/src/services/history.rs:675-781`.
- Focused Stream capability tests cover independently completing initialization, crop degradation without global failure, stale polling and recovery, scoped operations/problems, bilingual problem presentation, and locale changes without workflow restart in `src/features/stream/streamCapabilityState.test.ts:109-249`. Workflow lifecycle tests cover poll response ordering (including older failures), restart invalidation, authoritative runtime errors, semantic notices, target-scoped one-off failures, disposal/replay, and both command adapters in `src/features/stream/streamWorkflow.test.ts:116-307`.
- Stream native semantic classification is pinned at the command boundary in `src-tauri/src/commands/stream.rs:94-139`, and native adapter preservation is covered in `src/api/commandClient.dispatch.test.ts:78-96`.
- Semantic-problem serialization plus History list/detail/action classification are covered at the Rust boundary in `src-tauri/src/problem.rs:42-84` and `src-tauri/src/services/history.rs:546-622`; the native adapter preservation path is covered in `src/api/commandClient.dispatch.test.ts:39-55`.
- Focused History tests cover exclusive empty/error/content transitions, refresh-data preservation, stale completions, stopped/failed preview capability, bilingual problem presentation, and locale-aware dates in `src/features/history/historyPageState.test.ts:46-108`, `src/features/history/historyPreview.test.ts:5-49`, `src/features/history/historyProblems.test.ts:17-30`, and `src/features/history/format.test.ts:4-19`.
- Run Detail tests cover its four page states, preserved refresh failure, stale completion, global action gate, target-scoped retry, and bilingual semantic problem presentation in `src/features/history/runDetailPageState.test.ts:56-187` and `src/features/history/runDetailProblems.test.ts:6-39`. Shared confirmation tests cover idle and active Escape/backdrop/close/secondary behavior for blocked, detachable, and genuinely cancelable policies in `src/components/ui/ConfirmDialog.test.tsx:104-205`; the confirmed-operation tests cover blocked dismissal, repeat submission, success-only closure, retained failure, retry, and cleanup/reset/delete targets in `src/features/shared/confirmedOperation.test.ts:15-96`.
- Cleanup semantic presentation and native-adapter preservation are covered in `src/features/history/storageCleanupProblems.test.ts:8-30` and `src/api/commandClient.dispatch.test.ts:97-118`; neither test treats diagnostics as user-facing copy.
- Install tests cover explicit initial detection, preserved refresh failure and retry, each primary-action branch, shared disabled/loading derivation, bilingual semantic warnings/problems, partial-failure recovery parameters, and native-adapter preservation in `src/features/install/installPageState.test.ts:43-228`, `src/features/install/installProblems.test.ts:10-89`, and `src/api/commandClient.dispatch.test.ts:57-76`. Rust tests pin Install semantic serialization and service-boundary classification in `src-tauri/src/problem.rs:46-84` and `src-tauri/src/services/install/mod.rs:282-366`.
- Modal-coordinator tests cover strict priority, equal-priority FIFO, queued-source unregistration, non-preempting update/support dialogs, active confirmation upgrades, critical preemption, and connected/fallback focus restoration in `src/features/shared/modalCoordinator.test.ts:17-110`. The shell/route integration case covers a routed confirmation upgrading to blocked critical work, route-source unmount, and ordered handoff to update then payment in `src/features/shared/modalCoordinator.integration.test.ts:4-40`; controlled disclosure semantics are rendered in `src/layouts/ShellHeader.test.tsx:88-100`.
- Updater state tests cover manual/silent checks, mutually consistent phases, determinate/indeterminate progress, download-versus-install classification, fresh-handle retry, blocked dismissal, restart failure retention, and recovery in `src/features/about/updater.test.ts:58-353`. Presentation tests cover shared header/modal derivation and confirmation collision in `src/features/about/updaterPresentation.test.ts:15-111`; bilingual semantic presentation and optional diagnostics are covered in `src/features/about/updaterProblems.test.ts:10-53`, while modal markup tests cover progress ARIA and manual restart recovery in `src/layouts/ShellUpdateModal.test.tsx:33-89`.

## Version And Platform Guards

- `package.json` is the source version. The snapshot reads both package-lock version locations plus Tauri, Cargo.toml, and Cargo.lock in `scripts/version-sync.mjs:33-103` and `scripts/version-sync.mjs:166-198`.
- Platform coherence parses the real Tauri overlays and rejects drift in bundle targets, resource ZIP mappings, or target layout in `scripts/release-platforms.mjs:118-151`.
