use tauri::Manager;
#[cfg(any(target_os = "windows", test))]
use tauri::{LogicalSize, PhysicalSize};

#[cfg(any(target_os = "windows", test))]
const MAIN_WINDOW_MIN_WIDTH: f64 = 900.0;
#[cfg(any(target_os = "windows", test))]
const MAIN_WINDOW_MIN_HEIGHT: f64 = 600.0;

#[cfg(any(target_os = "windows", test))]
pub(crate) fn corrected_main_window_size(
    current: PhysicalSize<u32>,
    scale_factor: f64,
) -> Option<LogicalSize<f64>> {
    let logical = current.to_logical::<f64>(scale_factor);
    let corrected = LogicalSize::new(
        logical.width.max(MAIN_WINDOW_MIN_WIDTH),
        logical.height.max(MAIN_WINDOW_MIN_HEIGHT),
    );

    (corrected != logical).then_some(corrected)
}

#[cfg(any(target_os = "windows", test))]
#[cfg_attr(test, allow(dead_code))]
pub(crate) fn enforce_minimum_size(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    if window.is_minimized()? {
        return Ok(());
    }

    window.set_min_size(Some(LogicalSize::new(
        MAIN_WINDOW_MIN_WIDTH,
        MAIN_WINDOW_MIN_HEIGHT,
    )))?;

    if let Some(corrected) =
        corrected_main_window_size(window.inner_size()?, window.scale_factor()?)
    {
        window.set_size(corrected)?;
    }

    Ok(())
}

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

#[cfg(test)]
mod tests {
    use super::corrected_main_window_size;
    use tauri::{LogicalSize, PhysicalSize};

    #[test]
    fn undersized_restored_window_is_corrected_to_the_logical_minimum() {
        assert_eq!(
            corrected_main_window_size(PhysicalSize::new(972, 612), 2.25),
            Some(LogicalSize::new(900.0, 600.0))
        );
    }
}
