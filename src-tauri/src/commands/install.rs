pub use crate::services::install::*;

use tauri_plugin_dialog::DialogExt;

use crate::services::{
    install::{
        build_install_state, launch_game_via_steam, run_install, run_reset_bepinex,
        run_reset_bpp_data, run_uninstall,
    },
    startup::InstallerContextState,
};
use crate::stream::state::StreamRuntimeState;

#[tauri::command(async)]
#[specta::specta]
pub fn get_install_state(
    app: tauri::AppHandle,
    state: tauri::State<'_, InstallerContextState>,
    game_path: Option<String>,
) -> Result<InstallState, String> {
    build_install_state(app, state, game_path)
}

#[tauri::command]
#[specta::specta]
pub async fn choose_game_directory(
    app: tauri::AppHandle,
) -> Result<GameDirectorySelection, String> {
    let folder =
        tauri::async_runtime::spawn_blocking(move || app.dialog().file().blocking_pick_folder())
            .await
            .map_err(|err| format!("failed to open game directory picker: {err}"))?;
    let game_path = folder
        .and_then(|path| path.into_path().ok())
        .map(|path| path.to_string_lossy().into_owned());

    Ok(GameDirectorySelection { game_path })
}

#[tauri::command]
#[specta::specta]
pub async fn install_mod(
    app: tauri::AppHandle,
    state: tauri::State<'_, InstallerContextState>,
    game_path: String,
    compat_opt_in: bool,
) -> Result<InstallState, String> {
    run_install(app, state, game_path, compat_opt_in).await
}

#[tauri::command]
#[specta::specta]
pub async fn reset_bpp_data(
    app: tauri::AppHandle,
    install_state: tauri::State<'_, InstallerContextState>,
    stream_state: tauri::State<'_, StreamRuntimeState>,
    game_path: String,
) -> Result<ResetBppDataResult, String> {
    run_reset_bpp_data(app, install_state, stream_state, game_path).await
}

#[tauri::command]
#[specta::specta]
pub async fn reset_bepinex(
    app: tauri::AppHandle,
    install_state: tauri::State<'_, InstallerContextState>,
    game_path: String,
) -> Result<ResetBepinexResult, String> {
    run_reset_bepinex(app, install_state, game_path).await
}

#[tauri::command]
#[specta::specta]
pub async fn uninstall_mod(
    app: tauri::AppHandle,
    state: tauri::State<'_, InstallerContextState>,
    game_path: String,
) -> Result<InstallState, String> {
    run_uninstall(app, state, game_path).await
}

#[tauri::command(async)]
#[specta::specta]
pub fn launch_game() -> Result<FileActionResult, String> {
    launch_game_via_steam()?;
    Ok(FileActionResult { ok: true })
}
