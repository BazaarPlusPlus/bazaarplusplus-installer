---
status: truth
topic: verification
last-verified: 8c5c3af5d844635b9c2b6ef9124fd7a951533e37
---

# Verification

Use the smallest command that verifies the changed behavior; use the authoritative gate before release work.

## Authoritative Gates

- `npm run verify` is the release-resource gate. `npm run verify -- --source-only` is the source-only gate for clean checkouts without private payloads, and `--release-platform <macos|windows>` narrows release payload validation to one platform, parsed by `parseCliArgs` in `scripts/verify.mjs`.
- The gate sequentially generates bindings while running the full Rust tests once, checks binding drift and formatting, type-checks TypeScript, runs Vitest, checks Rust formatting and the locked Cargo graph, runs strict Clippy and rustdoc, applies the selected prebuild guard, and builds the production frontend — the step list is `verificationSteps` in `scripts/verify.mjs`. `runVerification` in the same file stops on the first failure and returns that command's status.
- On Windows, `runVerification` in `scripts/verify.mjs` routes its `npm` steps through `ComSpec` as `cmd /d /s /c npm.cmd ...`, leaving non-npm steps untouched.

## Common Commands

- `npm run check` regenerates bindings and runs `tsc --noEmit`; `npm run test` generates bindings while running all Rust tests once, checks drift, then runs Vitest; and `npm run prebuild-check` generates bindings before the release prebuild guard — see the `check`, `test`, and `prebuild-check` scripts in `package.json`.
- The `verify:native-recorder-input` script in `package.json` checks the macOS VideoToolbox bundle, CoreAudio library, and Windows Media Foundation DLL against their pinned mod commit and exact artifact hashes, in `verifyNativeRecorderInput` in `scripts/native-recorder-input.mjs`; every release-platform prebuild invokes the same check from `runPrebuildCheck` in `scripts/prebuild-check.mjs`.
- `npm run build` generates bindings once, then runs the release prebuild guard, TypeScript check, and Vite production build — see the `build` and `build:after-bindings` scripts in `package.json`.
- A direct Tauri build invokes that guarded `npm run build` hook through `build.beforeBuildCommand` in `src-tauri/tauri.conf.json`. The already-verified release path adds `src-tauri/tauri.release.conf.json`, which disables only the duplicate hook (`build.beforeBuildCommand` set to `null`), before `build_prod` in `build.sh` builds and bundles.
- `./build.sh --prod` runs version synchronization, pinned-input verification, deterministic resource preparation, and `npm run verify -- --release-platform <platform>` before Tauri packaging, orchestrated by `run_release_prechecks` in `build.sh`. On macOS, `build_prod` additionally calls `prepare_signed_macos_resource_zip` in `build.sh`, which proves the VideoToolbox bundle input is ad hoc (`assert_ad_hoc_replay_recorder_input`), signs nested executables and bundles inside-out (`sign_macos_resource_app_bundles`, `sign_macos_resource_plugin_bundles`), and verifies the official Team ID (`assert_official_codesign_team_id` against `OFFICIAL_APPLE_TEAM_ID`, currently `9Z44S3N293`) before repacking the signed zip. The Tauri bundler then builds and notarizes the outer installer using the Apple API credentials that `load_macos_developer_id_env` in `build.sh` exported before `build_prod` ran.

## Generated Binding Guard

- Standalone generation runs one locked filtered Cargo test; the verification/test variant runs the full locked Rust suite in that same binding-export invocation, in `runGenerateBindings` in `scripts/generate-bindings.mjs`.
- Generation normalizes and validates a temporary result before atomically replacing `src/types/generated`, in `commitGeneratedBindings` (which calls `replaceDirectoryWithBackup`) in `scripts/generate-bindings.mjs`; the prebuild guard then fails on any generated-directory git drift without regenerating it, in `assertBindingsUpToDate` in `scripts/prebuild-check.mjs`.
- Generator tests verify atomic replacement, missing/empty artifact failures, and preservation of the prior artifact when its backup rename fails in `generate-bindings.test.mjs`; orchestration tests verify one binding step, original failure-code propagation, and the Windows `ComSpec` npm shim in `verify.test.mjs`.

## macOS Trampoline Build

- The macOS build script is the only place that compiles the trampoline stub; `build.sh` only signs the already-built binary at the path named by `MACOS_TRAMPOLINE_STUB`, via the `prepare_signed_macos_resource_binary` call inside `build_prod` (both in `build.sh`).
- Compilation passes `-mmacosx-version-min` from `MACOS_TRAMPOLINE_DEPLOYMENT_TARGET` (`"12.0"`, in `src-tauri/build_support.rs`) alongside `-arch arm64 -O2`, in `compile_macos_trampoline_stub` in `src-tauri/build.rs`, so the stub cannot inherit the build host SDK baseline and raise the game's own minimum macOS version.
- The script watches both trampoline source and output, and skips compilation only when the output is newer than the source *and* already carries the required deployment target — via `should_compile_trampoline` in `src-tauri/build_support.rs` and `has_required_macos_deployment_target` in `src-tauri/build.rs` — so a stale stub left by an earlier build is rebuilt rather than reused.
- Every freshly compiled stub is re-inspected and the build fails when the baseline is wrong, in `has_required_macos_deployment_target` in `src-tauri/build.rs`. The `otool -l` reading accepts the modern `LC_BUILD_VERSION` form (`platform 1` plus `minos`) and the legacy `LC_VERSION_MIN_MACOSX` form, in `has_macos_trampoline_deployment_target` in `src-tauri/build_support.rs`.
- The missing, source-newer, and output-fresh decisions are covered through the pure timestamp seam, and the accepted, rejected, and legacy load-command readings through the pure parsing seam, in `trampoline_build_support.rs`.

## Architecture Behavior Tests

- Selected-installation priority (explicit > selected > startup > fallback) and invalid-explicit-path rejection are tested against a bare `SelectedGameInstallationState`, with no Tauri handle, in `src-tauri/src/services/selected_game_installation.rs`.
- Install effect ordering — fresh/changed/no-op/bootstrap-repair payload states, the sole macOS trampoline sequence, first-error truncation, and the post-effect refresh — is pinned through the private `InstallEffects` trait and `execute_and_refresh` in `src-tauri/src/services/install/operation.rs`, with no filesystem or Tauri call involved. VDF tests in `src-tauri/src/services/vdf/tests.rs` pin arbitrary non-empty LaunchOptions detection, all-account clearing, nested-property isolation, and unavailable-config handling.
- `StreamRuntime` concurrency guarantees — a concurrent `ensure` starts exactly one task, lifecycle transitions keep snapshot and task state consistent, a failed start leaves no task behind, and `exclusive_maintenance` blocks other lifecycle calls without resuming them — are exercised against an in-memory `StreamServerAdapter` in `src-tauri/src/stream/runtime.rs`.
- `SemanticProblem`'s JSON shape (`code`/`params`/optional `diagnostic`) is pinned once in `src-tauri/src/problem.rs`; each domain then pins its own classification against that shape — Stream's `stream_service_problem`/`stream_window_problem`/`stream_crop_problem` in `src-tauri/src/commands/stream.rs`, History's read/schema/action classification in `src-tauri/src/services/history.rs`, and Install's reset/partial-failure classification in `src-tauri/src/services/install/mod.rs`. History also has one end-to-end test, `history_facade_owns_paths_queries_reveals_deletes_and_cleanup`, driving a real SQLite schema and on-disk screenshot/video files through list, reveal, delete, and both cleanup scopes.
- Frontend features pair an ordering test (stale/older responses ignored, single-flight action gates, refresh failure keeps prior data) with a bilingual presentation test (Chinese and English copy differ from the raw semantic code and from each other) across Stream (`streamCapabilityState`/`streamWorkflow`), History (`historyPageState`/`historyProblems`/`historyPreview`/`format`), Run Detail (`runDetailPageState`/`runDetailProblems`), Install (`installWorkflow`/`installProblems`), and About/Updater (`appBootstrap`/`aboutProblems`, `updater`/`updaterPresentation`/`updaterProblems`/`mainlandDownload`/`ShellUpdateModal`). Where the underlying problem carries a diagnostic — `updaterProblems.test.ts`, `aboutProblems.test.ts`, and `storageCleanupProblems.test.ts` — the presentation test additionally asserts it never leaks into the localized copy.
- The native command adapter turns a rejected `invoke()` into a typed `SemanticProblemError` that still carries `code`/`params`/`diagnostic`; this is pinned once per domain (History, Install, Stream, and cleanup) in `commandClient.dispatch.test.ts`.
- Shared dialog and confirmation behavior is tested independent of any one feature: `ConfirmDialog.test.tsx` covers idle-vs-active Escape/backdrop/close/secondary dismissal across blocked, detachable, and genuinely cancelable policies; `confirmedOperation.test.ts` covers the blocked/retry/success lifecycle reused by cleanup, reset, and delete-video targets; `modalCoordinator.test.ts` plus its `.integration.test.ts` cover strict priority ordering, equal-priority FIFO, an active confirmation escalating to blocked critical work, and focus restoration after a source unmounts; `ShellHeader.test.tsx` separately covers the header's keyboard-operable disclosure semantics (`aria-expanded`/`aria-controls`).

## Version And Platform Guards

- `package.json` is the source version. The snapshot reads both package-lock version locations plus Tauri, Cargo.toml, and Cargo.lock, in `collectVersionSnapshot` in `scripts/version-sync.mjs`.
- Platform coherence parses the real Tauri overlays and rejects drift in bundle targets, resource ZIP mappings, or target layout, in `assertPlatformCoherence` in `scripts/release-platforms.mjs`.
