const CUSTOM_GAME_PATH_STORAGE_KEY = 'bppinstaller:custom-game-path';

export function loadPersistedCustomGamePath(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(CUSTOM_GAME_PATH_STORAGE_KEY)?.trim() ?? '';
}

export function persistCustomGamePath(path: string) {
  if (typeof window === 'undefined') return;
  const normalizedPath = path.trim();
  if (normalizedPath) {
    window.localStorage.setItem(CUSTOM_GAME_PATH_STORAGE_KEY, normalizedPath);
    return;
  }
  window.localStorage.removeItem(CUSTOM_GAME_PATH_STORAGE_KEY);
}
