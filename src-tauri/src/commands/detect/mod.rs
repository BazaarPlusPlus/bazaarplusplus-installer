mod dotnet;
mod game;
mod steam;

pub use game::BppDataIssue;
pub(crate) use game::is_valid_game_path;

use game::{
    BppDataDirectoryState, inspect_bpp_data_directory, is_bepinex_installed, normalize_game_path,
    read_installed_bpp_version, resolve_game_path,
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
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

/// Returns true if the game installation is found at the given path.
#[tauri::command]
pub fn verify_game_path(path: String) -> bool {
    let base = PathBuf::from(&path);
    is_valid_game_path(&base)
}
