const CUSTOM_GAME_PATH_STORAGE_KEY = 'bppinstaller:custom-game-path';
const INSTALL_ID_STORAGE_KEY = 'bppinstaller:install-id';
const UPDATE_CHECKED_AT_STORAGE_KEY = 'bppinstaller:update-checked-at';

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

export function getOrCreateInstallId(generateId: () => string = defaultInstallIdFactory): string {
  const localStorage = getLocalStorage();
  if (!localStorage) {
    return generateId();
  }

  const persisted = localStorage.getItem(INSTALL_ID_STORAGE_KEY)?.trim();
  if (persisted) {
    return persisted;
  }

  const installId = generateId().trim();
  localStorage.setItem(INSTALL_ID_STORAGE_KEY, installId);
  return installId;
}

export function loadLastUpdateCheckAt(): number | null {
  const localStorage = getLocalStorage();
  if (!localStorage) return null;

  const persisted = localStorage.getItem(UPDATE_CHECKED_AT_STORAGE_KEY)?.trim();
  if (!persisted) return null;

  const timestamp = Number(persisted);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function persistLastUpdateCheckAt(timestamp: number | null) {
  const localStorage = getLocalStorage();
  if (!localStorage) return;

  if (timestamp === null || !Number.isFinite(timestamp)) {
    localStorage.removeItem(UPDATE_CHECKED_AT_STORAGE_KEY);
    return;
  }

  localStorage.setItem(UPDATE_CHECKED_AT_STORAGE_KEY, String(timestamp));
}

function defaultInstallIdFactory(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `install-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
