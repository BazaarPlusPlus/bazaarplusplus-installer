# BazaarPlusPlus

Desktop app for BazaarPlusPlus, built with Tauri, React, Vite, and TypeScript.

## Development

Requirements:

- Node.js and npm
- Rust toolchain

Start the desktop app in development mode:

```bash
./build.sh
```

Or run the underlying commands manually:

```bash
npm install
npm run tauri dev
```

## Build

Build the desktop bundle:

```bash
./build.sh --prod
```

On macOS, this builds an arm64 app bundle. The local Rust toolchain must have
the Apple Silicon target installed:

```bash
rustup target add aarch64-apple-darwin
```

If you need a clean dependency reinstall first:

```bash
./build.sh --prod --clean-deps
```

Artifacts are written under `src-tauri/target/release/` on Windows and
`src-tauri/target/aarch64-apple-darwin/release/` on macOS.

## Structure

- `src/`: React frontend
- `src-tauri/`: native Tauri commands and packaging
- `scripts/prebuild-check.mjs`: build-time validation

## Documentation

- Start with `docs/INDEX.md`.
- Current code-verified documentation lives in `docs/truth/`.
- Historical specs, audits, and plans live in `docs/archive/` and are not current truth.

## Known Verification Gaps

- Platform smoke gaps are tracked in `docs/plans/manual-validation.md`.
