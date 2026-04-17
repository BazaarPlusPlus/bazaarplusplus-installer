#[path = "bepinex/zip_archive.rs"]
mod zip_archive;
pub(crate) use zip_archive::read_bundled_bpp_version;

use serde::Serialize;
use std::path::Path;
use tauri::Manager;

macro_rules! debug_log {
    ($($arg:tt)*) => {
        #[cfg(debug_assertions)]
        println!($($arg)*);
    };
}

macro_rules! debug_error {
    ($($arg:tt)*) => {
        #[cfg(debug_assertions)]
        eprintln!($($arg)*);
    };
}

const BPP_CONFIG_RELATIVE_PATH: &str = "BepInEx/config/BazaarPlusPlus.cfg";
pub(crate) const LEGACY_RECORD_DIRECTORY: &str = "BazaarPlusPlus";
pub(crate) const BPP_DATA_VERSION_FILE_NAME: &str = "BPPData.version";
pub(crate) const CURRENT_BPP_DATA_VERSION: &str = env!("CARGO_PKG_VERSION");
const BPP_DATA_VERSION_POLICY_RESOURCE_PATH: &str = "BppDataVersionPolicy.json";

#[derive(Debug, Serialize)]
pub struct LegacyRecordDirectoryInfo {
    pub total_bytes: u64,
}

#[derive(Debug, Clone, serde::Deserialize, PartialEq, Eq)]
pub(crate) struct BppDataVersionPolicy {
    pub minimum_supported_bpp_data_version: String,
}

struct PreservedFile {
    relative_path: &'static str,
    contents: Vec<u8>,
}

pub(crate) fn default_bpp_data_version_policy() -> BppDataVersionPolicy {
    BppDataVersionPolicy {
        minimum_supported_bpp_data_version: CURRENT_BPP_DATA_VERSION.to_string(),
    }
}

pub(crate) fn read_bundled_bpp_data_version_policy(
    app: &tauri::AppHandle,
) -> Result<BppDataVersionPolicy, String> {
    let resource_path = app
        .path()
        .resource_dir()
        .map_err(|err| err.to_string())?
        .join(BPP_DATA_VERSION_POLICY_RESOURCE_PATH);
    let raw = std::fs::read_to_string(&resource_path)
        .map_err(|err| format!("Cannot read {}: {err}", resource_path.display()))?;
    let policy = serde_json::from_str::<BppDataVersionPolicy>(&raw)
        .map_err(|err| format!("Cannot parse {}: {err}", resource_path.display()))?;

    Ok(policy)
}

fn parse_version_components(version: &str) -> Option<Vec<u64>> {
    let trimmed = version.trim();
    if trimmed.is_empty() {
        return None;
    }

    trimmed
        .split('.')
        .map(|part| part.parse::<u64>().ok())
        .collect::<Option<Vec<_>>>()
}

fn compare_version_strings(left: &str, right: &str) -> Option<std::cmp::Ordering> {
    let left = parse_version_components(left)?;
    let right = parse_version_components(right)?;
    let len = left.len().max(right.len());

    for index in 0..len {
        let left_part = *left.get(index).unwrap_or(&0);
        let right_part = *right.get(index).unwrap_or(&0);

        match left_part.cmp(&right_part) {
            std::cmp::Ordering::Equal => continue,
            ordering => return Some(ordering),
        }
    }

    Some(std::cmp::Ordering::Equal)
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

fn uninstall_payload(game_path: &Path) -> Result<(), String> {
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

fn ensure_valid_game_path(game_path: &Path) -> Result<(), String> {
    if crate::commands::detect::is_valid_game_path(game_path) {
        return Ok(());
    }

    Err(format!(
        "Selected path is not a valid The Bazaar installation: {}",
        game_path.display()
    ))
}

fn prepare_install_target(game_path: &Path) -> Result<(), String> {
    ensure_valid_game_path(game_path)?;
    uninstall_payload(game_path)
}

fn preserve_file_if_exists(
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

fn restore_preserved_file(base_dir: &Path, preserved: &PreservedFile) -> Result<(), String> {
    let path = base_dir.join(preserved.relative_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|err| format!("Cannot recreate {}: {err}", parent.display()))?;
    }

    std::fs::write(&path, &preserved.contents)
        .map_err(|err| format!("Cannot restore {}: {err}", path.display()))
}

fn cleanup_legacy_record_directory(game_path: &Path) -> Result<(), String> {
    remove_path_if_exists(&game_path.join(LEGACY_RECORD_DIRECTORY))
}

pub(crate) fn bpp_data_version_path(game_path: &Path) -> std::path::PathBuf {
    game_path
        .join(LEGACY_RECORD_DIRECTORY)
        .join(BPP_DATA_VERSION_FILE_NAME)
}

pub(crate) fn is_compatible_bpp_data_version(
    version: &str,
    minimum_supported_version: &str,
) -> bool {
    let Some(at_least_minimum) = compare_version_strings(version, minimum_supported_version) else {
        return false;
    };

    at_least_minimum != std::cmp::Ordering::Less
}

pub(crate) fn ensure_bpp_data_version_file(game_path: &Path) -> Result<(), String> {
    let data_dir = game_path.join(LEGACY_RECORD_DIRECTORY);
    std::fs::create_dir_all(&data_dir)
        .map_err(|err| format!("Cannot create {}: {err}", data_dir.display()))?;

    let version_path = data_dir.join(BPP_DATA_VERSION_FILE_NAME);
    std::fs::write(&version_path, format!("{CURRENT_BPP_DATA_VERSION}\n"))
        .map_err(|err| format!("Cannot write {}: {err}", version_path.display()))
}

fn legacy_record_directory_size_bytes(game_path: &Path) -> Result<u64, String> {
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

    collect_size(&game_path.join(LEGACY_RECORD_DIRECTORY))
}

#[tauri::command]
pub fn repair_bpp(game_path: String) -> Result<(), String> {
    let game_path = Path::new(&game_path);
    ensure_valid_game_path(game_path)?;

    cleanup_legacy_record_directory(game_path)?;
    ensure_bpp_data_version_file(game_path)?;

    debug_log!("Repaired BazaarPlusPlus payload at {}", game_path.display());
    Ok(())
}

#[tauri::command]
pub fn get_legacy_record_directory_info(
    game_path: String,
) -> Result<LegacyRecordDirectoryInfo, String> {
    let game_path = Path::new(&game_path);
    ensure_valid_game_path(game_path)?;

    Ok(LegacyRecordDirectoryInfo {
        total_bytes: legacy_record_directory_size_bytes(game_path)?,
    })
}

#[tauri::command]
pub fn install_bepinex(
    app: tauri::AppHandle,
    steam_path: String,
    game_path: String,
    skip_steam_shutdown: bool,
) -> Result<(), String> {
    let game_path = Path::new(&game_path);
    let preserved_bpp_config = preserve_file_if_exists(game_path, BPP_CONFIG_RELATIVE_PATH)?;
    #[cfg(not(target_os = "macos"))]
    let _ = (&steam_path, skip_steam_shutdown);
    #[cfg(target_os = "macos")]
    crate::commands::steam::prepare_steam_for_launch_option_update(
        Path::new(&steam_path),
        skip_steam_shutdown,
    )?;
    prepare_install_target(game_path)?;

    let install_result = (|| -> Result<(), String> {
        debug_log!("Reading bundled BepInEx.zip...");
        let relative_zip_path = zip_archive::bundled_zip_relative_path();
        let resource_path = app
            .path()
            .resource_dir()
            .map_err(|err| err.to_string())?
            .join(relative_zip_path);
        let zip_bytes = std::fs::read(&resource_path).map_err(|err| {
            debug_error!("Cannot read bundled BepInEx.zip: {err}");
            format!("Cannot read bundled BepInEx.zip: {err}")
        })?;

        debug_log!("Extracting BepInEx...");
        let extracted = zip_archive::extract_zip(&zip_bytes, game_path)?;
        debug_log!("Extracted {} files.", extracted.len());

        Ok(())
    })();

    let restore_result = preserved_bpp_config
        .as_ref()
        .map(|preserved| restore_preserved_file(game_path, preserved))
        .transpose();

    match (install_result, restore_result) {
        (Ok(()), Ok(_)) => Ok(()),
        (Err(install_err), Ok(_)) => Err(install_err),
        (Ok(()), Err(restore_err)) => Err(restore_err),
        (Err(install_err), Err(restore_err)) => Err(format!(
            "{install_err}; additionally failed to restore preserved config: {restore_err}"
        )),
    }
}

#[tauri::command]
pub fn uninstall_bpp(
    _app: tauri::AppHandle,
    _steam_path: String,
    game_path: String,
) -> Result<(), String> {
    let game_path = Path::new(&game_path);
    ensure_valid_game_path(game_path)?;

    #[cfg(target_os = "macos")]
    crate::commands::steam::prepare_steam_for_launch_option_update(Path::new(&_steam_path), false)?;

    uninstall_payload(game_path)?;

    #[cfg(target_os = "macos")]
    {
        crate::commands::vdf::clear_launch_options_for_steam(Path::new(&_steam_path))?;
    }

    debug_log!(
        "Uninstalled BazaarPlusPlus payload from {}",
        game_path.display()
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

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
    fn test_repair_bpp_removes_legacy_directory_for_installed_v1() {
        let tmp = tempfile::tempdir().unwrap();
        let legacy_dir = tmp.path().join(LEGACY_RECORD_DIRECTORY);

        #[cfg(target_os = "macos")]
        {
            std::fs::create_dir_all(tmp.path().join("TheBazaar.app")).unwrap();
        }

        #[cfg(target_os = "windows")]
        {
            std::fs::write(tmp.path().join("TheBazaar.exe"), b"exe").unwrap();
        }

        std::fs::create_dir_all(&legacy_dir).unwrap();
        std::fs::write(legacy_dir.join("legacy.dll"), b"dll").unwrap();

        repair_bpp(tmp.path().to_string_lossy().into_owned()).unwrap();

        assert!(legacy_dir.exists());
        assert_eq!(
            std::fs::read_to_string(legacy_dir.join(BPP_DATA_VERSION_FILE_NAME))
                .unwrap()
                .trim(),
            CURRENT_BPP_DATA_VERSION
        );
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
