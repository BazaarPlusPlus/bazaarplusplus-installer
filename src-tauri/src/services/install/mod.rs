mod types;

pub use types::{
    FileActionResult, GameDirectorySelection, InstallActions, InstallCompatState, InstallGameState,
    InstallModState, InstallRuntimeState, InstallState, InstallWarning,
};

use std::process::Command;

use tauri::Manager;

use std::path::Path;

use crate::services::{
    bepinex::{self, install_bepinex, reset_bpp_data, uninstall_bpp, LaunchMode},
    detect::detect_for_install,
    macos_version::use_trampoline,
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
    let before = detect_for_install(app.clone(), state, Some(game_path.clone()))?;
    let steam_path = before.steam_path.clone().unwrap_or_default();
    let has_steam_path = !steam_path.trim().is_empty();

    // Version-forced on macOS 27+, or <= 26 opt-in. Always false off macOS.
    let wants_trampoline = use_trampoline(compat_opt_in);
    let was_trampolined = bepinex::is_trampolined(Path::new(&game_path)).unwrap_or(false);

    let app_for_task = app.clone();
    let game_path_for_task = game_path.clone();
    let patch_launch_options_supported = before.steam_launch_options_supported;
    tauri::async_runtime::spawn_blocking(move || {
        let steam = Path::new(&steam_path);
        let game = Path::new(&game_path_for_task);

        if wants_trampoline {
            // Trampoline mode MUTATES the .app and needs a reliable localconfig
            // clear -> Steam MUST be closed.
            if has_steam_path {
                prepare_steam_for_launch_option_update(steam, false)?;
            }
            install_bepinex(
                app_for_task.clone(),
                steam_path.clone(),
                game_path_for_task.clone(),
            )?;
            bepinex::install_trampoline(&app_for_task, game)?;
            // Persist the desired mode AS SOON AS the bundle is trampolined, before
            // the Steam step below — otherwise a clear-launch-options failure would
            // leave a trampolined bundle with no marker, which a later detect would
            // mislabel as `trampoline_reverted` on macOS <= 26.
            bepinex::write_launch_mode_marker(game, LaunchMode::Trampoline)?;
            // LaunchOptions are driven by the MODE: trampoline => cleared (the
            // empty/vanilla launch the stub needs).
            if has_steam_path {
                clear_launch_options_for_steam(steam)?;
            }
        } else {
            // Prefix mode. Close Steam ONLY to un-apply a previous trampoline (mode
            // switch); a plain <= 26 prefix install keeps today's behavior exactly
            // (Steam stays up; patch_launch_options does its own prepare(.., true)).
            if was_trampolined && has_steam_path {
                prepare_steam_for_launch_option_update(steam, false)?;
            }
            install_bepinex(
                app_for_task.clone(),
                steam_path.clone(),
                game_path_for_task.clone(),
            )?;
            if was_trampolined {
                bepinex::uninstall_trampoline(game)?;
            }
            if patch_launch_options_supported && has_steam_path {
                let _ = patch_launch_options(
                    app_for_task,
                    steam_path.clone(),
                    game_path_for_task.clone(),
                )?;
            }
            bepinex::write_launch_mode_marker(game, LaunchMode::Prefix)?;
        }
        Ok::<(), String>(())
    })
    .await
    .map_err(|err| format!("failed to run install task: {err}"))??;

    let app_for_state = app.clone();
    let state = app_for_state.state::<InstallerContextState>();
    build_install_state(app, state, Some(game_path))
}

pub async fn run_reset_bpp_data(
    app: tauri::AppHandle,
    install_state: tauri::State<'_, InstallerContextState>,
    stream_state: tauri::State<'_, StreamRuntimeState>,
    game_path: String,
) -> Result<InstallState, String> {
    reset_bpp_data(stream_state, game_path.clone()).await?;
    build_install_state(app, install_state, Some(game_path))
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

pub fn launch_game_via_tempo(
    app: tauri::AppHandle,
    game_path: Option<String>,
) -> Result<(), String> {
    crate::services::tempo::launch_game_via_tempo(app, game_path, None)
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
    let trampoline_consistent = env.trampoline_desired == env.trampoline_applied;
    let version_matches = plugin_version_matches && trampoline_consistent;
    let needs_trampoline_repair = installed && !trampoline_consistent;
    let can_launch = game_found && env.game_path_valid;
    let mut warnings = Vec::new();
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
        runtime: InstallRuntimeState {
            dotnet_version: env.dotnet_version,
            dotnet_ok: env.dotnet_ok,
        },
        compat: InstallCompatState {
            mode_available: env.compat_mode_available,
            forced: env.trampoline_forced,
            desired: env.trampoline_desired,
            applied: env.trampoline_applied,
        },
        actions: InstallActions {
            can_install: can_launch && !installed,
            can_reinstall: can_launch && installed,
            can_reset_data: can_launch,
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
