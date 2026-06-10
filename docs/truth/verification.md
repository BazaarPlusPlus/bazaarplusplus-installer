---
status: truth
topic: verification
last-verified: 7b18f73d4718d3e1406de9f526d1fbba09ac567f
---

# Verification

Use the smallest command that verifies the changed behavior.

## Common Commands

- `npm run check` regenerates bindings and runs TypeScript without emit in `package.json:19-20`.
- `npm run test:unit` runs Vitest in `package.json:15-16`.
- `npm run test:rust` runs Cargo tests against `src-tauri/Cargo.toml` in `package.json:14-14`.
- `npm run test` runs generated bindings, Rust tests, and unit tests in `package.json:13-15`.
- `npm run prebuild-check` runs the release prebuild checker in `package.json:10-10`.
- `./build.sh --prod` is the release-oriented bundle path; release prechecks call version sync and prebuild check before packaging in `build.sh:466-469`.

## Generated Binding Guard

- `scripts/prebuild-check.mjs` runs `npm run generate:bindings`, then checks git porcelain under the generated types directory and errors if generated bindings are out of date in `scripts/prebuild-check.mjs:303-325`.
- The full prebuild check calls binding, version, ZIP, and macOS trampoline stub checks in `scripts/prebuild-check.mjs:327-346`.

## Version Guard

- `scripts/version-sync.mjs` reads `package.json` as the source version in `scripts/version-sync.mjs:33-35`.
- It compares Tauri, Cargo.toml, and Cargo.lock versions against that source and throws a `Version mismatch` error on drift in `scripts/version-sync.mjs:135-165`.
