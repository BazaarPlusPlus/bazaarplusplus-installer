const CUSTOM_GAME_PATH_STORAGE_KEY = 'bppinstaller:custom-game-path';
const DETECTED_GAME_PATH_STORAGE_KEY = 'bppinstaller:detected-game-path';
const FFMPEG_SKIPPED_STORAGE_KEY = 'bppinstaller:ffmpeg-skipped';
const FFMPEG_STEP_ENABLED_STORAGE_KEY = 'bppinstaller:enable-ffmpeg-step';

function getLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

export function loadPersistedCustomGamePath(): string {
  return getLocalStorage()?.getItem(CUSTOM_GAME_PATH_STORAGE_KEY)?.trim() ?? '';
}

export function persistCustomGamePath(path: string) {
  const localStorage = getLocalStorage();
  if (!localStorage) return;
  const normalizedPath = path.trim();
  if (normalizedPath) {
    localStorage.setItem(CUSTOM_GAME_PATH_STORAGE_KEY, normalizedPath);
    return;
  }
  localStorage.removeItem(CUSTOM_GAME_PATH_STORAGE_KEY);
}

export function loadPersistedDetectedGamePath(): string {
  return getLocalStorage()?.getItem(DETECTED_GAME_PATH_STORAGE_KEY)?.trim() ?? '';
}

export function persistDetectedGamePath(path: string) {
  const localStorage = getLocalStorage();
  if (!localStorage) return;
  const normalizedPath = path.trim();
  if (normalizedPath) {
    localStorage.setItem(DETECTED_GAME_PATH_STORAGE_KEY, normalizedPath);
    return;
  }
  localStorage.removeItem(DETECTED_GAME_PATH_STORAGE_KEY);
}

export function loadFfmpegSkipped(): boolean {
  return getLocalStorage()?.getItem(FFMPEG_SKIPPED_STORAGE_KEY) === 'true';
}

export function persistFfmpegSkipped(skipped: boolean) {
  const localStorage = getLocalStorage();
  if (!localStorage) return;
  if (skipped) {
    localStorage.setItem(FFMPEG_SKIPPED_STORAGE_KEY, 'true');
    return;
  }
  localStorage.removeItem(FFMPEG_SKIPPED_STORAGE_KEY);
}

/// Gradual-rollout gate. The feature ships behind this flag so the FFmpeg
/// step is visible to users we explicitly opt in. In dev the flag defaults
/// on so the UI is exercised during local iteration without manual setup.
export function loadFfmpegStepEnabled(devDefault: boolean): boolean {
  const stored = getLocalStorage()?.getItem(FFMPEG_STEP_ENABLED_STORAGE_KEY);
  if (stored === 'true') return true;
  if (stored === 'false') return false;
  return devDefault;
}

export function persistFfmpegStepEnabled(enabled: boolean) {
  const localStorage = getLocalStorage();
  if (!localStorage) return;
  localStorage.setItem(
    FFMPEG_STEP_ENABLED_STORAGE_KEY,
    enabled ? 'true' : 'false'
  );
}
