import test from 'node:test';
import assert from 'node:assert/strict';

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

  assert.equal(selection.selectedPath, 'D:\\Bazaar Custom');
  assert.equal(selection.modInstalled, true);
  assert.equal(selection.hasPath, true);
  assert.equal(selection.canInstall, true);
  assert.equal(selection.canLaunchGame, true);
  assert.equal(selection.versionMismatch, true);
});

test('selectInstallGates reports no path when neither detected nor custom paths exist', () => {
  const selection = selectInstallGates({
    env: null,
    bazaarFound: false,
    customGamePath: '   ',
    actionBusy: 'idle',
    isDebugInstallPreview: false
  });

  assert.equal(selection.selectedPath, null);
  assert.equal(selection.hasPath, false);
  assert.equal(selection.pageState.effectiveGamePath, '');
  assert.equal(selection.canInstall, false);
  assert.equal(selection.canLaunchGame, false);
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

  assert.equal(selection.isBusy, true);
  assert.equal(selection.canInstall, false);
  assert.equal(selection.canLaunchGame, false);
});
