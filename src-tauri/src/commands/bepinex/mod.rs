mod payload;
mod versioning;
mod zip_archive;

pub(crate) use versioning::{
    bpp_data_version_path, default_bpp_data_version_policy, is_compatible_bpp_data_version,
    read_bundled_bpp_data_version_policy, BppDataVersionPolicy, LEGACY_RECORD_DIRECTORY,
};
#[cfg(test)]
pub(crate) use versioning::{
    ensure_bpp_data_version_file, BPP_DATA_VERSION_FILE_NAME, CURRENT_BPP_DATA_VERSION,
};
pub(crate) use zip_archive::read_bundled_bpp_version;

use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::Manager;

use crate::stream::state::StreamRuntimeState;

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

/// Stable error-code prefixes that the frontend pattern-matches to render
/// targeted UI. Adding a new variant requires a matching branch in
/// `formatRepairError` on the TS side.
pub(crate) const REPAIR_ERR_GAME_RUNNING: &str = "bpp_data_reset_blocked_by_game";
pub(crate) const REPAIR_ERR_PARTIAL_FAILURE: &str = "bpp_data_reset_partial_failure";

#[derive(Debug, Serialize, ts_rs::TS)]
#[ts(export)]
pub struct LegacyRecordDirectoryInfo {
    pub total_bytes: u64,
}

#[tauri::command]
pub async fn repair_bpp(
    app: tauri::AppHandle,
    stream_state: tauri::State<'_, StreamRuntimeState>,
    game_path: String,
) -> Result<(), String> {
    // Drop our own SQLite connections before touching the data directory.
    // Without this, OBS overlay polling keeps `bazaarplusplus.db` open and
    // Windows refuses to delete it (the headline customer complaint).
    let _ = crate::stream::server::stop(stream_state.inner()).await;

    tauri::async_runtime::spawn_blocking(move || {
        let policy = versioning::read_bundled_bpp_data_version_policy(&app)
            .unwrap_or_else(|_| versioning::default_bpp_data_version_policy());
        repair_bpp_blocking(Path::new(&game_path), &policy.current_bpp_data_version)
    })
    .await
    .map_err(|err| format!("failed to repair BazaarPlusPlus data: {err}"))?
}

fn repair_bpp_blocking(game_path: &Path, current_bpp_data_version: &str) -> Result<(), String> {
    payload::ensure_valid_game_path(game_path)?;

    if crate::commands::game_process::is_bazaar_running_best_effort() {
        return Err(REPAIR_ERR_GAME_RUNNING.to_string());
    }

    let report = payload::cleanup_legacy_record_directory(game_path);
    if !report.is_empty() {
        return Err(format_partial_failure(&report.failed));
    }

    versioning::ensure_bpp_data_version_file(game_path, current_bpp_data_version)?;

    debug_log!("Repaired BazaarPlusPlus payload at {}", game_path.display());
    Ok(())
}

fn format_partial_failure(paths: &[PathBuf]) -> String {
    // Use a delimiter that won't collide with Windows drive letters or POSIX
    // separators. The frontend splits on `\u{1f}` to recover the list.
    let joined = paths
        .iter()
        .map(|path| path.display().to_string())
        .collect::<Vec<_>>()
        .join("\u{1f}");
    format!("{REPAIR_ERR_PARTIAL_FAILURE}:{joined}")
}

#[tauri::command]
pub async fn get_legacy_record_directory_info(
    game_path: String,
) -> Result<LegacyRecordDirectoryInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let game_path = Path::new(&game_path);
        payload::ensure_valid_game_path(game_path)?;

        Ok(LegacyRecordDirectoryInfo {
            total_bytes: payload::legacy_record_directory_size_bytes(game_path)?,
        })
    })
    .await
    .map_err(|err| format!("failed to inspect BazaarPlusPlus data directory: {err}"))?
}

#[tauri::command]
pub fn install_bepinex(
    app: tauri::AppHandle,
    steam_path: String,
    game_path: String,
    skip_steam_shutdown: bool,
) -> Result<(), String> {
    let game_path = Path::new(&game_path);
    let preserved_bpp_config =
        payload::preserve_file_if_exists(game_path, payload::BPP_CONFIG_RELATIVE_PATH)?;
    #[cfg(not(target_os = "macos"))]
    let _ = (&steam_path, skip_steam_shutdown);
    #[cfg(target_os = "macos")]
    crate::commands::steam::prepare_steam_for_launch_option_update(
        Path::new(&steam_path),
        skip_steam_shutdown,
    )?;
    payload::prepare_install_target(game_path)?;

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
        .map(|preserved| payload::restore_preserved_file(game_path, preserved))
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
    payload::ensure_valid_game_path(game_path)?;

    #[cfg(target_os = "macos")]
    crate::commands::steam::prepare_steam_for_launch_option_update(Path::new(&_steam_path), false)?;

    payload::uninstall_payload(game_path)?;

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

    fn make_valid_game_dir() -> tempfile::TempDir {
        let tmp = tempfile::tempdir().unwrap();

        #[cfg(target_os = "macos")]
        {
            std::fs::create_dir_all(tmp.path().join("TheBazaar.app")).unwrap();
        }

        #[cfg(target_os = "windows")]
        {
            std::fs::write(tmp.path().join("TheBazaar.exe"), b"exe").unwrap();
        }

        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            std::fs::write(tmp.path().join("TheBazaar"), b"exe").unwrap();
        }

        tmp
    }

    #[test]
    fn test_repair_bpp_removes_legacy_directory_for_installed_v1() {
        let tmp = make_valid_game_dir();
        let legacy_dir = tmp.path().join(LEGACY_RECORD_DIRECTORY);

        std::fs::create_dir_all(&legacy_dir).unwrap();
        std::fs::write(legacy_dir.join("legacy.dll"), b"dll").unwrap();

        repair_bpp_blocking(tmp.path(), CURRENT_BPP_DATA_VERSION).unwrap();

        assert!(legacy_dir.exists());
        assert_eq!(
            std::fs::read_to_string(legacy_dir.join(BPP_DATA_VERSION_FILE_NAME))
                .unwrap()
                .trim(),
            CURRENT_BPP_DATA_VERSION
        );
    }

    #[test]
    fn test_repair_bpp_seeds_directory_when_user_already_deleted_it() {
        let tmp = make_valid_game_dir();
        let legacy_dir = tmp.path().join(LEGACY_RECORD_DIRECTORY);
        assert!(!legacy_dir.exists());

        repair_bpp_blocking(tmp.path(), CURRENT_BPP_DATA_VERSION).unwrap();

        assert!(legacy_dir.exists());
        assert_eq!(
            std::fs::read_to_string(legacy_dir.join(BPP_DATA_VERSION_FILE_NAME))
                .unwrap()
                .trim(),
            CURRENT_BPP_DATA_VERSION
        );
    }

    #[test]
    fn test_repair_bpp_is_idempotent_when_run_twice() {
        let tmp = make_valid_game_dir();

        repair_bpp_blocking(tmp.path(), CURRENT_BPP_DATA_VERSION).unwrap();
        repair_bpp_blocking(tmp.path(), CURRENT_BPP_DATA_VERSION).unwrap();

        let legacy_dir = tmp.path().join(LEGACY_RECORD_DIRECTORY);
        assert_eq!(
            std::fs::read_to_string(legacy_dir.join(BPP_DATA_VERSION_FILE_NAME))
                .unwrap()
                .trim(),
            CURRENT_BPP_DATA_VERSION
        );
    }

    #[test]
    fn test_format_partial_failure_uses_unit_separator() {
        let formatted = format_partial_failure(&[
            PathBuf::from("C:/Games/The Bazaar/BazaarPlusPlus/bazaarplusplus.db"),
            PathBuf::from("C:/Games/The Bazaar/BazaarPlusPlus/Identity/auth.v1.json"),
        ]);

        assert!(formatted.starts_with(REPAIR_ERR_PARTIAL_FAILURE));
        assert!(formatted.contains('\u{1f}'));
        assert!(formatted.ends_with("auth.v1.json"));
    }
}
