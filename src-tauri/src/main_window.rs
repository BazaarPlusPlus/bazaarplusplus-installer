use tauri::Manager;

pub(crate) fn restore(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        eprintln!("failed to restore the main window: window is unavailable");
        return;
    };

    if let Err(error) = window.show() {
        eprintln!("failed to show the main window: {error}");
    }
    if let Err(error) = window.unminimize() {
        eprintln!("failed to unminimize the main window: {error}");
    }
    if let Err(error) = window.set_focus() {
        eprintln!("failed to focus the main window: {error}");
    }
}
