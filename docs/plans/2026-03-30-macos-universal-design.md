# macOS Universal Build Design

**Goal:** Make `./build.sh --prod` produce a universal macOS app bundle while preserving the existing Rosetta-dependent plugin runtime.

**Design:**
- Keep the current host-platform split: Windows still builds its existing NSIS artifacts, while macOS switches to Tauri's `universal-apple-darwin` target.
- Treat the Tauri app bundle as universal, but do not require every bundled BepInEx native dependency to be universal. `libe_sqlite3.dylib` may remain `x86_64`-only because the mod/plugin chain is expected to run under Rosetta on Apple Silicon.
- Add regression coverage around the shell build plan so the macOS path continues passing `--target universal-apple-darwin` to both `tauri build` and `tauri bundle`.

**Testing:**
- Add shell-level tests that source `build.sh` and assert the emitted Tauri commands for macOS and Windows.
- Run the existing Node test suite after the script changes.
