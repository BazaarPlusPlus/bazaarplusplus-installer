mod commands;
mod config;
mod stream;

use tauri::{
    menu::{Menu, MenuItemBuilder},
    tray::{TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

use commands::{
    bepinex::{get_legacy_record_directory_info, install_bepinex, repair_bpp, uninstall_bpp},
    detect::{detect_environment, verify_game_path},
    game_process::detect_bazaar_running,
    identity::{delete_auth_record, post_identity_json, read_identity_snapshot, write_auth_record},
    startup::{initialize_installer_context, InstallerContextState},
    steam::{close_steam, detect_steam_running},
    stream::{
        delete_stream_record, detect_stream_db_path, get_stream_overlay_crop_settings,
        get_stream_service_status, import_stream_overlay_crop_code, list_stream_overlay_records,
        load_stream_record_strip_preview, load_stream_record_strip_previews,
        reveal_stream_record_image, save_stream_overlay_crop_settings,
        save_stream_overlay_display_mode, set_stream_overlay_window_offset, start_stream_service,
        stop_stream_service,
    },
    supporters::load_supporters,
    vdf::patch_launch_options,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(crate::stream::state::StreamRuntimeState::default())
        .manage(InstallerContextState::default())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.app_handle();
            build_tray(&handle)?;
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
            initialize_installer_context,
            detect_environment,
            detect_bazaar_running,
            detect_steam_running,
            close_steam,
            verify_game_path,
            read_identity_snapshot,
            write_auth_record,
            delete_auth_record,
            post_identity_json,
            install_bepinex,
            repair_bpp,
            get_legacy_record_directory_info,
            uninstall_bpp,
            patch_launch_options,
            load_supporters,
            start_stream_service,
            stop_stream_service,
            get_stream_service_status,
            set_stream_overlay_window_offset,
            get_stream_overlay_crop_settings,
            save_stream_overlay_crop_settings,
            save_stream_overlay_display_mode,
            import_stream_overlay_crop_code,
            list_stream_overlay_records,
            load_stream_record_strip_preview,
            load_stream_record_strip_previews,
            reveal_stream_record_image,
            delete_stream_record,
            detect_stream_db_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn build_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    let show_window = MenuItemBuilder::with_id("show_window", "Show Window").build(app)?;
    let copy_obs_url = MenuItemBuilder::with_id("copy_obs_url", "Copy OBS URL").build(app)?;
    let stop_stream_service =
        MenuItemBuilder::with_id("stop_stream_service", "Stop Stream Service").build(app)?;
    let quit = MenuItemBuilder::with_id("quit_app", "Quit").build(app)?;
    let menu = Menu::with_items(
        app,
        &[&show_window, &copy_obs_url, &stop_stream_service, &quit],
    )?;

    let mut tray = TrayIconBuilder::with_id("main-tray")
        .menu(&menu)
        .tooltip("BazaarPlusPlus")
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show_window" => show_main_window(app),
            "copy_obs_url" => {
                let state = app.state::<crate::stream::state::StreamRuntimeState>();
                if let Some(url) = state.snapshot().overlay_url {
                    let _ = copy_text_to_clipboard(&url);
                }
            }
            "stop_stream_service" => {
                let app_handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    let state = app_handle.state::<crate::stream::state::StreamRuntimeState>();
                    let _ = crate::stream::server::stop(state.inner()).await;
                });
            }
            "quit_app" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click { .. } | TrayIconEvent::DoubleClick { .. }
            ) {
                show_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        tray = tray.icon(icon);
    }

    let _ = tray.build(app)?;
    Ok(())
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn copy_text_to_clipboard(text: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use std::io::Write;
        use std::process::{Command, Stdio};

        let mut child = Command::new("pbcopy")
            .stdin(Stdio::piped())
            .spawn()
            .map_err(|err| format!("failed to launch pbcopy: {err}"))?;
        let stdin = child
            .stdin
            .as_mut()
            .ok_or_else(|| "pbcopy stdin unavailable".to_string())?;
        stdin
            .write_all(text.as_bytes())
            .map_err(|err| format!("failed to write to pbcopy: {err}"))?;
        child
            .wait()
            .map_err(|err| format!("failed to wait for pbcopy: {err}"))?;
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        use std::io::Write;
        use std::process::{Command, Stdio};

        let mut child = Command::new("cmd")
            .args(["/C", "clip"])
            .stdin(Stdio::piped())
            .spawn()
            .map_err(|err| format!("failed to launch clip: {err}"))?;
        let stdin = child
            .stdin
            .as_mut()
            .ok_or_else(|| "clip stdin unavailable".to_string())?;
        stdin
            .write_all(text.as_bytes())
            .map_err(|err| format!("failed to write to clip: {err}"))?;
        child
            .wait()
            .map_err(|err| format!("failed to wait for clip: {err}"))?;
        return Ok(());
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = text;
        Err("clipboard copy is unsupported on this platform".to_string())
    }
}
