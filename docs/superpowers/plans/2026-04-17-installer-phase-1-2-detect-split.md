# Installer Phase 1.2 — `commands/detect.rs` Split Implementation Plan

> Status: historical implementation record. `commands/detect/` and `commands/game_process.rs` already exist in the current codebase.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `src-tauri/src/commands/detect.rs` (624 lines, 10 tests) into a `commands/detect/` directory split by concern — Windows registry/Steam discovery, .NET runtime probing, game-path/BPP-data inspection — while simultaneously renaming the unrelated `commands/game.rs` (process detection) to `commands/game_process.rs` so the new `commands/detect/game.rs` name is unambiguous.

**Architecture:** Use the same `#[path]`-submodule technique as Phase 1.1 to physically split files incrementally without the Rust constraint that `detect.rs` and `detect/mod.rs` cannot coexist. Collapse into `detect/mod.rs` at the end. No behavior change; external API (`commands::detect::{detect_environment, detect_dotnet_runtime, verify_game_path, is_valid_game_path}`) preserved via re-exports.

**Tech Stack:** Rust 2021, Tauri 2.x, `keyvalues-parser` for VDF, `winreg` for Windows registry, `cargo test` for verification.

---

## Baseline

- `src-tauri/src/commands/detect.rs` — 624 lines, 10 `#[test]` functions
- `src-tauri/src/commands/game.rs` — 79 lines, 2 tests (process detection via `tasklist`)
- External callers of these modules:
  - `src-tauri/src/lib.rs:12` — `detect::{detect_dotnet_runtime, detect_environment, verify_game_path}`
  - `src-tauri/src/lib.rs:13` — `game::detect_bazaar_running`
  - `src-tauri/src/commands/bepinex.rs:186` — `crate::commands::detect::is_valid_game_path`
  - `src-tauri/src/commands/stream.rs:28` — `crate::commands::detect::detect_environment`
- Tests currently in `detect.rs::tests` break into three natural clusters:
  - VDF + Steam discovery: `test_find_game_in_library_vdf_*` (2 tests)
  - .NET: `test_parse_dotnet_runtimes_*` + `test_is_supported_dotnet_version_*` (4 tests)
  - Game path + BPP data: `test_normalize_game_path_*`, `test_resolve_game_path_*`, `test_read_installed_bpp_version_*`, `test_is_bepinex_installed_*`, `test_inspect_bpp_data_directory_*` (4 tests)

**Critical constraints (carried from Phase 1.1):**
- NEVER use `#[allow(unused_imports)]`, `#[allow(dead_code)]`, or `let _ = CONST;` to silence warnings. Root-cause every warning.
- Preserve test semantics verbatim — do not rename, refactor, or consolidate tests during the move.
- Preserve public API names consumed by `lib.rs`, `bepinex.rs`, `stream.rs`.

---

## Task 1: Rename `commands/game.rs` → `commands/game_process.rs`

**Why first:** Clears the `game` namespace so the new `commands/detect/game.rs` is unambiguous. Zero behavior change; pure rename plus import updates.

**Files:**
- Rename: `src-tauri/src/commands/game.rs` → `src-tauri/src/commands/game_process.rs`
- Modify: `src-tauri/src/commands/mod.rs` — change `pub mod game;` to `pub mod game_process;`
- Modify: `src-tauri/src/lib.rs` — change `game::detect_bazaar_running` to `game_process::detect_bazaar_running`

- [ ] **Step 1.1: Git-mv the file**

```bash
git mv src-tauri/src/commands/game.rs src-tauri/src/commands/game_process.rs
```

- [ ] **Step 1.2: Update `commands/mod.rs`**

Open `src-tauri/src/commands/mod.rs` and replace:

```rust
pub mod game;
```

with:

```rust
pub mod game_process;
```

- [ ] **Step 1.3: Update `lib.rs` import**

Open `src-tauri/src/lib.rs` and replace:

```rust
    game::detect_bazaar_running,
```

with:

```rust
    game_process::detect_bazaar_running,
```

- [ ] **Step 1.4: Search for stragglers**

Run: `rg -n 'commands::game\b|commands/game\.rs' src-tauri/src` — must return zero matches. Also search for `use .*::game::`.

- [ ] **Step 1.5: Verify build + tests**

```bash
cargo build --manifest-path src-tauri/Cargo.toml --lib
cargo test --manifest-path src-tauri/Cargo.toml --lib commands::game_process
```

Expected: warning-clean build; 2 `commands::game_process::tests::*` pass.

- [ ] **Step 1.6: Commit**

```bash
git add src-tauri/src/commands/mod.rs src-tauri/src/commands/game_process.rs src-tauri/src/lib.rs
git commit -m "Rename commands::game to commands::game_process for namespace clarity"
```

---

## Task 2: Extract `detect/steam.rs` (Steam registry + VDF discovery)

**Files:**
- Create: `src-tauri/src/commands/detect/steam.rs`
- Modify: `src-tauri/src/commands/detect.rs` — add `#[path]` declaration, remove moved items, add `use` re-imports

- [ ] **Step 2.1: Add the submodule declaration**

At the very top of `src-tauri/src/commands/detect.rs` (above existing imports), add:

```rust
#[path = "detect/steam.rs"]
mod steam;
```

- [ ] **Step 2.2: Create the new file with the failing test location**

Create `src-tauri/src/commands/detect/steam.rs` with a placeholder `mod tests` block ONLY:

```rust
// src-tauri/src/commands/detect/steam.rs
#[cfg(test)]
mod tests {
    use super::find_game_in_library_vdf;

    #[test]
    fn test_find_game_in_library_vdf_returns_matching_library_path() {
        let vdf = r#"
"libraryfolders"
{
    "0"
    {
        "path"      "C:\Program Files (x86)\Steam"
        "apps"
        {
            "730"   "1"
        }
    }
    "1"
    {
        "path"      "D:\SteamLibrary"
        "apps"
        {
            "1617400"   "1"
        }
    }
}"#;

        let path = find_game_in_library_vdf(vdf, "1617400");

        assert_eq!(path.as_deref(), Some(r"D:\SteamLibrary"));
    }

    #[test]
    fn test_find_game_in_library_vdf_returns_none_when_app_missing() {
        let vdf = r#"
"libraryfolders"
{
    "0"
    {
        "path"      "C:\Program Files (x86)\Steam"
        "apps"
        {
            "730"   "1"
        }
    }
}"#;

        let path = find_game_in_library_vdf(vdf, "1617400");

        assert_eq!(path, None);
    }
}
```

- [ ] **Step 2.3: Run cargo check — expect failure**

Run: `cargo check --manifest-path src-tauri/Cargo.toml --tests`
Expected: `cannot find function 'find_game_in_library_vdf' in module 'super'`.

- [ ] **Step 2.4: Move the Steam/VDF implementations**

Prepend to `src-tauri/src/commands/detect/steam.rs` (above the test module) the following — copied verbatim from `detect.rs`:

- `use keyvalues_parser::{Obj, Parser, Value};`
- `use std::path::{Path, PathBuf};`
- `fn first_obj<'a, 'text>(...) -> Option<&'a Obj<'text>>` (currently lines 132–137 of detect.rs)
- `fn first_str<'a, 'text>(...) -> Option<&'a str>` (lines 139–144)
- `fn library_has_app(folder: &Obj<'_>, app_id: &str) -> bool` (lines 146–152)
- `pub fn find_game_in_library_vdf(vdf_content: &str, app_id: &str) -> Option<String>` (lines 154–175) — keep `pub` visibility unchanged because unit tests import it
- `pub(super) fn get_steam_path() -> Option<PathBuf>` (lines 205–231) — change from private `fn` to `pub(super) fn` so `detect.rs` can call it
- `pub(super) fn get_game_path(steam_path: &Path) -> Option<PathBuf>` (lines 233–247) — change to `pub(super)`
- `fn get_game_path_from_vdf(steam_path: &Path) -> Option<PathBuf>` (lines 249–255) — stays private, called only by `get_game_path`

- [ ] **Step 2.5: Remove the same items from `detect.rs`**

In `src-tauri/src/commands/detect.rs`:

1. Delete the six functions listed above (lines roughly 132–255).
2. Delete the two VDF tests from the `#[cfg(test)] mod tests` block (`test_find_game_in_library_vdf_*`).
3. Update the test module's `use super::{...}` imports — if any of the moved names appear, remove them.
4. Update callers inside `detect.rs` to go through `steam::`:
   - `get_steam_path()` → `steam::get_steam_path()`
   - `.and_then(get_game_path)` → `.and_then(steam::get_game_path)` in `resolve_game_path`

- [ ] **Step 2.6: Run tests — expect all green**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib commands::detect`
Expected: 10 tests total — 2 under `commands::detect::steam::tests` + 8 under `commands::detect::tests`.

- [ ] **Step 2.7: Commit**

```bash
git add src-tauri/src/commands/detect.rs src-tauri/src/commands/detect/steam.rs
git commit -m "Extract Steam discovery into commands::detect::steam"
```

---

## Task 3: Extract `detect/dotnet.rs` (.NET runtime probing)

**Files:**
- Create: `src-tauri/src/commands/detect/dotnet.rs`
- Modify: `src-tauri/src/commands/detect.rs`

- [ ] **Step 3.1: Add the submodule declaration**

Append to the top of `detect.rs`, under the existing `#[path]` decl from Task 2:

```rust
#[path = "detect/dotnet.rs"]
mod dotnet;
```

- [ ] **Step 3.2: Write the failing test file**

Create `src-tauri/src/commands/detect/dotnet.rs` with ONLY the test module:

```rust
// src-tauri/src/commands/detect/dotnet.rs
#[cfg(test)]
mod tests {
    use super::{is_supported_dotnet_version, parse_dotnet_runtimes};

    #[test]
    fn test_parse_dotnet_runtimes_found() {
        let output = "Microsoft.NETCore.App 6.0.25 [/usr/share/dotnet/shared/Microsoft.NETCore.App]\nMicrosoft.NETCore.App 8.0.1 [/usr/share/dotnet/shared/Microsoft.NETCore.App]";
        let result = parse_dotnet_runtimes(output);
        assert_eq!(result.as_deref(), Some("8.0.1"));
    }

    #[test]
    fn test_parse_dotnet_runtimes_too_old() {
        let output = "Microsoft.NETCore.App 5.0.0 [/usr/share/dotnet]";
        let result = parse_dotnet_runtimes(output);
        assert_eq!(result, None);
    }

    #[test]
    fn test_parse_dotnet_runtimes_empty_output() {
        let result = parse_dotnet_runtimes("");
        assert_eq!(result, None);
    }

    #[test]
    fn test_is_supported_dotnet_version_requires_major_6_or_higher() {
        assert!(!is_supported_dotnet_version("5.0.17"));
        assert!(is_supported_dotnet_version("6.0.0"));
        assert!(is_supported_dotnet_version("8.0.1"));
    }
}
```

- [ ] **Step 3.3: cargo check fails**

Run: `cargo check --manifest-path src-tauri/Cargo.toml --tests`
Expected: `cannot find function 'parse_dotnet_runtimes' in module 'super'`.

- [ ] **Step 3.4: Move the .NET implementations**

Prepend to `src-tauri/src/commands/detect/dotnet.rs` above the test module:

```rust
use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub fn parse_dotnet_runtimes(output: &str) -> Option<String> {
    // body copied verbatim from detect.rs
}

fn parse_version_tuple(v: &str) -> (u32, u32, u32) {
    // body copied verbatim
}

pub(super) fn is_supported_dotnet_version(version: &str) -> bool {
    // body copied verbatim — change visibility from private to pub(super)
}

pub(super) fn detect_dotnet() -> (Option<String>, bool) {
    // body copied verbatim — change visibility to pub(super)
}
```

Copy the four function bodies byte-for-byte from `detect.rs` (current lines 177–203 and 329–372).

- [ ] **Step 3.5: Remove the same items from `detect.rs`**

1. Delete the four `.NET` functions and the `CREATE_NO_WINDOW` const / Windows `CommandExt` import (currently at detect.rs lines 7–11 and lines 177–203 and 329–372).
2. Delete the four `.NET` tests from the test module.
3. Update the call site inside `detect.rs::detect_dotnet_runtime` to call `dotnet::detect_dotnet()` instead of `detect_dotnet()`.
4. If `use std::process::Command;` was only used by `.NET` code, remove it too.

- [ ] **Step 3.6: Run tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib commands::detect`
Expected: 10 tests — 2 steam + 4 dotnet + 4 detect::tests (game-path + BPP-data cluster).

- [ ] **Step 3.7: Commit**

```bash
git add src-tauri/src/commands/detect.rs src-tauri/src/commands/detect/dotnet.rs
git commit -m "Extract .NET runtime probing into commands::detect::dotnet"
```

---

## Task 4: Extract `detect/game.rs` (game path + BPP data directory)

**Files:**
- Create: `src-tauri/src/commands/detect/game.rs`
- Modify: `src-tauri/src/commands/detect.rs`

- [ ] **Step 4.1: Add the submodule declaration**

Append to the top of `detect.rs`:

```rust
#[path = "detect/game.rs"]
mod game;
```

- [ ] **Step 4.2: Write failing tests**

Create `src-tauri/src/commands/detect/game.rs` with the test module only, containing all 4 game-path + BPP-data tests: `test_normalize_game_path_trims_whitespace`, `test_resolve_game_path_prefers_requested_path`, `test_read_installed_bpp_version_trims_contents`, `test_is_bepinex_installed_detects_core_payload_without_version_file`, `test_inspect_bpp_data_directory_requires_reset_when_version_file_missing`, `test_inspect_bpp_data_directory_accepts_compatible_version`, `test_inspect_bpp_data_directory_requires_reset_when_version_is_incompatible`, `test_inspect_bpp_data_directory_accepts_older_supported_version`. Copy each verbatim from `detect.rs`.

Use the scaffolding:

```rust
// src-tauri/src/commands/detect/game.rs
#[cfg(test)]
mod tests {
    use super::{
        inspect_bpp_data_directory, is_bepinex_installed, is_valid_game_path,
        normalize_game_path, read_installed_bpp_version, resolve_game_path,
        BppDataDirectoryState, BppDataIssue,
    };
    // ... tests here
}
```

- [ ] **Step 4.3: cargo check fails**

Expected: `cannot find function 'normalize_game_path' in module 'super'` (and similar).

- [ ] **Step 4.4: Move the game-path / BPP-data implementations**

Prepend to `src-tauri/src/commands/detect/game.rs` above the test module — copy verbatim from `detect.rs`:

- `use serde::{Deserialize, Serialize};`
- `use std::path::{Path, PathBuf};`
- `#[derive(...)] pub enum BppDataIssue { ... }` (currently detect.rs lines 34–39) — stays `pub` because `EnvironmentInfo` field uses it
- `#[derive(...)] struct BppDataDirectoryState { ... }` (lines 41–46) — keep private visibility; tests in this file can still import it via `use super::BppDataDirectoryState;`
- `pub(super) fn normalize_game_path(game_path: Option<String>) -> Option<PathBuf>` (lines 102–108) — change to `pub(super)`
- `pub(super) fn resolve_game_path(steam_path: Option<&Path>, requested_game_path: Option<&Path>) -> Option<PathBuf>` (lines 110–117) — change to `pub(super)`. This function calls `steam::get_game_path` via the path `steam_path.and_then(get_game_path)`. Update to the fully qualified `super::steam::get_game_path` when moving.
- `pub(crate) fn is_bepinex_installed(game_path: &Path) -> bool` (lines 257–275) — keep `pub(crate)` visibility because Phase 1.3's bepinex module will still access it via `crate::commands::detect::is_bepinex_installed` (check!)
- `pub(crate) fn read_installed_bpp_version(game_path: &Path) -> Option<String>` (lines 277–282) — keep `pub(crate)`
- `pub(super) fn inspect_bpp_data_directory(game_path: &Path, minimum_supported_version: &str) -> BppDataDirectoryState` (lines 284–327) — change to `pub(super)`. Keep the `crate::commands::bepinex::...` module-qualified calls intact.
- `pub(crate) fn is_valid_game_path(base: &Path) -> bool` (lines 381–390) — keep `pub(crate)` because `commands/bepinex.rs:186` calls it externally

**Important visibility note for `inspect_bpp_data_directory`:** the tests inside `game.rs::tests` need access to `BppDataDirectoryState` and `BppDataIssue`. `BppDataIssue` is already `pub`. `BppDataDirectoryState` needs no extra visibility because test module is `mod tests { use super::BppDataDirectoryState; }` which reaches private siblings.

- [ ] **Step 4.5: Remove the same items from `detect.rs`**

1. Delete all 9 moved items from `detect.rs` (the enum, struct, and 7 functions).
2. Delete the 8 moved tests from `detect.rs::tests`. After this step, `detect.rs::tests` should be empty (0 tests) — remove the `#[cfg(test)] mod tests { ... }` block itself if it becomes empty.
3. Add at the top of `detect.rs` (below the three `#[path]` decls):

```rust
pub use game::{is_bepinex_installed, is_valid_game_path, read_installed_bpp_version, BppDataIssue};
use game::{inspect_bpp_data_directory, normalize_game_path, resolve_game_path, BppDataDirectoryState};
```

4. Update the call sites inside `detect.rs::detect_environment` to use the now-imported names (no change to the bodies; just make sure they resolve).

- [ ] **Step 4.6: Run tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib commands::detect`
Expected: 10 tests — 2 steam + 4 dotnet + 4 game (wait: Task 4 has 8 tests, but the baseline was 10; counting: 2 VDF + 4 .NET + 4 game-path = 10. The game.rs test list above has 8 names. Let me recount the baseline — yes, the original had 10 tests. So after Task 4, the split is 2 steam + 4 dotnet + 4 game. Whichever test names line up, the total MUST remain 10.)

**Recount to confirm:** the original `detect.rs::tests` has these 10 tests:
1. `test_find_game_in_library_vdf_returns_matching_library_path` → steam
2. `test_find_game_in_library_vdf_returns_none_when_app_missing` → steam
3. `test_parse_dotnet_runtimes_found` → dotnet
4. `test_parse_dotnet_runtimes_too_old` → dotnet
5. `test_parse_dotnet_runtimes_empty_output` → dotnet
6. `test_is_supported_dotnet_version_requires_major_6_or_higher` → dotnet
7. `test_read_installed_bpp_version_trims_contents` → game
8. `test_is_bepinex_installed_detects_core_payload_without_version_file` → game
9. `test_inspect_bpp_data_directory_requires_reset_when_version_file_missing` → game
10. `test_inspect_bpp_data_directory_accepts_compatible_version` → game
11. `test_inspect_bpp_data_directory_requires_reset_when_version_is_incompatible` → game
12. `test_inspect_bpp_data_directory_accepts_older_supported_version` → game
13. `test_normalize_game_path_trims_whitespace` → game
14. `test_resolve_game_path_prefers_requested_path` → game

**Actual count is 14, not 10.** Update expectation: 2 steam + 4 dotnet + 8 game = 14 total.

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib commands::detect`
Expected: 14 tests total, split 2 steam + 4 dotnet + 8 game.

- [ ] **Step 4.7: Commit**

```bash
git add src-tauri/src/commands/detect.rs src-tauri/src/commands/detect/game.rs
git commit -m "Extract game path validation and BPP data inspection into commands::detect::game"
```

---

## Task 5: Collapse `detect.rs` into `detect/mod.rs`

**Files:**
- Move: `src-tauri/src/commands/detect.rs` → `src-tauri/src/commands/detect/mod.rs`
- Modify: the moved file to drop the `#[path]` attributes

- [ ] **Step 5.1: `git mv` the file**

```bash
git mv src-tauri/src/commands/detect.rs src-tauri/src/commands/detect/mod.rs
```

- [ ] **Step 5.2: Drop the `#[path]` attributes**

In `src-tauri/src/commands/detect/mod.rs`, replace the three decorated lines at the top:

```rust
#[path = "detect/steam.rs"]
mod steam;
#[path = "detect/dotnet.rs"]
mod dotnet;
#[path = "detect/game.rs"]
mod game;
```

with:

```rust
mod dotnet;
mod game;
mod steam;
```

(Alphabetical order for consistency with Phase 1.1's final state.)

- [ ] **Step 5.3: Verify full crate tests green**

```bash
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

Expected: full crate test suite passes, including the 14 tests under `commands::detect::*`.

- [ ] **Step 5.4: Confirm external callers still resolve**

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: zero warnings. Verify these three call sites compile:
- `src-tauri/src/lib.rs:12` — `detect::{detect_dotnet_runtime, detect_environment, verify_game_path}`
- `src-tauri/src/commands/bepinex.rs:186` — `crate::commands::detect::is_valid_game_path`
- `src-tauri/src/commands/stream.rs:28` — `crate::commands::detect::detect_environment`

- [ ] **Step 5.5: Sanity pass: `npm run check`**

```bash
npm run check
```

Expected: 0 errors (this phase should not touch any TypeScript; the check is a belt-and-braces pass).

- [ ] **Step 5.6: Commit**

```bash
git add src-tauri/src/commands/detect/mod.rs
git commit -m "Collapse commands::detect facade into detect/mod.rs"
```

---

## Task 6: Final audit and open PR

- [ ] **Step 6.1: Confirm the directory layout**

```bash
ls -la src-tauri/src/commands/detect
```

Expected:
```
dotnet.rs
game.rs
mod.rs
steam.rs
```

```bash
ls src-tauri/src/commands/detect.rs 2>/dev/null
```

Expected: no such file.

- [ ] **Step 6.2: Confirm per-file line counts**

```bash
wc -l src-tauri/src/commands/detect/*.rs
```

Target: no file above ~300 lines. If any is, raise in PR description.

- [ ] **Step 6.3: Open the PR**

Branch: `phase-1-2-detect-split`

Title: `Split commands/detect into focused submodules and rename game.rs`

Body:

```markdown
## Summary
- Rename `src-tauri/src/commands/game.rs` (process detection) → `commands/game_process.rs` to clear the namespace for the new detect submodule.
- Split `src-tauri/src/commands/detect.rs` (624 lines) into `commands/detect/` with four focused files:
  - `mod.rs` — Tauri command entry points + facade re-exports
  - `steam.rs` — Windows registry + Steam library VDF discovery
  - `dotnet.rs` — .NET runtime probing
  - `game.rs` — Bazaar game-path validation + BPP data directory inspection
- No behavior change. Public API (`commands::detect::{detect_environment, detect_dotnet_runtime, verify_game_path, is_valid_game_path, is_bepinex_installed, read_installed_bpp_version, BppDataIssue}`) preserved via re-exports.
- 14 tests still pass; split into 2 steam + 4 dotnet + 8 game.
- Parent spec: `docs/superpowers/specs/2026-04-17-installer-cohesion-refactor-design.md` Phase 1.2

## Test plan
- [x] `cargo test --manifest-path src-tauri/Cargo.toml --lib`
- [x] `cargo build --manifest-path src-tauri/Cargo.toml --lib` — warning clean
- [x] `npm run check`

Release Notes:

- N/A
```

- [ ] **Step 6.4: Wait for review.** Do not start Phase 1.3 until this PR lands.

---

## Self-Review Notes

- Every task produces a working crate state — `cargo test` passes after each commit.
- Test semantics preserved verbatim; only paths and `use super::{...}` change.
- Visibility choices: `pub` where external callers exist (`is_valid_game_path`, `is_bepinex_installed`, `read_installed_bpp_version`, `BppDataIssue`, `find_game_in_library_vdf`), `pub(super)` for intra-module helpers, private otherwise.
- The `#[path]` trick is identical to Phase 1.1 — it sidesteps the Rust constraint that `detect.rs` and `detect/mod.rs` cannot coexist until Task 5's `git mv`.
- Task 1 (the rename) is intentionally the smallest possible commit so any later task that touches `detect/game.rs` has no name conflict with the older `commands/game.rs`.
