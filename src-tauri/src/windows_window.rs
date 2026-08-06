use std::ffi::c_void;

use tauri::WebviewWindow;
use windows::Win32::{
    Foundation::{COLORREF, HWND},
    Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND,
        DWM_WINDOW_CORNER_PREFERENCE,
    },
};

const DWM_COLOR_NONE: COLORREF = COLORREF(0xFFFF_FFFE);

fn set_dwm_attribute<T>(
    hwnd: HWND,
    attribute: windows::Win32::Graphics::Dwm::DWMWINDOWATTRIBUTE,
    value: &T,
) -> Result<(), String> {
    // SAFETY: `hwnd` belongs to the live WebviewWindow and `value` remains
    // valid for the duration of this synchronous Win32 call.
    unsafe {
        DwmSetWindowAttribute(
            hwnd,
            attribute,
            (value as *const T).cast::<c_void>(),
            std::mem::size_of::<T>() as u32,
        )
    }
    .map_err(|error| format!("failed to set DWM window attribute {attribute:?}: {error}"))
}

pub(crate) fn apply_dwm_frame_style(window: &WebviewWindow) -> Result<(), String> {
    let hwnd = window
        .hwnd()
        .map_err(|error| format!("failed to get the native window handle: {error}"))?;

    set_dwm_attribute(hwnd, DWMWA_BORDER_COLOR, &DWM_COLOR_NONE)?;
    set_dwm_attribute::<DWM_WINDOW_CORNER_PREFERENCE>(
        hwnd,
        DWMWA_WINDOW_CORNER_PREFERENCE,
        &DWMWCP_ROUND,
    )
}

pub(crate) fn refresh_dwm_frame(window: &WebviewWindow) -> Result<(), String> {
    let hwnd = window
        .hwnd()
        .map_err(|error| format!("failed to get the native window handle: {error}"))?;

    set_dwm_attribute(hwnd, DWMWA_BORDER_COLOR, &DWM_COLOR_NONE)?;
    set_dwm_attribute::<DWM_WINDOW_CORNER_PREFERENCE>(
        hwnd,
        DWMWA_WINDOW_CORNER_PREFERENCE,
        &DWMWCP_ROUND,
    )
}
