import type { InstallState } from '../../types/backend';
import type { PageRefreshState } from '../shared/pageState';
import type { InstallProblem } from './installProblems';

export type InstallPageState =
  | { phase: 'initial-loading'; requestId: number }
  | {
      phase: 'blocking-failure';
      requestId: number;
      problem: InstallProblem;
    }
  | {
      phase: 'ready';
      requestId: number;
      data: InstallState;
      refresh: PageRefreshState<InstallProblem>;
    };

export type InstallPageEvent =
  | { type: 'request-started'; requestId: number }
  | { type: 'request-succeeded'; requestId: number; data: InstallState }
  | {
      type: 'request-failed';
      requestId: number;
      problem: InstallProblem;
    }
  | { type: 'data-replaced'; data: InstallState };

export const initialInstallPageState: InstallPageState = {
  phase: 'initial-loading',
  requestId: 0
};

export function reduceInstallPageState(
  state: InstallPageState,
  event: InstallPageEvent
): InstallPageState {
  switch (event.type) {
    case 'request-started':
      if (state.phase === 'ready') {
        return {
          ...state,
          requestId: event.requestId,
          refresh: { phase: 'refreshing' }
        };
      }
      return { phase: 'initial-loading', requestId: event.requestId };
    case 'request-succeeded':
      if (state.requestId !== event.requestId) return state;
      return {
        phase: 'ready',
        requestId: event.requestId,
        data: event.data,
        refresh: { phase: 'idle' }
      };
    case 'request-failed':
      if (state.requestId !== event.requestId) return state;
      if (state.phase === 'ready') {
        return {
          ...state,
          refresh: { phase: 'failed', problem: event.problem }
        };
      }
      return {
        phase: 'blocking-failure',
        requestId: event.requestId,
        problem: event.problem
      };
    case 'data-replaced':
      if (state.phase !== 'ready') return state;
      return { ...state, data: event.data, refresh: { phase: 'idle' } };
  }
}

export type InstallOperation =
  | 'choose'
  | 'install'
  | 'resetData'
  | 'resetBepinex'
  | 'uninstall'
  | 'launch';

export type InstallPrimaryActionMode =
  | 'choose-directory'
  | 'install'
  | 'repair'
  | 'launch';

export type InstallPrimaryAction = {
  mode: InstallPrimaryActionMode;
  operation: Extract<InstallOperation, 'choose' | 'install' | 'launch'>;
  disabled: boolean;
  running: boolean;
};

export function deriveInstallPrimaryAction(
  state: InstallState,
  current: InstallOperation | null,
  refreshing: boolean
): InstallPrimaryAction {
  let mode: InstallPrimaryActionMode;
  let operation: InstallPrimaryAction['operation'];
  let allowed: boolean;

  if (!state.selected_game_path || !state.game.path_valid) {
    mode = 'choose-directory';
    operation = 'choose';
    allowed = true;
  } else if (!state.mod_state.installed) {
    mode = 'install';
    operation = 'install';
    allowed = state.actions.can_install;
  } else if (
    !state.mod_state.version_matches ||
    state.compat.desired !== state.compat.applied
  ) {
    mode = 'repair';
    operation = 'install';
    allowed = state.actions.can_reinstall;
  } else {
    mode = 'launch';
    operation = 'launch';
    allowed = state.actions.can_launch;
  }

  return {
    mode,
    operation,
    disabled: refreshing || current !== null || !allowed,
    running: current === operation
  };
}
