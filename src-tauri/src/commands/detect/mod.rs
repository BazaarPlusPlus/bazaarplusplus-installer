mod dotnet;
mod game;
mod steam;

pub use game::BppDataIssue;
pub(crate) use dotnet::detect_dotnet as dotnet_detect_for_startup;
pub(crate) use game::is_valid_game_path;

use crate::commands::startup::InstallerContextState;
use game::{
    BppDataDirectoryState, inspect_bpp_data_directory, is_bepinex_installed, normalize_game_path,
    read_installed_bpp_version, resolve_game_path,
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, State};

#[derive(Debug, Serialize, Deserialize, ts_rs::TS)]
#[ts(export)]
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

#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[ts(export)]
pub struct DotnetInfo {
    pub dotnet_version: Option<String>,
    pub dotnet_ok: bool,
}

#[tauri::command]
pub fn detect_environment(
    app: AppHandle,
    state: State<'_, InstallerContextState>,
    game_path: Option<String>,
) -> Result<EnvironmentInfo, String> {
    crate::commands::debug_log!(
        "[detect_environment] start requested_game_path={:?}",
        game_path
    );
    // Read cached startup context. On first call this lazily initializes
    // (reads BepInEx.zip + scans .NET runtime) as a safety net; normal flow
    // calls `initialize_installer_context` from the frontend first so this
    // lookup is just a cached read.
    let startup = state.get_or_initialize(&app);

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
    let bpp_data_state = game_path
        .as_ref()
        .map(|path| {
            inspect_bpp_data_directory(
                path,
                &startup
                    .bpp_data_version_policy
                    .minimum_supported_bpp_data_version,
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

    crate::commands::debug_log!(
        "[detect_environment] resolved steam_path={:?} game_path={:?} bepinex_installed={} bundled_bpp_version={:?}",
        steam_path.as_ref().map(|path| path.display().to_string()),
        game_path.as_ref().map(|path| path.display().to_string()),
        bepinex_installed,
        startup.bundled_bpp_version
    );

    Ok(EnvironmentInfo {
        steam_path: steam_path.map(|path| path.to_string_lossy().into_owned()),
        steam_launch_options_supported,
        game_path: game_path.map(|path| path.to_string_lossy().into_owned()),
        dotnet_version: startup.dotnet.dotnet_version.clone(),
        dotnet_ok: startup.dotnet.dotnet_ok,
        bepinex_installed,
        bpp_version,
        bundled_bpp_version: startup.bundled_bpp_version.clone(),
        bpp_data_version: bpp_data_state.version,
        bpp_data_reset_required: bpp_data_state.reset_required,
        bpp_data_issue: bpp_data_state.issue,
    })
}

/// Returns true if the game installation is found at the given path.
#[tauri::command]
pub fn verify_game_path(path: String) -> bool {
    let base = PathBuf::from(&path);
    is_valid_game_path(&base)
}
