---
status: truth
topic: verification
last-verified: 7500016b1c4adfc7b5d0206c7def0ceabae514d5
---

# Verification

Use the smallest command that verifies the changed behavior.

## Common Commands

- `npm run check` regenerates bindings and runs TypeScript without emit in `package.json:19-20`.
- `npm run test:unit` runs Vitest in `package.json:15-16`.
- `npm run test:rust` runs Cargo tests against `src-tauri/Cargo.toml` in `package.json:14-14`.
- `npm run test` runs generated bindings, Rust tests, and unit tests in `package.json:13-15`.
- `npm run prebuild-check` runs the release prebuild checker in `package.json:10-10`.
- `./build.sh --prod` is the release-oriented bundle path; `run_release_prechecks` performs version sync in `build.sh:480-482`, and Tauri's `beforeBuildCommand` runs the single prebuild check before the frontend build in `src-tauri/tauri.conf.json:7-10`.

## Generated Binding Guard

- `scripts/prebuild-check.mjs` runs `npm run generate:bindings`, then checks git porcelain under the generated types directory and errors if generated bindings are out of date in `scripts/prebuild-check.mjs:302-324`.
- Generator tests verify atomic replacement, missing/empty artifact failures, and preservation of the prior artifact when its backup rename fails in `scripts/generate-bindings.test.mjs:11-100`; the generated-client test verifies a multi-field Rust signature becomes the expected Tauri payload in `src/api/generatedCommands.test.ts:9-22`.
- The full prebuild check calls binding, version, ZIP, and macOS trampoline stub checks in `scripts/prebuild-check.mjs:326-346`.

## Architecture Behavior Tests

- Selected installation priority and invalid-explicit-path preservation are tested without Tauri state in `src-tauri/src/services/selected_game_installation.rs:138-231`.
- The complete install operation tests payload classification, fresh/changed installs, current-install no-op, launch-mode-only repair, production ordering, first-error truncation, and refreshed outcomes through its private effect boundary in `src-tauri/src/services/install/operation.rs:165-289`.
- Stream runtime tests exercise concurrent ensure, lifecycle transitions, failed start, and exclusive maintenance blocking in `src-tauri/src/stream/runtime.rs:440-572`.
- The History facade's tempfile test uses a real SQLite schema and managed files across queries, reveal/delete, and both cleanup scopes in `src-tauri/src/services/history.rs:365-570`.
- The framework-neutral Stream workflow uses fake ports and a fake scheduler to cover initialization failures, polling threshold/recovery (including overlapping slow failures), stale-response and lifecycle epochs, action exclusion, window/crop updates, transient feedback, Strict Mode-style dispose/start replay, and both command adapters in `src/features/stream/streamWorkflow.test.ts:133-450`.

## Version Guard

- `scripts/version-sync.mjs` reads `package.json` as the source version in `scripts/version-sync.mjs:33-35`.
- It compares Tauri, Cargo.toml, and Cargo.lock versions against that source and throws a `Version mismatch` error on drift in `scripts/version-sync.mjs:175-193`.
