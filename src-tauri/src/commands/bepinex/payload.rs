// src-tauri/src/commands/bepinex/payload.rs
use std::path::Path;

use super::versioning;

pub(super) const BPP_CONFIG_RELATIVE_PATH: &str = "BepInEx/config/BazaarPlusPlus.cfg";

pub(super) struct PreservedFile {
    relative_path: &'static str,
    contents: Vec<u8>,
}

fn remove_path_if_exists(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }

    if path.is_dir() {
        std::fs::remove_dir_all(path)
            .map_err(|err| format!("Cannot remove {}: {err}", path.display()))
    } else {
        std::fs::remove_file(path).map_err(|err| format!("Cannot remove {}: {err}", path.display()))
    }
}

pub(super) fn uninstall_payload(game_path: &Path) -> Result<(), String> {
    remove_path_if_exists(&game_path.join("BepInEx"))?;

    #[cfg(target_os = "macos")]
    {
        remove_path_if_exists(&game_path.join("run_bepinex.sh"))?;
        remove_path_if_exists(&game_path.join("libdoorstop.dylib"))?;
    }

    #[cfg(target_os = "windows")]
    {
        remove_path_if_exists(&game_path.join("doorstop_config.ini"))?;
        remove_path_if_exists(&game_path.join("winhttp.dll"))?;
    }

    Ok(())
}

pub(super) fn ensure_valid_game_path(game_path: &Path) -> Result<(), String> {
    if crate::commands::detect::is_valid_game_path(game_path) {
        return Ok(());
    }

    Err(format!(
        "Selected path is not a valid The Bazaar installation: {}",
        game_path.display()
    ))
}

pub(super) fn prepare_install_target(game_path: &Path) -> Result<(), String> {
    ensure_valid_game_path(game_path)?;
    uninstall_payload(game_path)
}

pub(super) fn preserve_file_if_exists(
    base_dir: &Path,
    relative_path: &'static str,
) -> Result<Option<PreservedFile>, String> {
    let path = base_dir.join(relative_path);
    if !path.exists() {
        return Ok(None);
    }

    let contents =
        std::fs::read(&path).map_err(|err| format!("Cannot preserve {}: {err}", path.display()))?;

    Ok(Some(PreservedFile {
        relative_path,
        contents,
    }))
}

pub(super) fn restore_preserved_file(
    base_dir: &Path,
    preserved: &PreservedFile,
) -> Result<(), String> {
    let path = base_dir.join(preserved.relative_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|err| format!("Cannot recreate {}: {err}", parent.display()))?;
    }

    std::fs::write(&path, &preserved.contents)
        .map_err(|err| format!("Cannot restore {}: {err}", path.display()))
}

pub(super) fn cleanup_legacy_record_directory(game_path: &Path) -> Result<(), String> {
    remove_path_if_exists(&game_path.join(versioning::LEGACY_RECORD_DIRECTORY))
}

pub(super) fn legacy_record_directory_size_bytes(game_path: &Path) -> Result<u64, String> {
    fn collect_size(path: &Path) -> Result<u64, String> {
        if !path.exists() {
            return Ok(0);
        }

        let metadata = std::fs::metadata(path)
            .map_err(|err| format!("Cannot read metadata for {}: {err}", path.display()))?;
        if metadata.is_file() {
            return Ok(metadata.len());
        }

        let mut total = 0;
        let entries = std::fs::read_dir(path)
            .map_err(|err| format!("Cannot read directory {}: {err}", path.display()))?;
        for entry in entries {
            let entry = entry.map_err(|err| err.to_string())?;
            total += collect_size(&entry.path())?;
        }

        Ok(total)
    }

    collect_size(&game_path.join(versioning::LEGACY_RECORD_DIRECTORY))
}

#[cfg(test)]
mod tests {
    use super::{
        cleanup_legacy_record_directory, ensure_valid_game_path, legacy_record_directory_size_bytes,
        prepare_install_target, preserve_file_if_exists, restore_preserved_file, uninstall_payload,
        PreservedFile, BPP_CONFIG_RELATIVE_PATH,
    };
    use super::versioning::LEGACY_RECORD_DIRECTORY;

    #[test]
    fn test_ensure_valid_game_path_rejects_non_game_directory() {
        let tmp = tempfile::tempdir().unwrap();

        let result = ensure_valid_game_path(tmp.path());

        assert!(result.is_err());
    }

    #[test]
    fn test_prepare_install_target_cleans_previous_payload() {
        let tmp = tempfile::tempdir().unwrap();

        #[cfg(target_os = "macos")]
        {
            std::fs::create_dir_all(tmp.path().join("TheBazaar.app")).unwrap();
            std::fs::create_dir_all(tmp.path().join("BepInEx/plugins")).unwrap();
            std::fs::write(tmp.path().join("run_bepinex.sh"), b"#!/bin/sh\n").unwrap();
            std::fs::write(tmp.path().join("libdoorstop.dylib"), b"dylib").unwrap();
        }

        #[cfg(target_os = "windows")]
        {
            std::fs::write(tmp.path().join("TheBazaar.exe"), b"exe").unwrap();
            std::fs::create_dir_all(tmp.path().join("BepInEx/plugins")).unwrap();
            std::fs::write(tmp.path().join("doorstop_config.ini"), b"cfg").unwrap();
            std::fs::write(tmp.path().join("winhttp.dll"), b"dll").unwrap();
        }

        std::fs::write(tmp.path().join("BepInEx/plugins/old.dll"), b"dll").unwrap();

        prepare_install_target(tmp.path()).unwrap();

        assert!(!tmp.path().join("BepInEx").exists());
        #[cfg(target_os = "macos")]
        {
            assert!(!tmp.path().join("run_bepinex.sh").exists());
            assert!(!tmp.path().join("libdoorstop.dylib").exists());
        }
        #[cfg(target_os = "windows")]
        {
            assert!(!tmp.path().join("doorstop_config.ini").exists());
            assert!(!tmp.path().join("winhttp.dll").exists());
        }
    }

    #[test]
    fn test_prepare_install_target_keeps_legacy_directory_for_installed_v1() {
        let tmp = tempfile::tempdir().unwrap();
        let plugins_dir = tmp.path().join("BepInEx/plugins");
        let legacy_dir = tmp.path().join("BazaarPlusPlus");

        #[cfg(target_os = "macos")]
        {
            std::fs::create_dir_all(tmp.path().join("TheBazaar.app")).unwrap();
            std::fs::write(tmp.path().join("run_bepinex.sh"), b"#!/bin/sh\n").unwrap();
            std::fs::write(tmp.path().join("libdoorstop.dylib"), b"dylib").unwrap();
        }

        #[cfg(target_os = "windows")]
        {
            std::fs::write(tmp.path().join("TheBazaar.exe"), b"exe").unwrap();
            std::fs::write(tmp.path().join("doorstop_config.ini"), b"cfg").unwrap();
            std::fs::write(tmp.path().join("winhttp.dll"), b"dll").unwrap();
        }

        std::fs::create_dir_all(&plugins_dir).unwrap();
        std::fs::create_dir_all(&legacy_dir).unwrap();
        std::fs::write(plugins_dir.join("BazaarPlusPlus.version"), b"1.9.0").unwrap();
        std::fs::write(legacy_dir.join("legacy.dll"), b"dll").unwrap();

        prepare_install_target(tmp.path()).unwrap();

        assert!(legacy_dir.exists());
    }

    #[test]
    fn test_uninstall_payload_removes_platform_files() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(tmp.path().join("BepInEx/plugins")).unwrap();
        std::fs::write(
            tmp.path().join("BepInEx/plugins/BazaarPlusPlus.dll"),
            b"dll",
        )
        .unwrap();

        #[cfg(target_os = "macos")]
        {
            std::fs::write(tmp.path().join("run_bepinex.sh"), b"#!/bin/sh\n").unwrap();
            std::fs::write(tmp.path().join("libdoorstop.dylib"), b"dylib").unwrap();
        }

        #[cfg(target_os = "windows")]
        {
            std::fs::write(tmp.path().join("doorstop_config.ini"), b"cfg").unwrap();
            std::fs::write(tmp.path().join("winhttp.dll"), b"dll").unwrap();
        }

        uninstall_payload(tmp.path()).unwrap();

        assert!(!tmp.path().join("BepInEx").exists());
        #[cfg(target_os = "macos")]
        {
            assert!(!tmp.path().join("run_bepinex.sh").exists());
            assert!(!tmp.path().join("libdoorstop.dylib").exists());
        }
        #[cfg(target_os = "windows")]
        {
            assert!(!tmp.path().join("doorstop_config.ini").exists());
            assert!(!tmp.path().join("winhttp.dll").exists());
        }
    }

    #[test]
    fn test_cleanup_legacy_record_directory_removes_bazaarplusplus_directory() {
        let tmp = tempfile::tempdir().unwrap();
        let legacy_dir = tmp.path().join(LEGACY_RECORD_DIRECTORY);
        std::fs::create_dir_all(&legacy_dir).unwrap();
        std::fs::write(legacy_dir.join("legacy.dll"), b"dll").unwrap();

        cleanup_legacy_record_directory(tmp.path()).unwrap();

        assert!(!legacy_dir.exists());
    }

    #[test]
    fn test_legacy_record_directory_size_bytes_sums_nested_files() {
        let tmp = tempfile::tempdir().unwrap();
        let legacy_dir = tmp.path().join(LEGACY_RECORD_DIRECTORY);
        std::fs::create_dir_all(legacy_dir.join("nested")).unwrap();
        std::fs::write(legacy_dir.join("a.bin"), [0_u8; 3]).unwrap();
        std::fs::write(legacy_dir.join("nested").join("b.bin"), [0_u8; 5]).unwrap();

        let total = legacy_record_directory_size_bytes(tmp.path()).unwrap();

        assert_eq!(total, 8);
    }

    #[test]
    fn test_legacy_record_directory_size_bytes_returns_zero_when_missing() {
        let tmp = tempfile::tempdir().unwrap();

        let total = legacy_record_directory_size_bytes(tmp.path()).unwrap();

        assert_eq!(total, 0);
    }

    #[test]
    fn test_preserve_file_if_exists_reads_existing_file() {
        let tmp = tempfile::tempdir().unwrap();
        let config_path = tmp.path().join(BPP_CONFIG_RELATIVE_PATH);
        std::fs::create_dir_all(config_path.parent().unwrap()).unwrap();
        std::fs::write(&config_path, b"user-config").unwrap();

        let preserved = preserve_file_if_exists(tmp.path(), BPP_CONFIG_RELATIVE_PATH)
            .unwrap()
            .expect("expected preserved config");

        assert_eq!(preserved.relative_path, BPP_CONFIG_RELATIVE_PATH);
        assert_eq!(preserved.contents, b"user-config");
    }

    #[test]
    fn test_restore_preserved_file_recreates_parent_directory() {
        let tmp = tempfile::tempdir().unwrap();
        let preserved = PreservedFile {
            relative_path: BPP_CONFIG_RELATIVE_PATH,
            contents: b"user-config".to_vec(),
        };

        restore_preserved_file(tmp.path(), &preserved).unwrap();

        assert_eq!(
            std::fs::read(tmp.path().join(BPP_CONFIG_RELATIVE_PATH)).unwrap(),
            b"user-config"
        );
    }
}
