type PendingWhatsNewLaunch = {
  reason: 'auto-update';
  fromVersion: string | null;
  toVersion: string;
};

const PENDING_WHATS_NEW_LAUNCH_STORAGE_KEY =
  'bppinstaller:pending-whats-new-launch';

function getLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

export function markPendingWhatsNewLaunch(payload: PendingWhatsNewLaunch) {
  const localStorage = getLocalStorage();
  if (!localStorage) return;

  localStorage.setItem(
    PENDING_WHATS_NEW_LAUNCH_STORAGE_KEY,
    JSON.stringify(payload)
  );
}

export function loadPendingWhatsNewLaunch(): PendingWhatsNewLaunch | null {
  const localStorage = getLocalStorage();
  if (!localStorage) return null;

  const rawValue = localStorage.getItem(PENDING_WHATS_NEW_LAUNCH_STORAGE_KEY);
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue) as Partial<PendingWhatsNewLaunch>;

    if (
      parsed.reason !== 'auto-update' ||
      typeof parsed.toVersion !== 'string' ||
      !parsed.toVersion.trim()
    ) {
      return null;
    }

    return {
      reason: 'auto-update',
      fromVersion:
        typeof parsed.fromVersion === 'string' && parsed.fromVersion.trim()
          ? parsed.fromVersion.trim()
          : null,
      toVersion: parsed.toVersion.trim()
    };
  } catch {
    return null;
  }
}

export function clearPendingWhatsNewLaunch() {
  getLocalStorage()?.removeItem(PENDING_WHATS_NEW_LAUNCH_STORAGE_KEY);
}
