mod operation;
mod plan;
mod types;

pub(crate) use operation::{install, InstallRequest};
pub use types::{
    FileActionResult, GameDirectorySelection, InstallActions, InstallCompatState, InstallGameState,
    InstallModState, InstallState, InstallWarning, ResetBepinexResult, ResetBppDataResult,
};

use std::process::Command;

use tauri::Manager;

use std::path::Path;

use crate::services::{
    bepinex::{reset_bepinex_folder, reset_bpp_data, uninstall_bpp},
    detect::detect_for_install,
    startup::InstallerContextState,
};
use crate::stream::runtime::StreamRuntime;

const STEAM_BAZAAR_URL: &str = "steam://rungameid/1617400";

pub fn build_install_state(
    app: tauri::AppHandle,
    state: tauri::State<'_, InstallerContextState>,
    game_path: Option<String>,
) -> Result<InstallState, String> {
    let snapshot = detect_for_install(app, state, game_path)?;
    Ok(install_state_from_snapshot(snapshot))
}

pub async fn run_reset_bpp_data(
    app: tauri::AppHandle,
    install_state: tauri::State<'_, InstallerContextState>,
    stream_runtime: tauri::State<'_, StreamRuntime>,
    game_path: String,
) -> Result<ResetBppDataResult, String> {
    let removed_data = reset_bpp_data(stream_runtime, game_path.clone()).await?;
    let state = build_install_state(app, install_state, Some(game_path))?;
    Ok(ResetBppDataResult {
        state,
        removed_data,
    })
}

pub async fn run_reset_bepinex(
    app: tauri::AppHandle,
    install_state: tauri::State<'_, InstallerContextState>,
    game_path: String,
) -> Result<ResetBepinexResult, String> {
    let removed = reset_bepinex_folder(game_path.clone()).await?;
    let state = build_install_state(app, install_state, Some(game_path))?;
    Ok(ResetBepinexResult { state, removed })
}

pub async fn run_uninstall(
    app: tauri::AppHandle,
    state: tauri::State<'_, InstallerContextState>,
    game_path: String,
) -> Result<InstallState, String> {
    let before = detect_for_install(app.clone(), state, Some(game_path.clone()))?;
    let app_for_task = app.clone();
    let steam_path = before.steam_path.clone().unwrap_or_default();
    let game_path_for_task = game_path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        uninstall_bpp(app_for_task, steam_path, game_path_for_task)
    })
    .await
    .map_err(|err| format!("failed to run uninstall task: {err}"))??;

    let app_for_state = app.clone();
    let state = app_for_state.state::<InstallerContextState>();
    build_install_state(app, state, Some(game_path))
}

pub fn launch_game_via_steam() -> Result<(), String> {
    open_url(STEAM_BAZAAR_URL)
}

fn install_state_from_snapshot(
    env: crate::services::detect::InstallEnvironmentSnapshot,
) -> InstallState {
    let selected_game_path = env.game_path.clone();
    let game_found = selected_game_path.is_some();
    let installed = env.bepinex_installed;
    let plugin_version_matches = match (&env.bpp_version, &env.bundled_bpp_version) {
        (Some(installed_version), Some(bundled)) => installed_version == bundled,
        (None, _) => false,
        (_, None) => installed,
    };
    // The bundle's actual launch mode must match the desired one. A Steam "Verify
    // integrity"/game update that reverts the trampoline (or a macOS 26->27 upgrade
    // after a prefix install) leaves the plugin DLL version matching yet the launch
    // broken; folding consistency into `version_matches` routes the UI to Reinstall
    // (Repair). On non-macOS (and matched macOS) `trampoline_consistent` is true, so
    // this reduces to today's plugin-version check.
    let trampoline_consistent = env.launch_mode.consistent();
    let version_matches = plugin_version_matches && trampoline_consistent;
    let needs_trampoline_repair = env.launch_mode.needs_repair(installed);
    let can_launch = game_found && env.game_path_valid;
    let has_resettable_data = has_resettable_bpp_data(env.game_path.as_deref());
    let has_bepinex_files = has_bepinex_directory(env.game_path.as_deref());
    let mut warnings = Vec::new();
    if !game_found || !env.game_path_valid {
        warnings.push(InstallWarning {
            code: "game_missing".to_string(),
            message: "未找到有效的 The Bazaar 安装目录。".to_string(),
        });
    }
    if !env.steam_launch_options_supported {
        warnings.push(InstallWarning {
            code: "launch_options_unsupported".to_string(),
            message: "当前平台或 Steam 目录不支持自动写入启动项。".to_string(),
        });
    }
    if needs_trampoline_repair {
        warnings.push(InstallWarning {
            code: "trampoline_reverted".to_string(),
            message: "检测到游戏文件已被还原，BazaarPlusPlus 的启动配置需要修复，请点击重新安装。"
                .to_string(),
        });
    }

    InstallState {
        selected_game_path,
        steam_path: env.steam_path,
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
        compat: InstallCompatState {
            mode_available: env.launch_mode.opt_in_available(),
            forced: env.launch_mode.forced(),
            desired: env.launch_mode.expected_trampoline,
            applied: env.launch_mode.trampoline_applied,
        },
        actions: InstallActions {
            can_install: can_launch && !installed,
            can_reinstall: can_launch && installed,
            can_reset_data: can_launch && has_resettable_data,
            can_reset_bepinex: can_launch && has_bepinex_files,
            can_uninstall: can_launch && installed,
            can_launch,
        },
        has_resettable_data,
        has_bepinex_files,
        warnings,
    }
}

fn has_resettable_bpp_data(game_path: Option<&str>) -> bool {
    game_path
        .map(Path::new)
        .map(|path| crate::services::paths::bpp_data_dir(path).exists())
        .unwrap_or(false)
}

fn has_bepinex_directory(game_path: Option<&str>) -> bool {
    game_path
        .map(Path::new)
        .map(|path| path.join("BepInEx").is_dir())
        .unwrap_or(false)
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

#[cfg(test)]
mod tests {
    use super::{has_bepinex_directory, has_resettable_bpp_data};

    #[test]
    fn test_has_resettable_bpp_data_detects_existing_data_directory() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(tmp.path().join(crate::config::BAZAAR_DATA_DIRECTORY)).unwrap();
        let path = tmp.path().to_string_lossy().into_owned();

        assert!(has_resettable_bpp_data(Some(path.as_str())));
    }

    #[test]
    fn test_has_resettable_bpp_data_is_false_when_missing() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().to_string_lossy().into_owned();

        assert!(!has_resettable_bpp_data(Some(path.as_str())));
        assert!(!has_resettable_bpp_data(None));
    }

    #[test]
    fn test_has_bepinex_directory_detects_existing_folder() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().to_string_lossy().into_owned();
        assert!(!has_bepinex_directory(Some(path.as_str())));

        std::fs::create_dir_all(tmp.path().join("BepInEx")).unwrap();

        assert!(has_bepinex_directory(Some(path.as_str())));
        assert!(!has_bepinex_directory(None));
    }
}
