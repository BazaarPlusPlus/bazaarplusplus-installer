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

- Current architecture and maintenance notes live in `docs/architecture.md`
- The documentation index lives in `docs/README.md`

## Known Limitation

- On macOS, the current blocker is BepInEx not loading correctly, so the installer is not considered working there yet.
