#[path = "detect/steam.rs"]
mod steam;

#[path = "detect/dotnet.rs"]
mod dotnet;

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::AppHandle;

#[derive(Debug, Serialize, Deserialize)]
pub struct EnvironmentInfo {
    pub steam_path: Option<String>,
    pub steam_launch_options_supported: bool,
    pub game_path: Option<String>,
    pub dotnet_version: Option<String>,
    pub dotnet_ok: bool,
    pub bepinex_installed: bool,
    pub bpp_version: Option<String>,
    pub bundled_bpp_version: Option<String>,
    pub bpp_data_version: Option<String>,
    pub bpp_data_reset_required: bool,
    pub bpp_data_issue: Option<BppDataIssue>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DotnetInfo {
    pub dotnet_version: Option<String>,
    pub dotnet_ok: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BppDataIssue {
    MissingVersionFile,
    IncompatibleVersion,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct BppDataDirectoryState {
    version: Option<String>,
    reset_required: bool,
    issue: Option<BppDataIssue>,
}

#[tauri::command]
pub fn detect_environment(
    app: AppHandle,
    game_path: Option<String>,
) -> Result<EnvironmentInfo, String> {
    let steam_path = steam::get_steam_path();
    let requested_game_path = normalize_game_path(game_path);
    let game_path = resolve_game_path(steam_path.as_deref(), requested_game_path.as_deref());
    let steam_launch_options_supported = steam_path
        .as_deref()
        .map(crate::commands::steam::supports_launch_option_updates)
        .unwrap_or(false);
    let bpp_version = game_path
        .as_ref()
        .and_then(|path| read_installed_bpp_version(path));
    let bundled_bpp_version = crate::commands::bepinex::read_bundled_bpp_version(&app)
        .ok()
        .flatten();
    let bpp_data_version_policy =
        crate::commands::bepinex::read_bundled_bpp_data_version_policy(&app)
            .unwrap_or_else(|_| crate::commands::bepinex::default_bpp_data_version_policy());
    let bpp_data_state = game_path
        .as_ref()
        .map(|path| {
            inspect_bpp_data_directory(
                path,
                &bpp_data_version_policy.minimum_supported_bpp_data_version,
            )
        })
        .unwrap_or_else(|| BppDataDirectoryState {
            version: None,
            reset_required: false,
            issue: None,
        });
    let bepinex_installed = game_path
        .as_ref()
        .map(|path| is_bepinex_installed(path))
        .unwrap_or(false);

    Ok(EnvironmentInfo {
        steam_path: steam_path.map(|path| path.to_string_lossy().into_owned()),
        steam_launch_options_supported,
        game_path: game_path.map(|path| path.to_string_lossy().into_owned()),
        dotnet_version: None,
        dotnet_ok: false,
        bepinex_installed,
        bpp_version,
        bundled_bpp_version,
        bpp_data_version: bpp_data_state.version,
        bpp_data_reset_required: bpp_data_state.reset_required,
        bpp_data_issue: bpp_data_state.issue,
    })
}

fn normalize_game_path(game_path: Option<String>) -> Option<PathBuf> {
    game_path
        .as_deref()
        .map(str::trim)
        .filter(|path| !path.is_empty())
        .map(PathBuf::from)
}

fn resolve_game_path(
    steam_path: Option<&Path>,
    requested_game_path: Option<&Path>,
) -> Option<PathBuf> {
    requested_game_path
        .map(Path::to_path_buf)
        .or_else(|| steam_path.and_then(steam::get_game_path))
}

#[tauri::command]
pub async fn detect_dotnet_runtime() -> Result<DotnetInfo, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let (dotnet_version, dotnet_ok) = dotnet::detect_dotnet();
        DotnetInfo {
            dotnet_version,
            dotnet_ok,
        }
    })
    .await
    .map_err(|err| format!("failed to detect .NET runtime: {err}"))
}

pub(crate) fn is_bepinex_installed(game_path: &Path) -> bool {
    if !game_path
        .join("BepInEx/core/BepInEx.Preloader.dll")
        .exists()
    {
        return false;
    }

    #[cfg(target_os = "macos")]
    return game_path.join("run_bepinex.sh").exists()
        && game_path.join("libdoorstop.dylib").exists();

    #[cfg(target_os = "windows")]
    return game_path.join("doorstop_config.ini").exists()
        && game_path.join("winhttp.dll").exists();

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    return true;
}

pub(crate) fn read_installed_bpp_version(game_path: &Path) -> Option<String> {
    let version_path = game_path.join("BepInEx/plugins/BazaarPlusPlus.version");
    let version = std::fs::read_to_string(version_path).ok()?;
    let version = version.trim();
    (!version.is_empty()).then(|| version.to_string())
}

fn inspect_bpp_data_directory(
    game_path: &Path,
    minimum_supported_version: &str,
) -> BppDataDirectoryState {
    let data_dir = game_path.join(crate::commands::bepinex::LEGACY_RECORD_DIRECTORY);
    if !data_dir.exists() {
        return BppDataDirectoryState {
            version: None,
            reset_required: false,
            issue: None,
        };
    }

    let version_path = crate::commands::bepinex::bpp_data_version_path(game_path);
    let version = std::fs::read_to_string(&version_path)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    match version {
        Some(version)
            if crate::commands::bepinex::is_compatible_bpp_data_version(
                &version,
                minimum_supported_version,
            ) =>
        {
            BppDataDirectoryState {
                version: Some(version),
                reset_required: false,
                issue: None,
            }
        }
        Some(version) => BppDataDirectoryState {
            version: Some(version),
            reset_required: true,
            issue: Some(BppDataIssue::IncompatibleVersion),
        },
        None => BppDataDirectoryState {
            version: None,
            reset_required: true,
            issue: Some(BppDataIssue::MissingVersionFile),
        },
    }
}

/// Returns true if the game installation is found at the given path.
#[tauri::command]
pub fn verify_game_path(path: String) -> bool {
    let base = PathBuf::from(&path);
    is_valid_game_path(&base)
}

pub(crate) fn is_valid_game_path(base: &Path) -> bool {
    #[cfg(target_os = "macos")]
    return base.join("TheBazaar.app").exists();

    #[cfg(target_os = "windows")]
    return base.join("TheBazaar.exe").exists();

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    return base.join("TheBazaar").exists();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_read_installed_bpp_version_trims_contents() {
        let temp_root = std::env::temp_dir().join(format!(
            "bppinstaller-version-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system time before epoch")
                .as_nanos()
        ));
        let plugins_dir = temp_root.join("BepInEx/plugins");
        std::fs::create_dir_all(&plugins_dir).expect("create plugins dir");
        std::fs::write(
            plugins_dir.join("BazaarPlusPlus.version"),
            "1.2.3+2026-03-10 12:34:56\n",
        )
        .expect("write version file");

        let version = read_installed_bpp_version(&temp_root);

        std::fs::remove_dir_all(&temp_root).expect("cleanup temp dir");

        assert_eq!(version.as_deref(), Some("1.2.3+2026-03-10 12:34:56"));
    }

    #[test]
    fn test_is_bepinex_installed_detects_core_payload_without_version_file() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(tmp.path().join("BepInEx/core")).unwrap();
        std::fs::write(
            tmp.path().join("BepInEx/core/BepInEx.Preloader.dll"),
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

        assert!(is_bepinex_installed(tmp.path()));
    }

    #[test]
    fn test_inspect_bpp_data_directory_requires_reset_when_version_file_missing() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(
            tmp.path()
                .join(crate::commands::bepinex::LEGACY_RECORD_DIRECTORY),
        )
        .unwrap();

        let state = inspect_bpp_data_directory(tmp.path(), "2.9.0");

        assert_eq!(
            state,
            BppDataDirectoryState {
                version: None,
                reset_required: true,
                issue: Some(BppDataIssue::MissingVersionFile),
            }
        );
    }

    #[test]
    fn test_inspect_bpp_data_directory_accepts_compatible_version() {
        let tmp = tempfile::tempdir().unwrap();
        crate::commands::bepinex::ensure_bpp_data_version_file(tmp.path()).unwrap();

        let state = inspect_bpp_data_directory(tmp.path(), "2.0.0");

        assert_eq!(
            state,
            BppDataDirectoryState {
                version: Some(crate::commands::bepinex::CURRENT_BPP_DATA_VERSION.to_string()),
                reset_required: false,
                issue: None,
            }
        );
    }

    #[test]
    fn test_inspect_bpp_data_directory_requires_reset_when_version_is_incompatible() {
        let tmp = tempfile::tempdir().unwrap();
        let data_dir = tmp
            .path()
            .join(crate::commands::bepinex::LEGACY_RECORD_DIRECTORY);
        std::fs::create_dir_all(&data_dir).unwrap();
        std::fs::write(
            data_dir.join(crate::commands::bepinex::BPP_DATA_VERSION_FILE_NAME),
            b"0\n",
        )
        .unwrap();

        let state = inspect_bpp_data_directory(tmp.path(), "2.9.0");

        assert_eq!(
            state,
            BppDataDirectoryState {
                version: Some("0".to_string()),
                reset_required: true,
                issue: Some(BppDataIssue::IncompatibleVersion),
            }
        );
    }

    #[test]
    fn test_inspect_bpp_data_directory_accepts_older_supported_version() {
        let tmp = tempfile::tempdir().unwrap();
        let data_dir = tmp
            .path()
            .join(crate::commands::bepinex::LEGACY_RECORD_DIRECTORY);
        std::fs::create_dir_all(&data_dir).unwrap();
        std::fs::write(
            data_dir.join(crate::commands::bepinex::BPP_DATA_VERSION_FILE_NAME),
            b"2.9.8\n",
        )
        .unwrap();

        let state = inspect_bpp_data_directory(tmp.path(), "2.9.0");

        assert_eq!(
            state,
            BppDataDirectoryState {
                version: Some("2.9.8".to_string()),
                reset_required: false,
                issue: None,
            }
        );
    }

    #[test]
    fn test_normalize_game_path_trims_whitespace() {
        let game_path = normalize_game_path(Some("  C:\\Games\\The Bazaar  ".to_string()));
        assert_eq!(game_path, Some(PathBuf::from("C:\\Games\\The Bazaar")));
    }

    #[test]
    fn test_resolve_game_path_prefers_requested_path() {
        let requested = PathBuf::from("D:\\Games\\The Bazaar");
        let steam_path = Path::new("C:\\Program Files (x86)\\Steam");

        let game_path = resolve_game_path(Some(steam_path), Some(requested.as_path()));

        assert_eq!(game_path, Some(requested));
    }
}
