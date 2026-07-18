import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState
} from 'react';
import type { InstallState } from '../../types/backend';
import { useI18n } from '../../i18n/LocaleProvider';
import { useAsyncAction } from '../shared/useAsyncAction';
import { useTransientMessage } from '../shared/useTransientMessage';
import {
  chooseGameDirectory,
  installMod,
  launchGame,
  loadInstallState,
  resetBepinex,
  resetBppData,
  uninstallMod
} from './installApi';
import {
  deriveInstallPrimaryAction,
  initialInstallPageState,
  reduceInstallPageState,
  type InstallOperation
} from './installPageState';
import {
  installFailurePaths,
  installProblemFromError,
  presentInstallProblem,
  type InstallProblem
} from './installProblems';
import type { ConfirmedOperationOutcome } from '../shared/confirmedOperation';

export type InstallActionResult = ConfirmedOperationOutcome<InstallProblem>;

export function useInstallPage() {
  const { t } = useI18n();
  const [pageState, dispatch] = useReducer(
    reduceInstallPageState,
    initialInstallPageState
  );
  const [selectedPath, setSelectedPath] = useState<string | undefined>();
  const [transient, setTransient] = useTransientMessage(4000);
  const [actionProblem, setActionProblem] = useState<InstallProblem | null>(
    null
  );
  const [resetDataFailurePaths, setResetDataFailurePaths] = useState<string[]>(
    []
  );
  const { action, run, busy: actionBusy } = useAsyncAction<InstallOperation>();
  const requestIdRef = useRef(0);
  const requestInFlightRef = useRef(false);
  const actionInFlightRef = useRef(false);

  const replaceData = useCallback((data: InstallState) => {
    dispatch({ type: 'data-replaced', data });
    setSelectedPath(data.selected_game_path ?? undefined);
  }, []);

  const detect = useCallback(
    async (gamePath?: string) => {
      if (requestInFlightRef.current || actionInFlightRef.current) return false;
      const requestId = ++requestIdRef.current;
      requestInFlightRef.current = true;
      dispatch({ type: 'request-started', requestId });
      setTransient(null);
      setActionProblem(null);
      setResetDataFailurePaths([]);
      try {
        const data = await loadInstallState(gamePath);
        dispatch({ type: 'request-succeeded', requestId, data });
        setSelectedPath(data.selected_game_path ?? gamePath);
        return true;
      } catch (caught) {
        dispatch({
          type: 'request-failed',
          requestId,
          problem: installProblemFromError(caught)
        });
        return false;
      } finally {
        if (requestIdRef.current === requestId) {
          requestInFlightRef.current = false;
        }
      }
    },
    [setTransient]
  );

  useEffect(() => {
    // `get_install_state` waits on the backend's OnceLock initialization, so its
    // first successful response is already a completed detection snapshot.
    void detect(undefined);
  }, [detect]);

  const refresh = useCallback(
    () => detect(selectedPath),
    [detect, selectedPath]
  );

  const runInstallAction = useCallback(
    async (
      name: InstallOperation,
      task: () => Promise<void>
    ): Promise<InstallActionResult> => {
      if (requestInFlightRef.current || actionInFlightRef.current) {
        return {
          ok: false,
          problem: installProblemFromError(
            new Error('Another Install action is already in progress.')
          )
        };
      }
      actionInFlightRef.current = true;
      let actionFailure: InstallProblem | null = null;
      try {
        const completed = await run(name, task, {
          onStart: () => {
            setTransient(null);
            setActionProblem(null);
            setResetDataFailurePaths([]);
          },
          errorMessage: (caught) => {
            const problem = installProblemFromError(caught);
            actionFailure = problem;
            setActionProblem(problem);
            setResetDataFailurePaths(installFailurePaths(problem));
            return presentInstallProblem(problem, t);
          }
        });
        if (completed) return { ok: true };
        return {
          ok: false,
          problem:
            actionFailure ??
            installProblemFromError(
              new Error('Install action did not start or finish.')
            )
        };
      } finally {
        actionInFlightRef.current = false;
      }
    },
    [run, setTransient, t]
  );

  const chooseDirectory = useCallback(
    () =>
      runInstallAction('choose', async () => {
        const selection = await chooseGameDirectory();
        if (!selection.game_path) return;
        const data = await loadInstallState(selection.game_path);
        replaceData(data);
      }),
    [replaceData, runInstallAction]
  );

  const installState = pageState.phase === 'ready' ? pageState.data : null;

  const install = useCallback(
    (compatOptIn: boolean) =>
      runInstallAction('install', async () => {
        const path = requireGamePath(installState);
        replaceData(await installMod(path, compatOptIn));
        setTransient(t('installDone'));
      }),
    [installState, replaceData, runInstallAction, setTransient, t]
  );

  const resetData = useCallback(
    () =>
      runInstallAction('resetData', async () => {
        if (!installState?.has_resettable_data) {
          setTransient(t('resetDataNothingToDelete'));
          return;
        }

        const path = requireGamePath(installState);
        const result = await resetBppData(path);
        replaceData(result.state);
        setTransient(
          result.removed_data
            ? t('resetDataDone')
            : t('resetDataNothingToDelete')
        );
      }),
    [installState, replaceData, runInstallAction, setTransient, t]
  );

  const resetBepinexFolder = useCallback(
    () =>
      runInstallAction('resetBepinex', async () => {
        if (!installState?.has_bepinex_files) {
          setTransient(t('resetBepinexNothingToDelete'));
          return;
        }

        const path = requireGamePath(installState);
        const result = await resetBepinex(path);
        replaceData(result.state);
        setTransient(
          result.removed
            ? t('resetBepinexDone')
            : t('resetBepinexNothingToDelete')
        );
      }),
    [installState, replaceData, runInstallAction, setTransient, t]
  );

  const uninstall = useCallback(
    () =>
      runInstallAction('uninstall', async () => {
        const path = requireGamePath(installState);
        replaceData(await uninstallMod(path));
        setTransient(t('uninstallDone'));
      }),
    [installState, replaceData, runInstallAction, setTransient, t]
  );

  const launch = useCallback(
    () =>
      runInstallAction('launch', async () => {
        await launchGame();
      }),
    [runInstallAction]
  );

  const refreshing =
    pageState.phase === 'ready' && pageState.refresh.phase === 'refreshing';
  const status = useMemo(
    () => (installState ? createInstallStatus(installState, t) : null),
    [installState, t]
  );
  const primaryAction = useMemo(
    () =>
      installState
        ? deriveInstallPrimaryAction(installState, action, refreshing)
        : null,
    [action, installState, refreshing]
  );

  return {
    pageState,
    installState,
    status,
    primaryAction,
    action,
    actionProblem,
    busy: actionBusy || pageState.phase === 'initial-loading' || refreshing,
    refreshing,
    message: transient?.text ?? null,
    resetDataFailurePaths,
    refresh,
    chooseDirectory,
    install,
    resetData,
    resetBepinex: resetBepinexFolder,
    uninstall,
    launch
  };
}

function requireGamePath(state: InstallState | null) {
  if (!state?.selected_game_path) {
    throw new Error('Install action requires a selected game path.');
  }
  return state.selected_game_path;
}

function createInstallStatus(
  state: InstallState,
  t: ReturnType<typeof useI18n>['t']
) {
  const installed = state.mod_state.installed;
  const ready =
    installed &&
    state.mod_state.version_matches &&
    state.compat.desired === state.compat.applied;
  return {
    gameLabel: state.game.path_valid ? t('gameFilesOk') : t('gameNotFound'),
    gameTone: state.game.path_valid ? ('ok' as const) : ('warn' as const),
    modLabel: installed
      ? ready
        ? t('modReady')
        : t('modNeedsReinstall')
      : t('modNotInstalled'),
    modTone: ready ? ('ok' as const) : ('warn' as const),
    modVersion:
      state.mod_state.installed_version ??
      state.mod_state.bundled_version ??
      '-',
    steam: state.steam_path ? 'Steam' : '-'
  };
}
