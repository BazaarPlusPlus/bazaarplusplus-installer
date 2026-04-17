import { test, expect } from 'vitest';

import { selectInstallGates } from './install-gates.ts';

test('selectInstallGates trims custom paths and exposes install state', () => {
  const selection = selectInstallGates({
    env: {
      steam_path: 'C:\\Program Files (x86)\\Steam',
      steam_launch_options_supported: true,
      game_path: 'C:\\Games\\The Bazaar',
      dotnet_version: '9.0.1',
      dotnet_ok: true,
      bepinex_installed: true,
      bpp_version: '3.0.0',
      bundled_bpp_version: '3.1.0',
      bpp_data_version: '1',
      bpp_data_reset_required: false,
      bpp_data_issue: null
    },
    bazaarFound: true,
    customGamePath: '  D:\\Bazaar Custom  ',
    actionBusy: 'idle',
    isDebugInstallPreview: false
  });

  expect(selection.selectedPath).toBe('D:\\Bazaar Custom');
  expect(selection.modInstalled).toBe(true);
  expect(selection.hasPath).toBe(true);
  expect(selection.canInstall).toBe(true);
  expect(selection.canLaunchGame).toBe(true);
  expect(selection.versionMismatch).toBe(true);
});

test('selectInstallGates reports no path when neither detected nor custom paths exist', () => {
  const selection = selectInstallGates({
    env: null,
    bazaarFound: false,
    customGamePath: '   ',
    actionBusy: 'idle',
    isDebugInstallPreview: false
  });

  expect(selection.selectedPath).toBe(null);
  expect(selection.hasPath).toBe(false);
  expect(selection.pageState.effectiveGamePath).toBe('');
  expect(selection.canInstall).toBe(false);
  expect(selection.canLaunchGame).toBe(false);
});

test('selectInstallGates reflects busy actions through pageState', () => {
  const selection = selectInstallGates({
    env: {
      steam_path: 'C:\\Program Files (x86)\\Steam',
      steam_launch_options_supported: true,
      game_path: 'C:\\Games\\The Bazaar',
      dotnet_version: '9.0.1',
      dotnet_ok: true,
      bepinex_installed: false,
      bpp_version: null,
      bundled_bpp_version: '3.1.0',
      bpp_data_version: '1',
      bpp_data_reset_required: false,
      bpp_data_issue: null
    },
    bazaarFound: true,
    customGamePath: '',
    actionBusy: 'install',
    isDebugInstallPreview: false
  });

  expect(selection.isBusy).toBe(true);
  expect(selection.canInstall).toBe(false);
  expect(selection.canLaunchGame).toBe(false);
});
