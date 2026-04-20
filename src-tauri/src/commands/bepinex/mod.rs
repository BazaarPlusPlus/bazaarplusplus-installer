mod payload;
mod versioning;
mod zip_archive;

pub(crate) use zip_archive::read_bundled_bpp_version;
pub(crate) use versioning::{
    bpp_data_version_path, default_bpp_data_version_policy, is_compatible_bpp_data_version,
    read_bundled_bpp_data_version_policy, BppDataVersionPolicy, LEGACY_RECORD_DIRECTORY,
};
#[cfg(test)]
pub(crate) use versioning::{
    ensure_bpp_data_version_file, BPP_DATA_VERSION_FILE_NAME, CURRENT_BPP_DATA_VERSION,
};

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

#[derive(Debug, Serialize, ts_rs::TS)]
#[ts(export)]
pub struct LegacyRecordDirectoryInfo {
    pub total_bytes: u64,
}

#[tauri::command]
pub fn repair_bpp(game_path: String) -> Result<(), String> {
    let game_path = Path::new(&game_path);
    payload::ensure_valid_game_path(game_path)?;

    payload::cleanup_legacy_record_directory(game_path)?;
    versioning::ensure_bpp_data_version_file(game_path)?;

    debug_log!("Repaired BazaarPlusPlus payload at {}", game_path.display());
    Ok(())
}

#[tauri::command]
pub fn get_legacy_record_directory_info(
    game_path: String,
) -> Result<LegacyRecordDirectoryInfo, String> {
    let game_path = Path::new(&game_path);
    payload::ensure_valid_game_path(game_path)?;

    Ok(LegacyRecordDirectoryInfo {
        total_bytes: payload::legacy_record_directory_size_bytes(game_path)?,
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
}
