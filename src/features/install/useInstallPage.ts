import { useCallback, useEffect, useMemo, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { hasTauriRuntime } from '../../api/runtime';
import type { InstallState } from '../../types/backend';
import type { MessageKey } from '../../i18n/messages';
import { useI18n, type Translate } from '../../i18n/LocaleProvider';
import { parseResetBppDataError, toErrorMessage } from '../shared/errors';
import { useAsyncAction } from '../shared/useAsyncAction';
import {
  chooseGameDirectory,
  emptyInstallState,
  installMod,
  launchGame,
  loadInstallState,
  resetBppData,
  uninstallMod
} from './installApi';

type InstallAction =
  | 'load'
  | 'choose'
  | 'install'
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
  const { action, error, run, busy } = useAsyncAction<InstallAction>();

  const tempoPhaseMessages: Partial<Record<string, MessageKey>> = useMemo(
    () => ({
      prepare: 'tempoLaunchPrepare',
      backup: 'tempoLaunchBackup',
      launcher: 'tempoLaunchLauncher',
      capture: 'tempoLaunchCapture',
      restore: 'tempoLaunchRestore',
      launch: 'tempoLaunchLaunching',
      done: 'tempoLaunchDone',
      error: 'tempoLaunchFailed'
    }),
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
    const unlisten = listen<{ phase: string; message: string }>(
      'tempo-launch-status',
      (event) => {
        const key = tempoPhaseMessages[event.payload.phase];
        if (key) setMessage(t(key));
      }
    );
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, [t, tempoPhaseMessages]);

  const chooseDirectory = useCallback(
    () =>
      run('choose', async () => {
        const selection = await chooseGameDirectory();
        if (!selection.game_path) return;
        setSelectedPath(selection.game_path);
        setState(await loadInstallState(selection.game_path));
      }),
    [run]
  );

  const install = useCallback(
    (compatOptIn: boolean) =>
      run(
        'install',
        async () => {
          const path = requireGamePath(state, t);
          setState(await installMod(path, compatOptIn));
          setMessage(t('installDone'));
        },
        { onStart: () => setMessage(null) }
      ),
    [run, state, t]
  );

  const resetData = useCallback(
    () =>
      run(
        'resetData',
        async () => {
          const path = requireGamePath(state, t);
          setState(await resetBppData(path));
          setMessage(t('resetDataDone'));
        },
        {
          onStart: () => setMessage(null),
          errorMessage: (caught) => formatResetBppDataError(caught, t)
        }
      ),
    [run, state, t]
  );

  const uninstall = useCallback(
    () =>
      run(
        'uninstall',
        async () => {
          const path = requireGamePath(state, t);
          setState(await uninstallMod(path));
          setMessage(t('uninstallDone'));
        },
        { onStart: () => setMessage(null) }
      ),
    [run, state, t]
  );

  const launch = useCallback(
    () =>
      run(
        'launch',
        async () => {
          await launchGame(state.selected_game_path ?? undefined);
        },
        { errorMessage: (caught) => formatTempoLaunchError(caught, t) }
      ),
    [run, state.selected_game_path, t]
  );

  const status = useMemo(() => createInstallStatus(state, t), [state, t]);

  return {
    state,
    status,
    action,
    busy,
    error,
    message,
    refresh,
    chooseDirectory,
    install,
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

function formatResetBppDataError(error: unknown, t: Translate) {
  const resetError = parseResetBppDataError(error);
  if (resetError?.code === 'game_running') {
    return t('resetDataBlockedByGame');
  }
  if (resetError?.code === 'partial_failure') {
    return t('resetDataPartialFailure', {
      count: Math.max(1, resetError.paths.length)
    });
  }
  return toErrorMessage(error);
}

function formatTempoLaunchError(error: unknown, t: Translate) {
  const message = toErrorMessage(error);
  if (message.includes('tempo_launch_already_in_progress')) {
    return t('tempoLaunchInProgress');
  }
  if (message.includes('tempo_game_already_running')) {
    return t('tempoGameAlreadyRunning');
  }
  if (message.includes('tempo_launcher_not_found')) {
    return t('tempoLauncherNotFound');
  }
  if (message.includes('tempo_capture_timeout')) {
    return t('tempoCaptureTimeout');
  }
  return message;
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
    dotnet: state.runtime.dotnet_ok
      ? (state.runtime.dotnet_version ?? t('ready'))
      : t('missing'),
    steam: state.steam_path ? 'Steam' : '-'
  };
}
