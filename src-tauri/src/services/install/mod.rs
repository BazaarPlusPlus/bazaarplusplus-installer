mod plan;
mod types;

pub use types::{
    FileActionResult, GameDirectorySelection, InstallActions, InstallCompatState, InstallGameState,
    InstallModState, InstallState, InstallWarning, ResetBepinexResult, ResetBppDataResult,
};

use std::process::Command;

use tauri::Manager;

use std::path::Path;

use crate::services::{
    bepinex::{self, install_bepinex, reset_bepinex_folder, reset_bpp_data, uninstall_bpp},
    detect::detect_for_install,
    launch_mode::LaunchModeGate,
    startup::InstallerContextState,
    steam::prepare_steam_for_launch_option_update,
    vdf::{clear_launch_options_for_steam, patch_launch_options},
};
use crate::stream::state::StreamRuntimeState;

const STEAM_BAZAAR_URL: &str = "steam://rungameid/1617400";

pub fn build_install_state(
    app: tauri::AppHandle,
    state: tauri::State<'_, InstallerContextState>,
    game_path: Option<String>,
) -> Result<InstallState, String> {
    let snapshot = detect_for_install(app, state, game_path)?;
    Ok(install_state_from_snapshot(snapshot))
}

pub async fn run_install(
    app: tauri::AppHandle,
    state: tauri::State<'_, InstallerContextState>,
    game_path: String,
    compat_opt_in: bool,
) -> Result<InstallState, String> {
    // ---- gather (async runtime; the ONLY detect before mutation) ----
    let before = detect_for_install(app.clone(), state, Some(game_path.clone()))?;
    let steam_path = before.steam_path.clone().unwrap_or_default();

    // ---- plan (pure; ordering contract lives in plan.rs + its table tests) ----
    // Version-forced on macOS 27+, or <= 26 opt-in. Always Prefix off macOS.
    let plan = plan::plan_install(plan::InstallPlanInputs {
        requested: LaunchModeGate::current().requested_mode(compat_opt_in),
        was_trampolined: bepinex::is_trampolined(Path::new(&game_path)).unwrap_or(false),
        has_steam_path: !steam_path.trim().is_empty(),
        steam_launch_options_supported: before.steam_launch_options_supported,
    });

    // ---- execute (blocking thread; first Err aborts, same as master's `?`s) ----
    let app_for_task = app.clone();
    let game_path_for_task = game_path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        for step in &plan {
            execute_install_step(step, &app_for_task, &steam_path, &game_path_for_task)?;
        }
        Ok::<(), String>(())
    })
    .await
    .map_err(|err| format!("failed to run install task: {err}"))??;

    // ---- rebuild state from a FRESH detect (never mutate `before`) ----
    let app_for_state = app.clone();
    let state = app_for_state.state::<InstallerContextState>();
    build_install_state(app, state, Some(game_path))
}

/// Orderless step interpreter. Every arm is ONE unconditional effect call —
/// decisions and ordering belong to `plan::plan_install` (see its table
/// tests). Contract: no conditionals, no error wrapping (error strings pass
/// through raw to the frontend), no fan-out; per-arm argument literals are
/// load-bearing and documented on the matching `InstallStep` variant.
fn execute_install_step(
    step: &plan::InstallStep,
    app: &tauri::AppHandle,
    steam_path: &str,
    game_path: &str,
) -> Result<(), String> {
    let steam = Path::new(steam_path);
    let game = Path::new(game_path);
    match step {
        plan::InstallStep::CloseSteam => prepare_steam_for_launch_option_update(steam, false),
        plan::InstallStep::InstallBepInEx => {
            install_bepinex(app.clone(), steam_path.to_string(), game_path.to_string())
        }
        plan::InstallStep::InstallTrampoline => bepinex::install_trampoline(app, game),
        plan::InstallStep::UninstallTrampoline => bepinex::uninstall_trampoline(game),
        plan::InstallStep::WriteLaunchModeMarker(mode) => {
            bepinex::write_launch_mode_marker(game, *mode)
        }
        plan::InstallStep::ClearLaunchOptions => clear_launch_options_for_steam(steam),
        // Discard only the Ok LaunchOptionsPatchResult (verified:false is NOT
        // an error); a hard Err still aborts — master's `let _ = …?` shape.
        plan::InstallStep::PatchLaunchOptions => {
            patch_launch_options(app.clone(), steam_path.to_string(), game_path.to_string())
                .map(|_| ())
        }
    }
}

pub async fn run_reset_bpp_data(
    app: tauri::AppHandle,
    install_state: tauri::State<'_, InstallerContextState>,
    stream_state: tauri::State<'_, StreamRuntimeState>,
    game_path: String,
) -> Result<ResetBppDataResult, String> {
    let removed_data = reset_bpp_data(stream_state, game_path.clone()).await?;
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
