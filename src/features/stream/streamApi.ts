import { openUrl } from '@tauri-apps/plugin-opener';
import { commandClient } from '../../api/commandClient';
import { hasTauriRuntime } from '../../api/runtime';
import type { StreamOverlayDisplayMode } from '../../types/backend';

export async function restartStreamSession() {
  return commandClient.restartStreamSession(null);
}

export async function setStreamWindowOffset(offset: number) {
  return commandClient.setStreamWindow(null, Math.max(0, Math.trunc(offset)));
}

export async function loadCropSettings() {
  return commandClient.getOverlaySettings();
}

export async function applyCropCode(code: string) {
  return commandClient.applyOverlayCropCode(code);
}

export async function saveDisplayMode(displayMode: StreamOverlayDisplayMode) {
  return commandClient.saveOverlayDisplayMode(displayMode);
}

export async function resetCropSettings() {
  return commandClient.resetOverlayCrop();
}

export async function openExternal(url: string) {
  if (hasTauriRuntime()) {
    await openUrl(url);
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}
