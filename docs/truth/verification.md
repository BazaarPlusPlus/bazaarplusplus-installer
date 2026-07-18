---
status: truth
topic: verification
last-verified: 5953080a80db8ddfbc8419b869d6b0461c5d4862
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
- Generator tests verify atomic replacement plus missing/empty artifact failures in `scripts/generate-bindings.test.mjs:8-69`, and the generated-client test verifies a multi-field Rust signature becomes the expected Tauri payload in `src/api/generatedCommands.test.ts:9-22`.
- The full prebuild check calls binding, version, ZIP, and macOS trampoline stub checks in `scripts/prebuild-check.mjs:326-346`.

## Version Guard

- `scripts/version-sync.mjs` reads `package.json` as the source version in `scripts/version-sync.mjs:33-35`.
- It compares Tauri, Cargo.toml, and Cargo.lock versions against that source and throws a `Version mismatch` error on drift in `scripts/version-sync.mjs:175-193`.
