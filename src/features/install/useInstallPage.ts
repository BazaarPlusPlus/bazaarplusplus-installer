import { useCallback, useEffect, useMemo, useState } from 'react';
import type { InstallState } from '../../types/backend';
import { useI18n, type Translate } from '../../i18n/LocaleProvider';
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
    () =>
      run(
        'install',
        async () => {
          const path = requireGamePath(state, t);
          setState(await installMod(path));
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
        { onStart: () => setMessage(null) }
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
      run('launch', async () => {
        await launchGame(state.selected_game_path ?? undefined);
      }),
    [run, state.selected_game_path]
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
