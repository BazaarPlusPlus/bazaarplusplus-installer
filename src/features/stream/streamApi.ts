import { openUrl } from '@tauri-apps/plugin-opener';
import { invokeOrFallback } from '../../api/tauri';
import { hasTauriRuntime } from '../../api/runtime';
import type { StreamOverlayDisplayMode } from '../../types/backend';

export async function restartStreamSession() {
  return invokeOrFallback('restart_stream_session', {});
}

export async function setStreamWindowOffset(offset: number) {
  return invokeOrFallback('set_stream_window', {
    offset: Math.max(0, Math.trunc(offset))
  });
}

export async function loadCropSettings() {
  return invokeOrFallback('get_overlay_settings');
}

export async function applyCropCode(code: string) {
  return invokeOrFallback('apply_overlay_crop_code', { code });
}

export async function saveDisplayMode(displayMode: StreamOverlayDisplayMode) {
  return invokeOrFallback('save_overlay_display_mode', { displayMode });
}

export async function resetCropSettings() {
  return invokeOrFallback('reset_overlay_crop');
}

export async function openExternal(url: string) {
  if (hasTauriRuntime()) {
    await openUrl(url);
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}
