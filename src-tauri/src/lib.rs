mod commands;
mod config;
mod history;
mod services;
mod stream;
mod tray;

use tauri::{Manager, WindowEvent};

use commands::{
    app::get_app_bootstrap,
    history::{
        delete_battle_video, delete_run_videos, get_history_run_detail, list_history_runs,
        reveal_battle_video, reveal_run_screenshot,
    },
    install::{
        choose_game_directory, get_install_state, install_mod, launch_game, repair_mod,
        uninstall_mod,
    },
    stream::{
        apply_overlay_crop_code, ensure_stream_session, get_overlay_settings, reset_overlay_crop,
        restart_stream_session, save_overlay_display_mode, set_stream_window,
    },
};
use services::startup::InstallerContextState;
use tray::{build_tray, set_app_locale, TrayMenuState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default();

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(crate::stream::state::StreamRuntimeState::default())
        .manage(InstallerContextState::default())
        .manage(TrayMenuState::default())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.app_handle();
            build_tray(&handle)?;
            let app_handle = handle.clone();
            tauri::async_runtime::spawn(async move {
                let state = app_handle.state::<crate::stream::state::StreamRuntimeState>();
                let _ = crate::stream::server::start(app_handle.clone(), state.inner(), None).await;
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }

            if let WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<crate::stream::state::StreamRuntimeState>();
                if state.snapshot().running {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_app_bootstrap,
            set_app_locale,
            get_install_state,
            choose_game_directory,
            install_mod,
            repair_mod,
            uninstall_mod,
            launch_game,
            ensure_stream_session,
            restart_stream_session,
            set_stream_window,
            get_overlay_settings,
            save_overlay_display_mode,
            apply_overlay_crop_code,
            reset_overlay_crop,
            list_history_runs,
            get_history_run_detail,
            reveal_run_screenshot,
            reveal_battle_video,
            delete_battle_video,
            delete_run_videos,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
