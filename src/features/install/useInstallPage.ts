import { useCallback, useEffect, useMemo, useState } from 'react';
import type { InstallState } from '../../types/backend';
import { useAsyncAction } from '../shared/useAsyncAction';
import {
  chooseGameDirectory,
  emptyInstallState,
  installMod,
  launchGame,
  loadInstallState,
  repairMod,
  uninstallMod
} from './installApi';

type InstallAction =
  | 'load'
  | 'choose'
  | 'install'
  | 'repair'
  | 'uninstall'
  | 'launch';

export function useInstallPage() {
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
    void refresh();
  }, []);

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
          const path = requireGamePath(state);
          setState(await installMod(path));
          setMessage('安装完成');
        },
        { onStart: () => setMessage(null) }
      ),
    [run, state]
  );

  const repair = useCallback(
    () =>
      run(
        'repair',
        async () => {
          const path = requireGamePath(state);
          setState(await repairMod(path));
          setMessage('修复完成');
        },
        { onStart: () => setMessage(null) }
      ),
    [run, state]
  );

  const uninstall = useCallback(
    () =>
      run(
        'uninstall',
        async () => {
          const path = requireGamePath(state);
          setState(await uninstallMod(path));
          setMessage('卸载完成');
        },
        { onStart: () => setMessage(null) }
      ),
    [run, state]
  );

  const launch = useCallback(
    () =>
      run('launch', async () => {
        await launchGame(state.selected_game_path ?? undefined);
      }),
    [run, state.selected_game_path]
  );

  const status = useMemo(() => createInstallStatus(state), [state]);

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
    repair,
    uninstall,
    launch
  };
}

function requireGamePath(state: InstallState) {
  if (!state.selected_game_path) {
    throw new Error('请先选择 The Bazaar 安装目录。');
  }
  return state.selected_game_path;
}

function createInstallStatus(state: InstallState) {
  const installed = state.mod_state.installed;
  return {
    gameLabel: state.game.path_valid ? '游戏文件完整' : '未找到游戏',
    gameTone: state.game.path_valid ? ('ok' as const) : ('warn' as const),
    modLabel: installed
      ? state.mod_state.version_matches
        ? '核心组件就绪'
        : '需要重新安装'
      : '尚未安装',
    modTone:
      installed && state.mod_state.version_matches
        ? ('ok' as const)
        : ('warn' as const),
    primaryAction: installed ? '重新安装' : '安装',
    modVersion:
      state.mod_state.installed_version ??
      state.mod_state.bundled_version ??
      '-',
    dotnet: state.runtime.dotnet_ok
      ? (state.runtime.dotnet_version ?? 'Ready')
      : 'Missing',
    steam: state.steam_path ? 'Steam' : '-'
  };
}
