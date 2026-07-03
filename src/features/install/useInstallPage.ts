import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { hasTauriRuntime } from '../../api/runtime';
import type {
  BranchSwitchStatus,
  InstallState,
  SteamBranchTarget
} from '../../types/backend';
import { useI18n, type Translate } from '../../i18n/LocaleProvider';
import { parseResetBppDataError, toErrorMessage } from '../shared/errors';
import { useAsyncAction } from '../shared/useAsyncAction';
import { PTR_BRANCH_AUTH_ERROR } from './branchSwitchErrors';
import {
  cancelBranchSwitch as cancelBranchSwitchCommand,
  chooseGameDirectory,
  emptyInstallState,
  getBranchSwitchStatus,
  installMod,
  launchGame,
  loadInstallState,
  resetBppData,
  switchBranch as switchBranchCommand,
  uninstallMod
} from './installApi';

type InstallAction =
  | 'load'
  | 'choose'
  | 'install'
  | 'switchBranch'
  | 'resetData'
  | 'uninstall'
  | 'launch';

export function useInstallPage() {
  const { t } = useI18n();
  const [state, setState] = useState<InstallState>(emptyInstallState);
  const [selectedPath, setSelectedPath] = useState<string | undefined>(
    undefined
  );
  const [message, setMessage] = useState<string | null>(null);
  const flashTimer = useRef<number | null>(null);
  const [resetDataFailurePaths, setResetDataFailurePaths] = useState<string[]>(
    []
  );
  const [branchSwitchStatus, setBranchSwitchStatus] =
    useState<BranchSwitchStatus | null>(null);
  const [branchSwitchCanceling, setBranchSwitchCanceling] = useState(false);
  const [branchSwitchHydrating, setBranchSwitchHydrating] = useState(() =>
    hasTauriRuntime()
  );
  const { action, error, setError, run, busy } =
    useAsyncAction<InstallAction>();
  const branchSwitchActive =
    action === 'switchBranch' || isActiveBranchSwitchStatus(branchSwitchStatus);
  const branchSwitchBlocked = branchSwitchHydrating || branchSwitchActive;

  const applyBranchSwitchStatus = useCallback((next: BranchSwitchStatus) => {
    setBranchSwitchStatus(next);
    setBranchSwitchHydrating(false);
    if (!next.cancelable) {
      setBranchSwitchCanceling(false);
    }
  }, []);

  // Discrete success confirmations (install/uninstall/reset done) should not
  // linger forever.
  const flashMessage = useCallback((next: string) => {
    if (flashTimer.current !== null) {
      window.clearTimeout(flashTimer.current);
    }
    setMessage(next);
    flashTimer.current = window.setTimeout(() => {
      setMessage(null);
      flashTimer.current = null;
    }, 4000);
  }, []);

  useEffect(
    () => () => {
      if (flashTimer.current !== null) {
        window.clearTimeout(flashTimer.current);
      }
    },
    []
  );
  const refresh = useCallback(
    async (gamePath = selectedPath) => {
      await run(
        'load',
        async () => {
          const nextState = await loadInstallState(gamePath);
          setState(nextState);
          setSelectedPath(nextState.selected_game_path ?? gamePath);
        },
        { onStart: () => setMessage(null) }
      );
    },
    [run, selectedPath]
  );

  useEffect(() => {
    void run(
      'load',
      async () => {
        const nextState = await loadInstallState(undefined);
        setState(nextState);
        setSelectedPath(nextState.selected_game_path ?? undefined);
      },
      { onStart: () => setMessage(null) }
    );
  }, [run]);

  // The backend warms up installer context in the background and emits
  // `startup-ready` when done. On slow first launches (Windows) the initial
  // load above can race ahead of warm-up; refresh once the signal arrives so
  // the first screen converges to fully-detected state without user action.
  useEffect(() => {
    if (!hasTauriRuntime()) return;
    const unlisten = listen('startup-ready', () => {
      void refresh();
    });
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, [refresh]);

  useEffect(() => {
    if (!hasTauriRuntime()) return;
    let disposed = false;
    const unlisten = listen<BranchSwitchStatus>(
      'branch-switch-status',
      (event) => {
        if (disposed) return;
        applyBranchSwitchStatus(event.payload);
      }
    );
    void unlisten
      .then(() => getBranchSwitchStatus())
      .then((snapshot) => {
        if (disposed) return;
        applyBranchSwitchStatus(snapshot);
      })
      .catch((caught) => {
        if (disposed) return;
        setBranchSwitchHydrating(false);
        setError(formatBranchSwitchError(caught, t));
      });
    return () => {
      disposed = true;
      void unlisten.then((stop) => stop());
    };
  }, [applyBranchSwitchStatus, setError, t]);

  const chooseDirectory = useCallback(
    () =>
      run('choose', async () => {
        if (branchSwitchBlocked) return;
        const selection = await chooseGameDirectory();
        if (!selection.game_path) return;
        setSelectedPath(selection.game_path);
        setState(await loadInstallState(selection.game_path));
      }),
    [branchSwitchBlocked, run]
  );

  const install = useCallback(
    (compatOptIn: boolean) =>
      run(
        'install',
        async () => {
          if (branchSwitchBlocked) return;
          const path = requireGamePath(state, t);
          setState(await installMod(path, compatOptIn));
          flashMessage(t('installDone'));
        },
        { onStart: () => setMessage(null) }
      ),
    [branchSwitchBlocked, flashMessage, run, state, t]
  );

  const switchBranch = useCallback(
    (target: SteamBranchTarget) =>
      run(
        'switchBranch',
        async () => {
          if (branchSwitchBlocked) return;
          const path = requireGamePath(state, t);
          const result = await switchBranchCommand(
            path,
            target,
            state.compat.desired
          );
          setState(result.state);
          flashMessage(
            result.canceled ? t('branchSwitchCanceled') : t('branchSwitchDone')
          );
        },
        {
          onStart: () => {
            setMessage(null);
            setResetDataFailurePaths([]);
            setBranchSwitchCanceling(false);
            setBranchSwitchHydrating(false);
            setBranchSwitchStatus(createPendingBranchSwitchStatus(target));
          },
          errorMessage: (caught) => formatBranchSwitchError(caught, t)
        }
      ),
    [branchSwitchBlocked, flashMessage, run, state, t]
  );

  const cancelBranchSwitch = useCallback(async () => {
    if (!branchSwitchStatus?.cancelable || branchSwitchCanceling) return;
    setBranchSwitchCanceling(true);
    try {
      setBranchSwitchStatus(await cancelBranchSwitchCommand());
    } catch (caught) {
      setBranchSwitchCanceling(false);
      setError(formatBranchSwitchError(caught, t));
    }
  }, [branchSwitchCanceling, branchSwitchStatus?.cancelable, setError, t]);

  const resetData = useCallback(
    () =>
      run(
        'resetData',
        async () => {
          if (branchSwitchBlocked) return;
          if (!state.has_resettable_data) {
            setResetDataFailurePaths([]);
            flashMessage(t('resetDataNothingToDelete'));
            return;
          }

          const path = requireGamePath(state, t);
          const result = await resetBppData(path);
          setState(result.state);
          setResetDataFailurePaths([]);
          flashMessage(
            result.removed_data
              ? t('resetDataDone')
              : t('resetDataNothingToDelete')
          );
        },
        {
          onStart: () => {
            setMessage(null);
            setResetDataFailurePaths([]);
          },
          errorMessage: (caught) =>
            formatResetBppDataError(caught, t, setResetDataFailurePaths)
        }
      ),
    [branchSwitchBlocked, flashMessage, run, state, t]
  );

  const uninstall = useCallback(
    () =>
      run(
        'uninstall',
        async () => {
          if (branchSwitchBlocked) return;
          const path = requireGamePath(state, t);
          setState(await uninstallMod(path));
          flashMessage(t('uninstallDone'));
        },
        { onStart: () => setMessage(null) }
      ),
    [branchSwitchBlocked, flashMessage, run, state, t]
  );

  const launch = useCallback(
    () =>
      run(
        'launch',
        async () => {
          if (branchSwitchBlocked) return;
          await launchGame();
        },
        { onStart: () => setMessage(null) }
      ),
    [branchSwitchBlocked, run]
  );

  const status = useMemo(() => createInstallStatus(state, t), [state, t]);

  return {
    state,
    status,
    action,
    busy,
    error,
    message,
    branchSwitch: {
      status: branchSwitchStatus,
      active: branchSwitchActive,
      blocking: branchSwitchBlocked,
      canceling: branchSwitchCanceling
    },
    resetDataFailurePaths,
    refresh,
    chooseDirectory,
    install,
    switchBranch,
    cancelBranchSwitch,
    resetData,
    uninstall,
    launch
  };
}

function requireGamePath(state: InstallState, t: Translate) {
  if (!state.selected_game_path) {
    throw new Error(t('selectGameDirFirst'));
  }
  return state.selected_game_path;
}

function formatResetBppDataError(
  error: unknown,
  t: Translate,
  setFailurePaths: (paths: string[]) => void
) {
  const resetError = parseResetBppDataError(error);
  if (resetError?.code === 'game_running') {
    setFailurePaths([]);
    return t('resetDataBlockedByGame');
  }
  if (resetError?.code === 'partial_failure') {
    setFailurePaths(resetError.paths);
    return t('resetDataPartialFailure', {
      count: Math.max(1, resetError.paths.length)
    });
  }
  setFailurePaths([]);
  return toErrorMessage(error);
}

function formatBranchSwitchError(error: unknown, t: Translate) {
  const message = toErrorMessage(error);
  return message === PTR_BRANCH_AUTH_ERROR
    ? t('branchSwitchPtrAuthRequired')
    : message;
}

function createPendingBranchSwitchStatus(
  target: SteamBranchTarget
): BranchSwitchStatus {
  return {
    phase: 'pre_check',
    target,
    cancelable: false,
    bytes_downloaded: null,
    bytes_to_download: null,
    progress_fraction: null,
    message: null
  };
}

function isActiveBranchSwitchStatus(status: BranchSwitchStatus | null) {
  return (
    status !== null &&
    status.phase !== 'idle' &&
    status.phase !== 'ready' &&
    status.phase !== 'canceled' &&
    status.phase !== 'error'
  );
}

function createInstallStatus(state: InstallState, t: Translate) {
  const installed = state.mod_state.installed;
  return {
    gameLabel: state.game.path_valid ? t('gameFilesOk') : t('gameNotFound'),
    gameTone: state.game.path_valid ? ('ok' as const) : ('warn' as const),
    modLabel: installed
      ? state.mod_state.version_matches
        ? t('modReady')
        : t('modNeedsReinstall')
      : t('modNotInstalled'),
    modTone:
      installed && state.mod_state.version_matches
        ? ('ok' as const)
        : ('warn' as const),
    primaryAction: installed ? t('actionReinstall') : t('actionInstall'),
    modVersion:
      state.mod_state.installed_version ??
      state.mod_state.bundled_version ??
      '-',
    steam: state.steam_path ? 'Steam' : '-'
  };
}
