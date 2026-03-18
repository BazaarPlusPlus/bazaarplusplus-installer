export function hasTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function shouldPatchSteamLaunchOptions(steamPath: string | null | undefined): boolean {
  return Boolean(steamPath?.trim());
}

export function shouldConfirmSteamQuit(options: {
  steamPath: string | null | undefined;
  steamRunning: boolean;
}): boolean {
  return shouldPatchSteamLaunchOptions(options.steamPath) && options.steamRunning;
}

export function resolveInstallDebugPreview(options: {
  isDev: boolean;
  search: string;
  hasTauriRuntime: boolean;
}): boolean {
  return (
    options.isDev &&
    new URLSearchParams(options.search).get('debug-install') === '1' &&
    !options.hasTauriRuntime
  );
}
