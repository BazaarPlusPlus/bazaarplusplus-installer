mod commands;
mod config;
mod history;
mod problem;
mod services;
mod stream;
mod tray;
#[cfg(target_os = "windows")]
mod windows_window;

// The unit-test harness links the same Tauri dialog code as the application,
// but tauri-build only attaches its Common Controls v6 resource to binaries.
// Without this test-only link, Windows fails before running any test because
// comctl32!TaskDialogIndirect is unavailable from the legacy activation context.
#[cfg(all(test, target_os = "windows"))]
#[link(name = "resource", kind = "static")]
unsafe extern "C" {}

use tauri::{Manager, WindowEvent};

use services::startup::InstallerContextState;
use tray::{build_tray, TrayMenuState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default();
    let command_builder = crate::commands::registry::builder();

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        // single-instance must be registered first; window-state restores the
        // remembered window size/position on launch and saves it on close.
        builder = builder
            .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }))
            .plugin(tauri_plugin_window_state::Builder::default().build());
    }

    builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(
            crate::services::selected_game_installation::SelectedGameInstallationState::default(),
        )
        .manage(crate::stream::runtime::StreamRuntime::default())
        .manage(InstallerContextState::default())
        .manage(TrayMenuState::default())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            #[cfg(target_os = "windows")]
            {
                let window = app
                    .get_webview_window("main")
                    .ok_or_else(|| std::io::Error::other("main window is unavailable"))?;
                window.set_decorations(false)?;
                window.show()?;

                // Showing the window can refresh its Win32 frame. Compact Tao's
                // wide resize insets after the window has its final native frame.
                let border_window = window.clone();
                window.run_on_main_thread(move || {
                    if let Err(error) =
                        crate::windows_window::configure_native_frame(&border_window)
                    {
                        eprintln!("failed to configure the Windows native frame: {error}");
                    }
                })?;

                // Reapply after activation changes as recommended for DWM border
                // color overrides. This also makes tray hide/show cycles robust.
                let border_window = window.clone();
                window.on_window_event(move |event| {
                    if matches!(event, WindowEvent::Focused(_)) {
                        if let Err(error) = crate::windows_window::refresh_dwm_frame(&border_window)
                        {
                            eprintln!("failed to reapply the Windows DWM border override: {error}");
                        }
                    }
                });
            }

            let handle = app.app_handle();
            build_tray(handle)?;
            let startup_handle = handle.clone();
            tauri::async_runtime::spawn_blocking(move || {
                let state = startup_handle.state::<InstallerContextState>();
                let _ = state.get_or_initialize(&startup_handle);
            });
            let app_handle = handle.clone();
            tauri::async_runtime::spawn(async move {
                let runtime = app_handle.state::<crate::stream::runtime::StreamRuntime>();
                let _ = runtime.ensure(app_handle.clone(), None).await;
            });
            Ok(())
        })
        // While the stream service is running, hide the main window to the tray
        // on close instead of quitting, so the local overlay HTTP server keeps
        // serving OBS. The tray menu's quit action is the real exit path.
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }

            if let WindowEvent::CloseRequested { api, .. } = event {
                let runtime = window.state::<crate::stream::runtime::StreamRuntime>();
                if runtime.snapshot().running {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(command_builder.invoke_handler())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
