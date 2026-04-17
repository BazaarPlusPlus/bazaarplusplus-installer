# Installer Phase 1.3 — `commands/bepinex.rs` Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `src-tauri/src/commands/bepinex.rs` (675 lines, 16 tests) into a `commands/bepinex/` directory organised by concern — zip-archive handling, BPP data versioning, filesystem payload operations, and Tauri command entry points — without changing behavior or the crate-external public API.

**Architecture:** Three `#[path]`-bridged submodules (`zip_archive`, `versioning`, `payload`) are extracted incrementally, then `bepinex.rs` is `git mv`'d to `bepinex/mod.rs` and the `#[path]` attributes are dropped. The facade re-exports the items crossed at module boundaries by existing callers in `commands::detect` and `src/lib.rs`. This is the same technique used by Phase 1.1 (stream/records) and Phase 1.2 (commands/detect).

**Tech Stack:** Rust 2021, Tauri 2.x, `zip` crate, `serde_json`, `cargo test`.

---

## Baseline

- `src-tauri/src/commands/bepinex.rs` — 675 lines, 16 `#[test]` functions.
- External callers of the current `commands::bepinex` module:
  - `src-tauri/src/lib.rs:10` — `bepinex::{get_legacy_record_directory_info, install_bepinex, repair_bpp, uninstall_bpp}` (the four Tauri commands)
  - `src-tauri/src/commands/detect/mod.rs:52,56,57` — `crate::commands::bepinex::{read_bundled_bpp_version, read_bundled_bpp_data_version_policy, default_bpp_data_version_policy}`
  - `src-tauri/src/commands/detect/game.rs:68,77,85,179,198,205,217,220,242,245` — `crate::commands::bepinex::{LEGACY_RECORD_DIRECTORY, bpp_data_version_path, is_compatible_bpp_data_version, ensure_bpp_data_version_file, CURRENT_BPP_DATA_VERSION, BPP_DATA_VERSION_FILE_NAME}`

**Cluster breakdown** (tests counted from the `#[cfg(test)] mod tests` block):

| Submodule      | Items                                                                                                                                                                                                                                                                                                                        | Tests |
|----------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------|
| `zip_archive`  | `bundled_zip_relative_path`, `read_bundled_bpp_version`, `extract_zip`                                                                                                                                                                                                                                                       | 2     |
| `versioning`   | `LEGACY_RECORD_DIRECTORY`, `BPP_DATA_VERSION_FILE_NAME`, `CURRENT_BPP_DATA_VERSION`, `BPP_DATA_VERSION_POLICY_RESOURCE_PATH`, `BppDataVersionPolicy`, `default_bpp_data_version_policy`, `read_bundled_bpp_data_version_policy`, `parse_version_components`, `compare_version_strings`, `is_compatible_bpp_data_version`, `bpp_data_version_path`, `ensure_bpp_data_version_file` | 4     |
| `payload`      | `BPP_CONFIG_RELATIVE_PATH`, `PreservedFile`, `remove_path_if_exists`, `uninstall_payload`, `ensure_valid_game_path`, `prepare_install_target`, `preserve_file_if_exists`, `restore_preserved_file`, `cleanup_legacy_record_directory`, `legacy_record_directory_size_bytes`                                                       | 9     |
| `mod`          | `debug_log!`/`debug_error!` macros, `LegacyRecordDirectoryInfo`, `repair_bpp`, `get_legacy_record_directory_info`, `install_bepinex`, `uninstall_bpp` (four `#[tauri::command]` entry points)                                                                                                                                    | 1     |

Total: 16 tests.

**Critical constraints (carried from Phase 1.1 and 1.2):**

- NEVER use `#[allow(unused_imports)]`, `#[allow(dead_code)]`, `let _ = CONST;`, or any warning suppression. Root-cause every warning.
- Preserve test semantics verbatim — do not rename, refactor, or consolidate tests during the move.
- Preserve the external public API names: `lib.rs` imports `bepinex::{get_legacy_record_directory_info, install_bepinex, repair_bpp, uninstall_bpp}`; `commands/detect/*` imports `bepinex::{read_bundled_bpp_version, read_bundled_bpp_data_version_policy, default_bpp_data_version_policy, LEGACY_RECORD_DIRECTORY, bpp_data_version_path, is_compatible_bpp_data_version, ensure_bpp_data_version_file, CURRENT_BPP_DATA_VERSION, BPP_DATA_VERSION_FILE_NAME}`.
- Visibility discipline: narrowest visibility that compiles. `pub(super)` for items called only across bepinex submodules (mod.rs ↔ payload/versioning/zip_archive or sibling-to-sibling), `pub(crate)` only where a caller outside `commands::bepinex` actually needs the name, `pub` only if crossing the crate boundary (none do).

---

## Task 1: Extract `bepinex/zip_archive.rs`

**Why first:** Smallest cluster (3 items, 2 tests). Zero cross-submodule dependencies on `versioning` or `payload`. Validates the `#[path]` bridge pattern before touching the larger clusters.

**Files:**
- Create: `src-tauri/src/commands/bepinex/zip_archive.rs`
- Modify: `src-tauri/src/commands/bepinex.rs`

- [ ] **Step 1.1: Add the submodule declaration at the top of `bepinex.rs`**

Open `src-tauri/src/commands/bepinex.rs`. At the VERY TOP (above the existing `use` lines and the `debug_log!`/`debug_error!` macros), insert:

```rust
#[path = "bepinex/zip_archive.rs"]
mod zip_archive;
```

- [ ] **Step 1.2: Create the new file with a failing test module only**

Create `src-tauri/src/commands/bepinex/zip_archive.rs` containing only:

```rust
// src-tauri/src/commands/bepinex/zip_archive.rs
#[cfg(test)]
mod tests {
    use super::{bundled_zip_relative_path, extract_zip};
    use std::io::{Cursor, Write};

    fn make_test_zip() -> Vec<u8> {
        let buffer = Cursor::new(Vec::new());
        let mut zip = zip::ZipWriter::new(buffer);
        let options = zip::write::SimpleFileOptions::default();

        zip.add_directory("BepInEx/", options).unwrap();
        zip.start_file("BepInEx/core/BepInEx.Core.dll", options)
            .unwrap();
        zip.write_all(b"fake dll content").unwrap();

        zip.finish().unwrap().into_inner()
    }

    #[test]
    fn test_extract_zip_creates_files() {
        let zip_bytes = make_test_zip();
        let tmp = tempfile::tempdir().unwrap();

        let extracted = extract_zip(&zip_bytes, tmp.path()).unwrap();
        assert!(!extracted.is_empty());
        assert!(tmp.path().join("BepInEx/core/BepInEx.Core.dll").exists());
    }

    #[test]
    fn test_bundled_zip_relative_path_matches_supported_targets() {
        assert_eq!(bundled_zip_relative_path(), "BepInExSource/BepInEx.zip");
    }
}
```

- [ ] **Step 1.3: Run `cargo check` — expect failing import resolution**

```
cargo check --manifest-path src-tauri/Cargo.toml --tests
```

Expected: `cannot find function 'bundled_zip_relative_path' in module 'super'` (and `extract_zip`). Confirms the failing-test hook.

- [ ] **Step 1.4: Move the three implementations into `zip_archive.rs`**

Prepend above the `#[cfg(test)] mod tests` block:

```rust
use std::io::{Cursor, Read};
use std::path::Path;
use tauri::Manager;

pub(super) fn bundled_zip_relative_path() -> &'static str {
    "BepInExSource/BepInEx.zip"
}

pub(crate) fn read_bundled_bpp_version(app: &tauri::AppHandle) -> Result<Option<String>, String> {
    let resource_path = app
        .path()
        .resource_dir()
        .map_err(|err| err.to_string())?
        .join(bundled_zip_relative_path());
    let zip_bytes = std::fs::read(&resource_path)
        .map_err(|err| format!("Cannot read bundled BepInEx.zip: {err}"))?;

    let reader = Cursor::new(zip_bytes);
    let mut archive = zip::ZipArchive::new(reader).map_err(|err| err.to_string())?;

    for index in 0..archive.len() {
        let mut file = archive.by_index(index).map_err(|err| err.to_string())?;
        if file.name().ends_with("BazaarPlusPlus.version") {
            let mut version = String::new();
            file.read_to_string(&mut version)
                .map_err(|err| err.to_string())?;
            let version = version.trim();
            return Ok((!version.is_empty()).then(|| version.to_string()));
        }
    }

    Ok(None)
}

pub(super) fn extract_zip(zip_bytes: &[u8], dest_dir: &Path) -> Result<Vec<String>, String> {
    let reader = Cursor::new(zip_bytes);
    let mut archive = zip::ZipArchive::new(reader).map_err(|err| err.to_string())?;
    let mut extracted = Vec::new();

    for index in 0..archive.len() {
        let mut file = archive.by_index(index).map_err(|err| err.to_string())?;
        let Some(relative_path) = file.enclosed_name().map(|path| path.to_path_buf()) else {
            return Err(format!("Zip entry has unsafe path: {}", file.name()));
        };
        let output_path = dest_dir.join(relative_path);

        if file.is_dir() {
            std::fs::create_dir_all(&output_path).map_err(|err| err.to_string())?;
            continue;
        }

        if let Some(parent) = output_path.parent() {
            std::fs::create_dir_all(parent).map_err(|err| err.to_string())?;
        }

        let mut contents = Vec::new();
        file.read_to_end(&mut contents)
            .map_err(|err| err.to_string())?;
        std::fs::write(&output_path, contents).map_err(|err| err.to_string())?;
        extracted.push(output_path.to_string_lossy().into_owned());
    }

    Ok(extracted)
}
```

Function bodies are byte-identical copies from `bepinex.rs`; only the visibility qualifiers change from `pub` to `pub(super)` / `pub(crate)` per the narrowing policy above.

- [ ] **Step 1.5: Remove the same items from `bepinex.rs`**

In `src-tauri/src/commands/bepinex.rs`:

1. Delete `pub fn bundled_zip_relative_path() -> &'static str { ... }` (around line 20).
2. Delete `pub fn read_bundled_bpp_version(app: &tauri::AppHandle) -> Result<Option<String>, String> { ... }` (around lines 45-69).
3. Delete `pub fn extract_zip(zip_bytes: &[u8], dest_dir: &Path) -> Result<Vec<String>, String> { ... }` (around lines 123-152).
4. Delete the two tests `test_extract_zip_creates_files` and `test_bundled_zip_relative_path_matches_supported_targets` from `mod tests`. Also delete the local helper `fn make_test_zip() -> Vec<u8> { ... }` from `mod tests` (the same helper now lives inside `zip_archive.rs::tests`).
5. Update the call site inside `install_bepinex`:
   - `let relative_zip_path = bundled_zip_relative_path();` → `let relative_zip_path = zip_archive::bundled_zip_relative_path();`
   - `let extracted = extract_zip(&zip_bytes, game_path)?;` → `let extracted = zip_archive::extract_zip(&zip_bytes, game_path)?;`
6. If the top-level `use` block on `bepinex.rs` still contains `use std::io::{Cursor, Read};` and nothing else references them after the removals, delete that line. Re-check with grep.
7. If `use tauri::Manager;` is no longer used in `bepinex.rs` (all `.path()` calls moved out), delete it. Re-check.

Do NOT add `#[allow(unused_imports)]`. Delete the imports.

- [ ] **Step 1.6: Run tests — expect all green**

```
cargo test --manifest-path src-tauri/Cargo.toml --lib commands::bepinex
```

Expected: 16 tests pass total — 2 under `commands::bepinex::zip_archive::tests`, 14 under `commands::bepinex::tests`.

```
cargo build --manifest-path src-tauri/Cargo.toml --lib
```

Warning-free.

- [ ] **Step 1.7: Verify external callers still resolve**

```
rg -n 'crate::commands::bepinex::read_bundled_bpp_version' src-tauri/src
```

`detect/mod.rs` must still compile against the re-exported `pub(crate) fn read_bundled_bpp_version`. Because `zip_archive::read_bundled_bpp_version` is `pub(crate)`, and `bepinex.rs` is the parent module, the path `crate::commands::bepinex::read_bundled_bpp_version` currently resolves to the inner module's `read_bundled_bpp_version` only if there is a re-export at the `bepinex.rs` top level. **Add** (once, below the `mod zip_archive;` decl and above the remaining `use` block):

```rust
pub(crate) use zip_archive::read_bundled_bpp_version;
```

Then re-run:

```
cargo check --manifest-path src-tauri/Cargo.toml --lib
```

Expected: clean build including `detect/mod.rs`.

- [ ] **Step 1.8: Commit**

```
git add src-tauri/src/commands/bepinex.rs src-tauri/src/commands/bepinex/zip_archive.rs
git commit -m "Extract zip archive handling into commands::bepinex::zip_archive

Moves bundled_zip_relative_path, read_bundled_bpp_version, and
extract_zip plus their two unit tests into a new submodule
commands/bepinex/zip_archive.rs. The #[path] attribute bridges
until Task 4 collapses bepinex.rs into bepinex/mod.rs.

Visibilities narrowed: bundled_zip_relative_path and extract_zip
to pub(super) (internal to the bepinex module tree);
read_bundled_bpp_version to pub(crate) because detect/mod.rs still
imports it as crate::commands::bepinex::read_bundled_bpp_version,
preserved via a pub(crate) use re-export at the facade."
```

---

## Task 2: Extract `bepinex/versioning.rs`

**Files:**
- Create: `src-tauri/src/commands/bepinex/versioning.rs`
- Modify: `src-tauri/src/commands/bepinex.rs`

- [ ] **Step 2.1: Add the submodule declaration**

At the top of `bepinex.rs`, under the existing `#[path = "bepinex/zip_archive.rs"] mod zip_archive;`, add:

```rust
#[path = "bepinex/versioning.rs"]
mod versioning;
```

- [ ] **Step 2.2: Create the new file with the failing test module**

Create `src-tauri/src/commands/bepinex/versioning.rs` containing ONLY:

```rust
// src-tauri/src/commands/bepinex/versioning.rs
#[cfg(test)]
mod tests {
    use super::{
        bpp_data_version_path, compare_version_strings, ensure_bpp_data_version_file,
        is_compatible_bpp_data_version, BPP_DATA_VERSION_FILE_NAME, CURRENT_BPP_DATA_VERSION,
    };

    #[test]
    fn test_ensure_bpp_data_version_file_creates_version_marker() {
        let tmp = tempfile::tempdir().unwrap();

        ensure_bpp_data_version_file(tmp.path()).unwrap();

        assert_eq!(
            std::fs::read_to_string(bpp_data_version_path(tmp.path()))
                .unwrap()
                .trim(),
            CURRENT_BPP_DATA_VERSION
        );
    }

    #[test]
    fn test_is_compatible_bpp_data_version_matches_current_version() {
        assert!(is_compatible_bpp_data_version(
            CURRENT_BPP_DATA_VERSION,
            CURRENT_BPP_DATA_VERSION
        ));
        assert!(!is_compatible_bpp_data_version(
            "0",
            CURRENT_BPP_DATA_VERSION
        ));
    }

    #[test]
    fn test_is_compatible_bpp_data_version_accepts_versions_in_supported_range() {
        assert!(is_compatible_bpp_data_version("2.9.8", "2.9.0"));
        assert!(!is_compatible_bpp_data_version("2.8.9", "2.9.0"));
        assert!(is_compatible_bpp_data_version("999.0.0", "2.9.0"));
    }

    #[test]
    fn test_compare_version_strings_compares_dot_versions() {
        assert_eq!(
            compare_version_strings("2.9.9", "2.9.8"),
            Some(std::cmp::Ordering::Greater)
        );
        assert_eq!(
            compare_version_strings("2.9", "2.9.0"),
            Some(std::cmp::Ordering::Equal)
        );
        assert_eq!(compare_version_strings("bad", "2.9.0"), None);
    }

    // keep BPP_DATA_VERSION_FILE_NAME in scope for potential follow-up tests
    #[allow(dead_code)]
    const _: &str = BPP_DATA_VERSION_FILE_NAME;
}
```

Wait — the `#[allow(dead_code)]` + `const _` trick above is exactly the kind of warning-suppression hack the repo policy forbids. Delete that line entirely. Rewrite the `use` block to list only the names actually exercised:

```rust
use super::{
    bpp_data_version_path, compare_version_strings, ensure_bpp_data_version_file,
    is_compatible_bpp_data_version, CURRENT_BPP_DATA_VERSION,
};
```

(`BPP_DATA_VERSION_FILE_NAME` is only referenced via `bpp_data_version_path`; it does not need to be imported here.) The complete test scaffold becomes:

```rust
// src-tauri/src/commands/bepinex/versioning.rs
#[cfg(test)]
mod tests {
    use super::{
        bpp_data_version_path, compare_version_strings, ensure_bpp_data_version_file,
        is_compatible_bpp_data_version, CURRENT_BPP_DATA_VERSION,
    };

    #[test]
    fn test_ensure_bpp_data_version_file_creates_version_marker() {
        let tmp = tempfile::tempdir().unwrap();

        ensure_bpp_data_version_file(tmp.path()).unwrap();

        assert_eq!(
            std::fs::read_to_string(bpp_data_version_path(tmp.path()))
                .unwrap()
                .trim(),
            CURRENT_BPP_DATA_VERSION
        );
    }

    #[test]
    fn test_is_compatible_bpp_data_version_matches_current_version() {
        assert!(is_compatible_bpp_data_version(
            CURRENT_BPP_DATA_VERSION,
            CURRENT_BPP_DATA_VERSION
        ));
        assert!(!is_compatible_bpp_data_version(
            "0",
            CURRENT_BPP_DATA_VERSION
        ));
    }

    #[test]
    fn test_is_compatible_bpp_data_version_accepts_versions_in_supported_range() {
        assert!(is_compatible_bpp_data_version("2.9.8", "2.9.0"));
        assert!(!is_compatible_bpp_data_version("2.8.9", "2.9.0"));
        assert!(is_compatible_bpp_data_version("999.0.0", "2.9.0"));
    }

    #[test]
    fn test_compare_version_strings_compares_dot_versions() {
        assert_eq!(
            compare_version_strings("2.9.9", "2.9.8"),
            Some(std::cmp::Ordering::Greater)
        );
        assert_eq!(
            compare_version_strings("2.9", "2.9.0"),
            Some(std::cmp::Ordering::Equal)
        );
        assert_eq!(compare_version_strings("bad", "2.9.0"), None);
    }
}
```

- [ ] **Step 2.3: cargo check fails**

```
cargo check --manifest-path src-tauri/Cargo.toml --tests
```

Expected: multiple `cannot find` errors. Confirms the failing-test hook.

- [ ] **Step 2.4: Move the versioning implementations into `versioning.rs`**

Prepend above the `#[cfg(test)] mod tests` block. Copy each body byte-for-byte from `bepinex.rs`. Apply these visibilities:

```rust
use serde::Deserialize;
use std::path::Path;
use tauri::Manager;

pub(crate) const LEGACY_RECORD_DIRECTORY: &str = "BazaarPlusPlus";
pub(crate) const BPP_DATA_VERSION_FILE_NAME: &str = "BPPData.version";
pub(crate) const CURRENT_BPP_DATA_VERSION: &str = env!("CARGO_PKG_VERSION");
const BPP_DATA_VERSION_POLICY_RESOURCE_PATH: &str = "BppDataVersionPolicy.json";

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub(crate) struct BppDataVersionPolicy {
    pub(crate) minimum_supported_bpp_data_version: String,
}

pub(crate) fn default_bpp_data_version_policy() -> BppDataVersionPolicy {
    BppDataVersionPolicy {
        minimum_supported_bpp_data_version: CURRENT_BPP_DATA_VERSION.to_string(),
    }
}

pub(crate) fn read_bundled_bpp_data_version_policy(
    app: &tauri::AppHandle,
) -> Result<BppDataVersionPolicy, String> {
    // body verbatim from bepinex.rs
}

fn parse_version_components(version: &str) -> Option<Vec<u64>> {
    // body verbatim
}

pub(super) fn compare_version_strings(left: &str, right: &str) -> Option<std::cmp::Ordering> {
    // body verbatim — narrow from implicit-private to pub(super) because the test
    // module exercises it explicitly and no cross-module caller exists outside
    // tests.
}

pub(crate) fn is_compatible_bpp_data_version(
    version: &str,
    minimum_supported_version: &str,
) -> bool {
    // body verbatim
}

pub(crate) fn bpp_data_version_path(game_path: &Path) -> std::path::PathBuf {
    // body verbatim
}

pub(crate) fn ensure_bpp_data_version_file(game_path: &Path) -> Result<(), String> {
    // body verbatim
}
```

**Note on `BppDataVersionPolicy` field visibility:** the original `detect/mod.rs::detect_environment` accesses `bpp_data_version_policy.minimum_supported_bpp_data_version` — this requires the field to be visible at that call site. The original field was `pub`; narrow to `pub(crate)` to match the struct's visibility.

**Note on `compare_version_strings`:** originally private (no visibility qualifier) in `bepinex.rs`. It is called from `is_compatible_bpp_data_version` (same module) and from the test `test_compare_version_strings_compares_dot_versions`. Keep it private — the child `mod tests` can still access sibling-private items. The `pub(super)` qualifier shown above is wrong — revert the thought: keep `fn compare_version_strings(...)`.

- [ ] **Step 2.5: Remove the same items from `bepinex.rs`**

1. Delete the four constants (`LEGACY_RECORD_DIRECTORY`, `BPP_DATA_VERSION_FILE_NAME`, `CURRENT_BPP_DATA_VERSION`, `BPP_DATA_VERSION_POLICY_RESOURCE_PATH`).
2. Delete `BppDataVersionPolicy` struct.
3. Delete `default_bpp_data_version_policy`, `read_bundled_bpp_data_version_policy`, `parse_version_components`, `compare_version_strings`, `is_compatible_bpp_data_version`, `bpp_data_version_path`, `ensure_bpp_data_version_file`.
4. Delete the 4 tests from `mod tests` (`test_ensure_bpp_data_version_file_creates_version_marker`, `test_is_compatible_bpp_data_version_matches_current_version`, `test_is_compatible_bpp_data_version_accepts_versions_in_supported_range`, `test_compare_version_strings_compares_dot_versions`).
5. **Update the `payload`-area function bodies still living in `bepinex.rs`** (they'll move to `payload.rs` in Task 3, but for this intermediate step they must continue to resolve):
   - `cleanup_legacy_record_directory` references `LEGACY_RECORD_DIRECTORY` — change to `versioning::LEGACY_RECORD_DIRECTORY`.
   - `legacy_record_directory_size_bytes` references `LEGACY_RECORD_DIRECTORY` similarly — update.
   - The `#[tauri::command] fn repair_bpp` body references `ensure_bpp_data_version_file` — update to `versioning::ensure_bpp_data_version_file`.
6. Update remaining test references in `bepinex.rs::tests` that still exist:
   - `test_cleanup_legacy_record_directory_removes_bazaarplusplus_directory` uses `LEGACY_RECORD_DIRECTORY` via `use super::*;` — still works because Step 2.6 adds a `pub(crate) use versioning::...` re-export block to `bepinex.rs` (which `use super::*;` will pick up).
   - `test_repair_bpp_removes_legacy_directory_for_installed_v1` uses `LEGACY_RECORD_DIRECTORY`, `BPP_DATA_VERSION_FILE_NAME`, `CURRENT_BPP_DATA_VERSION` — same re-export covers them.
   - `test_legacy_record_directory_size_bytes_*` uses `LEGACY_RECORD_DIRECTORY` — same.
7. Add to `bepinex.rs` (below the two `#[path]` decls):

```rust
pub(crate) use versioning::{
    bpp_data_version_path, default_bpp_data_version_policy, ensure_bpp_data_version_file,
    is_compatible_bpp_data_version, read_bundled_bpp_data_version_policy,
    BPP_DATA_VERSION_FILE_NAME, CURRENT_BPP_DATA_VERSION, LEGACY_RECORD_DIRECTORY,
};
```

`BppDataVersionPolicy` does NOT need a re-export because `detect/mod.rs` does not name the type directly — it only calls the two constructors.

8. Remove any now-unused imports from the top of `bepinex.rs`:
   - `use serde::Serialize;` — still used by `LegacyRecordDirectoryInfo`. KEEP.
   - Any `serde::Deserialize` or `serde_json` lines that may have moved to `versioning.rs`. Re-check.

Do NOT add `#[allow(...)]`. Delete, don't suppress.

- [ ] **Step 2.6: Run tests — 16/16 green**

```
cargo test --manifest-path src-tauri/Cargo.toml --lib commands::bepinex
```

Expected: 16 tests pass — 2 `zip_archive::tests` + 4 `versioning::tests` + 10 `bepinex::tests`.

```
cargo build --manifest-path src-tauri/Cargo.toml --lib
```

Warning-free.

- [ ] **Step 2.7: Verify external callers**

```
cargo check --manifest-path src-tauri/Cargo.toml --lib
```

Must succeed including:
- `detect/mod.rs` importing `crate::commands::bepinex::{read_bundled_bpp_data_version_policy, default_bpp_data_version_policy}`
- `detect/game.rs` importing `crate::commands::bepinex::{LEGACY_RECORD_DIRECTORY, bpp_data_version_path, is_compatible_bpp_data_version, ensure_bpp_data_version_file, CURRENT_BPP_DATA_VERSION, BPP_DATA_VERSION_FILE_NAME}`

- [ ] **Step 2.8: Commit**

```
git add src-tauri/src/commands/bepinex.rs src-tauri/src/commands/bepinex/versioning.rs
git commit -m "Extract BPP data versioning into commands::bepinex::versioning

Moves LEGACY_RECORD_DIRECTORY, BPP_DATA_VERSION_FILE_NAME,
CURRENT_BPP_DATA_VERSION, BPP_DATA_VERSION_POLICY_RESOURCE_PATH,
BppDataVersionPolicy, default_bpp_data_version_policy,
read_bundled_bpp_data_version_policy, parse_version_components,
compare_version_strings, is_compatible_bpp_data_version,
bpp_data_version_path, and ensure_bpp_data_version_file plus the
four versioning unit tests into commands/bepinex/versioning.rs.
The #[path] attribute bridges until Task 4.

Crate-external callers in commands::detect still import these items
as crate::commands::bepinex::*, preserved via a pub(crate) use
re-export block at the facade. Intra-bepinex call sites (still
living in bepinex.rs until Task 3) now qualify constants and helpers
through versioning:: directly."
```

---

## Task 3: Extract `bepinex/payload.rs`

**Files:**
- Create: `src-tauri/src/commands/bepinex/payload.rs`
- Modify: `src-tauri/src/commands/bepinex.rs`

- [ ] **Step 3.1: Add the submodule declaration**

At the top of `bepinex.rs`, below the existing two `#[path]` decls, add:

```rust
#[path = "bepinex/payload.rs"]
mod payload;
```

- [ ] **Step 3.2: Write the failing test file**

Create `src-tauri/src/commands/bepinex/payload.rs` containing ONLY a `mod tests` block with all 9 payload tests copied VERBATIM from `bepinex.rs::tests`:

- `test_ensure_valid_game_path_rejects_non_game_directory`
- `test_prepare_install_target_cleans_previous_payload`
- `test_prepare_install_target_keeps_legacy_directory_for_installed_v1`
- `test_uninstall_payload_removes_platform_files`
- `test_cleanup_legacy_record_directory_removes_bazaarplusplus_directory`
- `test_legacy_record_directory_size_bytes_sums_nested_files`
- `test_legacy_record_directory_size_bytes_returns_zero_when_missing`
- `test_preserve_file_if_exists_reads_existing_file`
- `test_restore_preserved_file_recreates_parent_directory`

Test-module imports:

```rust
#[cfg(test)]
mod tests {
    use super::{
        cleanup_legacy_record_directory, ensure_valid_game_path, legacy_record_directory_size_bytes,
        prepare_install_target, preserve_file_if_exists, restore_preserved_file, uninstall_payload,
        PreservedFile, BPP_CONFIG_RELATIVE_PATH,
    };
    use super::super::versioning::LEGACY_RECORD_DIRECTORY;

    // ... 9 test function bodies copied verbatim from bepinex.rs::tests ...
}
```

Copy each of the 9 test function bodies BYTE-FOR-BYTE. Do not rename a single variable. Do not reformat. Do not improve anything.

- [ ] **Step 3.3: cargo check fails**

```
cargo check --manifest-path src-tauri/Cargo.toml --tests
```

Expected: cascade of unresolved-import errors. Confirms the hook.

- [ ] **Step 3.4: Move the payload implementations**

Prepend above the `#[cfg(test)] mod tests` block. Copy each body byte-for-byte from `bepinex.rs` with these visibilities:

```rust
use std::path::Path;

pub(super) const BPP_CONFIG_RELATIVE_PATH: &str = "BepInEx/config/BazaarPlusPlus.cfg";

pub(super) struct PreservedFile {
    pub(super) relative_path: &'static str,
    pub(super) contents: Vec<u8>,
}

fn remove_path_if_exists(path: &Path) -> Result<(), String> {
    // body verbatim
}

pub(super) fn uninstall_payload(game_path: &Path) -> Result<(), String> {
    // body verbatim
}

pub(super) fn ensure_valid_game_path(game_path: &Path) -> Result<(), String> {
    // body verbatim — still calls crate::commands::detect::is_valid_game_path
}

pub(super) fn prepare_install_target(game_path: &Path) -> Result<(), String> {
    ensure_valid_game_path(game_path)?;
    uninstall_payload(game_path)
}

pub(super) fn preserve_file_if_exists(
    base_dir: &Path,
    relative_path: &'static str,
) -> Result<Option<PreservedFile>, String> {
    // body verbatim
}

pub(super) fn restore_preserved_file(base_dir: &Path, preserved: &PreservedFile) -> Result<(), String> {
    // body verbatim
}

pub(super) fn cleanup_legacy_record_directory(game_path: &Path) -> Result<(), String> {
    remove_path_if_exists(&game_path.join(super::versioning::LEGACY_RECORD_DIRECTORY))
}

pub(super) fn legacy_record_directory_size_bytes(game_path: &Path) -> Result<u64, String> {
    // body verbatim, except the inner `collect_size` call on
    // `game_path.join(LEGACY_RECORD_DIRECTORY)` must become
    // `game_path.join(super::versioning::LEGACY_RECORD_DIRECTORY)`.
}
```

**Cross-submodule reach:** `cleanup_legacy_record_directory` and `legacy_record_directory_size_bytes` reference `LEGACY_RECORD_DIRECTORY`. After this task they live in `payload.rs` but the constant lives in `versioning.rs` — reference it via `super::versioning::LEGACY_RECORD_DIRECTORY`.

**`PreservedFile` fields:** in `bepinex.rs` they were private struct fields — `restore_preserved_file` was in the same module so it could read them. After extraction, `restore_preserved_file` is still in the same `payload.rs`, so private fields would work — BUT `install_bepinex` in `bepinex.rs` (until Task 4 collapses to `mod.rs`) calls `preserve_file_if_exists(...)?` and passes the result through to `restore_preserved_file(...)`. It never reads the fields directly, so field visibility doesn't matter for `bepinex.rs`. Keep fields `pub(super)` to mirror the struct's own `pub(super)` and avoid accidentally tightening past what compiles. Re-evaluate if clippy flags them.

- [ ] **Step 3.5: Remove the same items from `bepinex.rs`**

1. Delete the 10 items listed in Step 3.4 (const, struct, 8 functions — no `remove_path_if_exists` stays; it's private to payload.rs).
2. Delete the 9 payload tests from `mod tests`.
3. Update `install_bepinex` call sites:
   - `preserve_file_if_exists(game_path, BPP_CONFIG_RELATIVE_PATH)?` → `payload::preserve_file_if_exists(game_path, payload::BPP_CONFIG_RELATIVE_PATH)?`
   - `prepare_install_target(game_path)?` → `payload::prepare_install_target(game_path)?`
   - `restore_preserved_file(game_path, preserved)` → `payload::restore_preserved_file(game_path, preserved)`
4. Update `repair_bpp` call sites:
   - `ensure_valid_game_path(game_path)?` → `payload::ensure_valid_game_path(game_path)?`
   - `cleanup_legacy_record_directory(game_path)?` → `payload::cleanup_legacy_record_directory(game_path)?`
   - `ensure_bpp_data_version_file(game_path)?` stays as is — it's already imported via the `pub(crate) use versioning::...` re-export.
5. Update `get_legacy_record_directory_info`:
   - `ensure_valid_game_path(game_path)?` → `payload::ensure_valid_game_path(game_path)?`
   - `legacy_record_directory_size_bytes(game_path)?` → `payload::legacy_record_directory_size_bytes(game_path)?`
6. Update `uninstall_bpp`:
   - `ensure_valid_game_path(game_path)?` → `payload::ensure_valid_game_path(game_path)?`
   - `uninstall_payload(game_path)?` → `payload::uninstall_payload(game_path)?`
7. If `use std::path::Path;` in `bepinex.rs` was only used by the moved functions, check whether it's still used by the four Tauri commands (`let game_path = Path::new(&game_path);`). It is — KEEP.
8. If `test_repair_bpp_removes_legacy_directory_for_installed_v1` is the only test left and it still references `LEGACY_RECORD_DIRECTORY`, `BPP_DATA_VERSION_FILE_NAME`, `CURRENT_BPP_DATA_VERSION` via `use super::*;` — verify the `pub(crate) use versioning::...` block makes them visible. It does.

Do NOT add any `#[allow(...)]`. Delete unused imports.

- [ ] **Step 3.6: Run tests**

```
cargo test --manifest-path src-tauri/Cargo.toml --lib commands::bepinex
```

Expected: 16 tests pass — 2 `zip_archive::tests` + 4 `versioning::tests` + 9 `payload::tests` + 1 `bepinex::tests` (only `test_repair_bpp_removes_legacy_directory_for_installed_v1` remains).

```
cargo build --manifest-path src-tauri/Cargo.toml --lib
```

Warning-free.

```
cargo check --manifest-path src-tauri/Cargo.toml --lib
```

Clean.

- [ ] **Step 3.7: Commit**

```
git add src-tauri/src/commands/bepinex.rs src-tauri/src/commands/bepinex/payload.rs
git commit -m "Extract filesystem payload operations into commands::bepinex::payload

Moves BPP_CONFIG_RELATIVE_PATH, PreservedFile, remove_path_if_exists,
uninstall_payload, ensure_valid_game_path, prepare_install_target,
preserve_file_if_exists, restore_preserved_file,
cleanup_legacy_record_directory, and legacy_record_directory_size_bytes
plus 9 unit tests into commands/bepinex/payload.rs. The #[path]
attribute bridges until Task 4.

All helpers are pub(super); the four Tauri commands in bepinex.rs
now call them via payload::. Cross-submodule references to
versioning::LEGACY_RECORD_DIRECTORY are fully qualified through the
sibling module. No behavior change; test semantics preserved
byte-for-byte."
```

---

## Task 4: Collapse `bepinex.rs` into `bepinex/mod.rs`

**Files:**
- Move: `src-tauri/src/commands/bepinex.rs` → `src-tauri/src/commands/bepinex/mod.rs`
- Modify: the moved file to drop the `#[path]` attributes

- [ ] **Step 4.1: `git mv` the file**

```
git mv src-tauri/src/commands/bepinex.rs src-tauri/src/commands/bepinex/mod.rs
```

- [ ] **Step 4.2: Drop the `#[path]` attributes**

In `src-tauri/src/commands/bepinex/mod.rs`, replace the three decorated lines at the top:

```rust
#[path = "bepinex/zip_archive.rs"]
mod zip_archive;
#[path = "bepinex/versioning.rs"]
mod versioning;
#[path = "bepinex/payload.rs"]
mod payload;
```

with:

```rust
mod payload;
mod versioning;
mod zip_archive;
```

(Alphabetical order, matching the Phase 1.1 and 1.2 final state.)

- [ ] **Step 4.3: Verify full crate tests green**

```
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

Expected: all 96 tests pass (2 zip_archive + 4 versioning + 9 payload + 1 bepinex + 14 detect + 2 game_process + 64 stream/identity/misc — the exact count may differ; what matters is 0 failures).

- [ ] **Step 4.4: Confirm external callers still resolve**

```
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: zero warnings. The following call sites must compile:
- `src-tauri/src/lib.rs:10` — `bepinex::{get_legacy_record_directory_info, install_bepinex, repair_bpp, uninstall_bpp}`
- `src-tauri/src/commands/detect/mod.rs:52,56,57` — `crate::commands::bepinex::{read_bundled_bpp_version, read_bundled_bpp_data_version_policy, default_bpp_data_version_policy}`
- `src-tauri/src/commands/detect/game.rs` — all 10 references to `crate::commands::bepinex::*`

- [ ] **Step 4.5: Sanity pass: `npm run check`**

```
npm run check
```

Expected: 0 errors. Phase 1.3 does not touch any TypeScript; this is belt-and-braces.

- [ ] **Step 4.6: Commit**

```
git add src-tauri/src/commands/bepinex/mod.rs
git commit -m "Collapse commands::bepinex facade into bepinex/mod.rs

Closes the Phase 1.3 split by renaming bepinex.rs -> bepinex/mod.rs
and dropping the three #[path = \"bepinex/*.rs\"] attributes used
during the transitional split (Tasks 1-3 needed them because
bepinex.rs and bepinex/mod.rs cannot coexist). The three submodules
are now declared plainly as mod payload; mod versioning; mod zip_archive;
in alphabetical order — matching the Phase 1.1 stream/records and
Phase 1.2 commands/detect precedents.

No behavior change, no API surface change."
```

---

## Task 5: Final audit and open PR

- [ ] **Step 5.1: Confirm directory layout**

```
ls -la src-tauri/src/commands/bepinex
```

Expected:

```
mod.rs
payload.rs
versioning.rs
zip_archive.rs
```

```
ls src-tauri/src/commands/bepinex.rs 2>/dev/null
```

Expected: no such file.

- [ ] **Step 5.2: Confirm per-file line counts**

```
wc -l src-tauri/src/commands/bepinex/*.rs
```

Target: no file above ~300 lines. If `payload.rs` breaches this, note it in the PR description (it's the largest cluster and borderline).

- [ ] **Step 5.3: Warning-free build & full suite**

```
cargo build --manifest-path src-tauri/Cargo.toml --lib
cargo test --manifest-path src-tauri/Cargo.toml --lib
npm run check
```

All three must pass clean.

- [ ] **Step 5.4: Grep for suppressed warnings**

```
rg -n '#\[allow\(' src-tauri/src/commands/bepinex
rg -n 'let _ = ' src-tauri/src/commands/bepinex
```

Expected: zero matches for both.

- [ ] **Step 5.5: Open the PR**

Branch: `phase-1-3-bepinex-split`

Title: `Split commands/bepinex into focused submodules`

Body:

```markdown
## Summary
- Split `src-tauri/src/commands/bepinex.rs` (675 lines, 16 tests) into `src-tauri/src/commands/bepinex/` with four focused files:
  - `mod.rs` — `debug_log!`/`debug_error!` macros, `LegacyRecordDirectoryInfo` DTO, and the four `#[tauri::command]` entry points (`repair_bpp`, `get_legacy_record_directory_info`, `install_bepinex`, `uninstall_bpp`) plus the facade re-exports for cross-module callers
  - `zip_archive.rs` — bundled BepInEx.zip location + reading (`bundled_zip_relative_path`, `read_bundled_bpp_version`, `extract_zip`)
  - `versioning.rs` — BPP data version constants, `BppDataVersionPolicy`, version comparison + file management (`is_compatible_bpp_data_version`, `bpp_data_version_path`, `ensure_bpp_data_version_file`, etc.)
  - `payload.rs` — filesystem operations for install/uninstall (`prepare_install_target`, `uninstall_payload`, `preserve_file_if_exists`, `restore_preserved_file`, `cleanup_legacy_record_directory`, `legacy_record_directory_size_bytes`)
- No behavior change. Public API preserved via re-exports:
  - `commands::bepinex::{get_legacy_record_directory_info, install_bepinex, repair_bpp, uninstall_bpp}` — still the same Tauri handlers
  - `commands::bepinex::read_bundled_bpp_version` — for `commands::detect::detect_environment`
  - `commands::bepinex::{read_bundled_bpp_data_version_policy, default_bpp_data_version_policy}` — for `commands::detect::detect_environment`
  - `commands::bepinex::{LEGACY_RECORD_DIRECTORY, bpp_data_version_path, is_compatible_bpp_data_version, ensure_bpp_data_version_file, CURRENT_BPP_DATA_VERSION, BPP_DATA_VERSION_FILE_NAME}` — for `commands::detect::game::inspect_bpp_data_directory` and its tests
- Visibility narrowed throughout: `pub(super)` for intra-module helpers, `pub(crate)` only where a caller outside `commands::bepinex` actually needs the name, private otherwise. No `#[allow(...)]` suppressions anywhere.
- 16 tests still pass — split as 2 zip_archive + 4 versioning + 9 payload + 1 bepinex::tests.

## Test plan
- [x] `cargo test --manifest-path src-tauri/Cargo.toml --lib` — full crate suite
- [x] `cargo build --manifest-path src-tauri/Cargo.toml --lib` — warning-clean
- [x] `npm run check` — 0 errors, 0 warnings
- [x] External callers still resolve: `lib.rs`, `commands/detect/mod.rs`, `commands/detect/game.rs`

Parent spec: `docs/superpowers/specs/2026-04-17-installer-cohesion-refactor-design.md` Phase 1.3
Implementation plan: `docs/superpowers/plans/2026-04-17-installer-phase-1-3-bepinex-split.md`

Release Notes:

- N/A
```

- [ ] **Step 5.6: Wait for review.** Do not start Phase 2 until this PR lands.

---

## Self-Review Notes

- Every task produces a working crate state — `cargo test` passes after each commit.
- Test semantics preserved verbatim; only paths and `use super::{...}` imports change.
- Visibility hierarchy: `pub` nowhere (nothing crosses the crate boundary); `pub(crate)` where `commands::detect::*` reaches in; `pub(super)` for intra-`bepinex/*` calls; private within a single file otherwise.
- The `#[path]` trick is identical to Phase 1.1 and 1.2 — it sidesteps the Rust constraint that `bepinex.rs` and `bepinex/mod.rs` cannot coexist until Task 4's `git mv`.
- `payload.rs::cleanup_legacy_record_directory` and `legacy_record_directory_size_bytes` reach a sibling constant via `super::versioning::LEGACY_RECORD_DIRECTORY`. `payload.rs::tests` imports that same constant via `use super::super::versioning::LEGACY_RECORD_DIRECTORY;`. Consider replacing both with a top-level `use super::versioning;` in `payload.rs` during code-quality review if the reviewer prefers.
- The `debug_log!`/`debug_error!` macros stay in `mod.rs`. They are `#[cfg(debug_assertions)]`-gated `println!`/`eprintln!` wrappers used only by the four Tauri commands, which also stay in `mod.rs`. No sibling module needs them.
