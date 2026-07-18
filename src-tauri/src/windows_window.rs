use std::ffi::c_void;

use tauri::WebviewWindow;
use windows::Win32::{
    Foundation::{COLORREF, HWND, LPARAM, LRESULT, RECT, WPARAM},
    Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND,
        DWM_WINDOW_CORNER_PREFERENCE,
    },
    UI::{
        Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass},
        WindowsAndMessaging::{
            GetClientRect, GetWindowRect, SetWindowPos, NCCALCSIZE_PARAMS, SWP_FRAMECHANGED,
            SWP_NOACTIVATE, SWP_NOZORDER, WM_NCCALCSIZE, WM_NCDESTROY,
        },
    },
};

const DWM_COLOR_NONE: COLORREF = COLORREF(0xFFFF_FFFE);
const COMPACT_FRAME_SUBCLASS_ID: usize = 0x4250_5057;
const COMPACT_FRAME_SIDE_INSET: i32 = 1;
const COMPACT_FRAME_TOP_INSET: i32 = 0;
const COMPACT_FRAME_BOTTOM_INSET: i32 = 1;

unsafe extern "system" fn compact_frame_subclass(
    hwnd: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _subclass_id: usize,
    _reference_data: usize,
) -> LRESULT {
    if message == WM_NCCALCSIZE && wparam.0 != 0 {
        // Tao reserves the full resize-frame thickness on the left, right,
        // and bottom of every undecorated shadow window. This fixed-size app
        // does not need those resize handles. Keep only one physical pixel on
        // those three edges and let the client area reach the top edge. Windows
        // 11 still supplies the native shadow and rounded-corner treatment.
        let params = unsafe { &mut *(lparam.0 as *mut NCCALCSIZE_PARAMS) };
        let rect = &mut params.rgrc[0];
        if rect.right - rect.left > COMPACT_FRAME_SIDE_INSET * 2
            && rect.bottom - rect.top > COMPACT_FRAME_TOP_INSET + COMPACT_FRAME_BOTTOM_INSET
        {
            rect.left += COMPACT_FRAME_SIDE_INSET;
            rect.top += COMPACT_FRAME_TOP_INSET;
            rect.right -= COMPACT_FRAME_SIDE_INSET;
            rect.bottom -= COMPACT_FRAME_BOTTOM_INSET;
        }
        return LRESULT(0);
    }

    if message == WM_NCDESTROY {
        unsafe {
            let _ = RemoveWindowSubclass(
                hwnd,
                Some(compact_frame_subclass),
                COMPACT_FRAME_SUBCLASS_ID,
            );
        }
    }

    unsafe { DefSubclassProc(hwnd, message, wparam, lparam) }
}

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

pub(crate) fn configure_native_frame(window: &WebviewWindow) -> Result<(), String> {
    let hwnd = window
        .hwnd()
        .map_err(|error| format!("failed to get the native window handle: {error}"))?;

    let mut client_rect = RECT::default();
    let mut window_rect = RECT::default();

    // Preserve the current content dimensions while replacing Tao's wide
    // non-client insets with the compact frame.
    unsafe {
        GetClientRect(hwnd, &mut client_rect)
            .map_err(|error| format!("failed to read the client rectangle: {error}"))?;
        GetWindowRect(hwnd, &mut window_rect)
            .map_err(|error| format!("failed to read the window rectangle: {error}"))?;

        if !SetWindowSubclass(
            hwnd,
            Some(compact_frame_subclass),
            COMPACT_FRAME_SUBCLASS_ID,
            0,
        )
        .as_bool()
        {
            return Err("failed to install the compact Windows frame handler".into());
        }

        let client_width = client_rect.right - client_rect.left;
        let client_height = client_rect.bottom - client_rect.top;
        let compact_width = client_width + COMPACT_FRAME_SIDE_INSET * 2;
        let compact_height = client_height + COMPACT_FRAME_TOP_INSET + COMPACT_FRAME_BOTTOM_INSET;
        let old_width = window_rect.right - window_rect.left;
        let old_height = window_rect.bottom - window_rect.top;
        let compact_left = window_rect.left + (old_width - compact_width) / 2;
        let compact_top = window_rect.top + (old_height - compact_height) / 2;

        if let Err(error) = SetWindowPos(
            hwnd,
            None,
            compact_left,
            compact_top,
            compact_width,
            compact_height,
            SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
        ) {
            let _ = RemoveWindowSubclass(
                hwnd,
                Some(compact_frame_subclass),
                COMPACT_FRAME_SUBCLASS_ID,
            );
            return Err(format!(
                "failed to activate the compact Windows frame: {error}"
            ));
        }
    }

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
