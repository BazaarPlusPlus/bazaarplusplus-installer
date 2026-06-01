mod types;

pub use types::{
    FileActionResult, GameDirectorySelection, InstallActions, InstallGameState, InstallModState,
    InstallRuntimeState, InstallState, InstallWarning,
};

use std::process::Command;

use tauri::Manager;

use crate::services::{
    bepinex::{install_bepinex, repair_bpp, uninstall_bpp},
    detect::{detect_environment, EnvironmentInfo},
    startup::InstallerContextState,
    steam::detect_steam_running,
    vdf::patch_launch_options,
};
use crate::stream::state::StreamRuntimeState;

const STEAM_BAZAAR_URL: &str = "steam://rungameid/1617400";

pub fn build_install_state(
    app: tauri::AppHandle,
    state: tauri::State<'_, InstallerContextState>,
    game_path: Option<String>,
) -> Result<InstallState, String> {
    let env = detect_environment(app, state, game_path)?;
    let steam_running = detect_steam_running()
        .map(|info| info.running)
        .unwrap_or(false);
    Ok(install_state_from_environment(env, steam_running))
}

pub fn run_install(
    app: tauri::AppHandle,
    state: tauri::State<'_, InstallerContextState>,
    game_path: String,
) -> Result<InstallState, String> {
    let before = detect_environment(app.clone(), state, Some(game_path.clone()))?;
    let steam_path = before
        .steam_path
        .clone()
        .ok_or_else(|| "Steam path is not configured.".to_string())?;

    install_bepinex(app.clone(), steam_path.clone(), game_path.clone())?;
    if before.steam_launch_options_supported {
        let _ = patch_launch_options(app.clone(), steam_path, game_path.clone())?;
    }

    let app_for_state = app.clone();
    let state = app_for_state.state::<InstallerContextState>();
    build_install_state(app, state, Some(game_path))
}

pub async fn run_repair(
    app: tauri::AppHandle,
    install_state: tauri::State<'_, InstallerContextState>,
    stream_state: tauri::State<'_, StreamRuntimeState>,
    game_path: String,
) -> Result<InstallState, String> {
    repair_bpp(stream_state, game_path.clone()).await?;
    build_install_state(app, install_state, Some(game_path))
}

pub fn run_uninstall(
    app: tauri::AppHandle,
    state: tauri::State<'_, InstallerContextState>,
    game_path: String,
) -> Result<InstallState, String> {
    let before = detect_environment(app.clone(), state, Some(game_path.clone()))?;
    uninstall_bpp(
        app.clone(),
        before.steam_path.clone().unwrap_or_default(),
        game_path.clone(),
    )?;

    let app_for_state = app.clone();
    let state = app_for_state.state::<InstallerContextState>();
    build_install_state(app, state, Some(game_path))
}

pub fn launch_game_via_steam() -> Result<(), String> {
    open_url(STEAM_BAZAAR_URL)
}

fn install_state_from_environment(env: EnvironmentInfo, steam_running: bool) -> InstallState {
    let selected_game_path = env.game_path.clone();
    let game_found = selected_game_path.is_some();
    let installed = env.bepinex_installed;
    let version_matches = match (&env.bpp_version, &env.bundled_bpp_version) {
        (Some(installed), Some(bundled)) => installed == bundled,
        (None, _) => false,
        (_, None) => installed,
    };
    let can_launch = game_found && env.game_path_valid;
    let mut warnings = Vec::new();
    if steam_running {
        warnings.push(InstallWarning {
            code: "steam_running".to_string(),
            message: "Steam 正在运行；安装器不会自动关闭 Steam，请手动退出后再继续安装。"
                .to_string(),
        });
    }
    if !game_found || !env.game_path_valid {
        warnings.push(InstallWarning {
            code: "game_missing".to_string(),
            message: "未找到有效的 The Bazaar 安装目录。".to_string(),
        });
    }
    if !env.dotnet_ok {
        warnings.push(InstallWarning {
            code: "dotnet_missing".to_string(),
            message: "未检测到可用的 .NET 运行时。".to_string(),
        });
    }
    if !env.steam_launch_options_supported {
        warnings.push(InstallWarning {
            code: "launch_options_unsupported".to_string(),
            message: "当前平台或 Steam 目录不支持自动写入启动项。".to_string(),
        });
    }

    InstallState {
        selected_game_path,
        steam_path: env.steam_path,
        steam_running,
        steam_launch_options_supported: env.steam_launch_options_supported,
        game: InstallGameState {
            found: game_found,
            path_valid: env.game_path_valid,
            display_version: None,
        },
        mod_state: InstallModState {
            installed,
            installed_version: env.bpp_version,
            bundled_version: env.bundled_bpp_version,
            version_matches,
        },
        runtime: InstallRuntimeState {
            dotnet_version: env.dotnet_version,
            dotnet_ok: env.dotnet_ok,
        },
        actions: InstallActions {
            can_install: can_launch && !installed,
            can_reinstall: can_launch && installed,
            can_repair: can_launch,
            can_uninstall: can_launch && installed,
            can_launch,
        },
        warnings,
    }
}

fn open_url(url: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", url])
            .spawn()
            .map_err(|err| format!("failed to open URL: {err}"))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|err| format!("failed to open URL: {err}"))?;
        return Ok(());
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|err| format!("failed to open URL: {err}"))?;
        Ok(())
    }
}
