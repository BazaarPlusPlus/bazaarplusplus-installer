import { describe, expect, it } from 'vitest';
import type { InstallState } from '../../types/backend';
import { createUiProblem } from '../shared/problems';
import {
  deriveInstallPrimaryAction,
  initialInstallPageState,
  reduceInstallPageState
} from './installPageState';

function installState(overrides: Partial<InstallState> = {}): InstallState {
  return {
    selected_game_path: '/Applications/The Bazaar',
    steam_path: '/Applications/Steam',
    steam_launch_options_supported: true,
    game: { found: true, path_valid: true, display_version: null },
    mod_state: {
      installed: false,
      installed_version: null,
      bundled_version: '4.5.0',
      version_matches: false
    },
    compat: {
      mode_available: true,
      forced: false,
      desired: false,
      applied: false
    },
    actions: {
      can_install: true,
      can_reinstall: false,
      can_reset_data: false,
      can_reset_bepinex: false,
      can_uninstall: false,
      can_launch: true
    },
    has_resettable_data: false,
    has_bepinex_files: false,
    warnings: [],
    ...overrides
  };
}

describe('Install detection page state', () => {
  it('stays in explicit initial detection until a native result completes', () => {
    expect(initialInstallPageState).toEqual({
      phase: 'initial-loading',
      requestId: 0
    });

    expect(
      reduceInstallPageState(initialInstallPageState, {
        type: 'request-started',
        requestId: 1
      })
    ).toEqual({ phase: 'initial-loading', requestId: 1 });

    expect(
      reduceInstallPageState(
        { phase: 'initial-loading', requestId: 1 },
        { type: 'request-succeeded', requestId: 1, data: installState() }
      )
    ).toMatchObject({ phase: 'ready', refresh: { phase: 'idle' } });
  });

  it('retains the last valid detection through refresh failure and recovery', () => {
    const data = installState();
    const problem = createUiProblem('install_detection_failed', {
      params: { operation: 'detect_state' },
      diagnostic: 'probe failed'
    });
    const ready = reduceInstallPageState(
      { phase: 'initial-loading', requestId: 1 },
      { type: 'request-succeeded', requestId: 1, data }
    );
    const refreshing = reduceInstallPageState(ready, {
      type: 'request-started',
      requestId: 2
    });
    const failed = reduceInstallPageState(refreshing, {
      type: 'request-failed',
      requestId: 2,
      problem
    });

    expect(failed).toMatchObject({
      phase: 'ready',
      data,
      refresh: { phase: 'failed', problem }
    });
    const retrying = reduceInstallPageState(failed, {
      type: 'request-started',
      requestId: 3
    });
    expect(retrying).toMatchObject({
      phase: 'ready',
      data,
      refresh: { phase: 'refreshing' }
    });
    expect(
      reduceInstallPageState(retrying, {
        type: 'request-succeeded',
        requestId: 3,
        data
      })
    ).toMatchObject({ phase: 'ready', refresh: { phase: 'idle' } });
  });
});

describe('Install primary action', () => {
  it.each([
    {
      name: 'invalid or missing path',
      state: installState({
        selected_game_path: null,
        game: { found: false, path_valid: false, display_version: null },
        actions: {
          can_install: false,
          can_reinstall: false,
          can_reset_data: false,
          can_reset_bepinex: false,
          can_uninstall: false,
          can_launch: false
        }
      }),
      mode: 'choose-directory',
      operation: 'choose'
    },
    {
      name: 'valid path without the mod',
      state: installState(),
      mode: 'install',
      operation: 'install'
    },
    {
      name: 'installed version mismatch',
      state: installState({
        mod_state: {
          installed: true,
          installed_version: '4.4.0',
          bundled_version: '4.5.0',
          version_matches: false
        },
        actions: {
          can_install: false,
          can_reinstall: true,
          can_reset_data: false,
          can_reset_bepinex: true,
          can_uninstall: true,
          can_launch: true
        }
      }),
      mode: 'repair',
      operation: 'install'
    },
    {
      name: 'compatibility mode drift',
      state: installState({
        mod_state: {
          installed: true,
          installed_version: '4.5.0',
          bundled_version: '4.5.0',
          version_matches: true
        },
        compat: {
          mode_available: false,
          forced: true,
          desired: true,
          applied: false
        },
        actions: {
          can_install: false,
          can_reinstall: true,
          can_reset_data: false,
          can_reset_bepinex: true,
          can_uninstall: true,
          can_launch: true
        }
      }),
      mode: 'repair',
      operation: 'install'
    },
    {
      name: 'current installed state',
      state: installState({
        mod_state: {
          installed: true,
          installed_version: '4.5.0',
          bundled_version: '4.5.0',
          version_matches: true
        },
        actions: {
          can_install: false,
          can_reinstall: true,
          can_reset_data: false,
          can_reset_bepinex: true,
          can_uninstall: true,
          can_launch: true
        }
      }),
      mode: 'launch',
      operation: 'launch'
    }
  ])('selects exactly one action for $name', ({ state, mode, operation }) => {
    expect(deriveInstallPrimaryAction(state, null, false)).toMatchObject({
      mode,
      operation,
      disabled: false,
      running: false
    });
  });

  it('derives visibility, disabled state, and loading from one operation model', () => {
    expect(
      deriveInstallPrimaryAction(installState(), 'install', false)
    ).toEqual({
      mode: 'install',
      operation: 'install',
      disabled: true,
      running: true
    });
    expect(deriveInstallPrimaryAction(installState(), null, true)).toEqual({
      mode: 'install',
      operation: 'install',
      disabled: true,
      running: false
    });
  });
});
