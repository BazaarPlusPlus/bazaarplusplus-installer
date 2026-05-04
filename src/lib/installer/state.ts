export type StepState = 'idle' | 'detecting' | 'found' | 'not_found';
export type ActionBusy = 'idle' | 'detect' | 'install' | 'repair' | 'uninstall';

export interface PageStateInput {
  actionBusy: ActionBusy;
  bazaarFound: boolean;
  bppDataResetRequired: boolean;
  selectedGamePath: string | null;
  detectedGamePath: string | null;
  isDebugInstallPreview: boolean;
  bundledBppVersion: string | null;
  installedBppVersion: string | null;
}

export interface PageState {
  hasPath: boolean;
  isBusy: boolean;
  canInstall: boolean;
  canLaunchGame: boolean;
  versionMismatch: boolean;
  effectiveGamePath: string;
}

export function selectCustomGamePath(path: string): string | null {
  const normalizedPath = path.trim();
  return normalizedPath ? normalizedPath : null;
}

export function selectEffectiveGamePath(
  selectedGamePath: string | null,
  detectedGamePath: string | null
): string {
  return selectedGamePath || detectedGamePath || '';
}

export function createPageState(input: PageStateInput): PageState {
  const effectiveGamePath = selectEffectiveGamePath(
    input.selectedGamePath,
    input.detectedGamePath
  );
  const hasPath = Boolean(effectiveGamePath);
  const isBusy = input.actionBusy !== 'idle';
  const versionMismatch = Boolean(
    input.bundledBppVersion &&
    input.installedBppVersion &&
    input.bundledBppVersion !== input.installedBppVersion
  );
  const canInstall =
    !isBusy &&
    !input.bppDataResetRequired &&
    ((input.bazaarFound && hasPath) || input.isDebugInstallPreview);
  // Launching the game is intentionally NOT blocked by `bppDataResetRequired`.
  // The mod owns the data directory at runtime; if a stale BPPData.version
  // would actually break things the user can decide that with the warning
  // already shown on the Bazaar step. Hard-blocking launch only forces them
  // through the destructive reset path.
  const canLaunchGame = !isBusy && input.bazaarFound && hasPath;

  return {
    hasPath,
    isBusy,
    canInstall,
    canLaunchGame,
    versionMismatch,
    effectiveGamePath
  };
}
