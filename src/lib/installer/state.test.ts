import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPageState,
  selectCustomGamePath,
  selectEffectiveGamePath
} from './state.ts';

test('selectCustomGamePath trims and returns null for empty strings', () => {
  assert.equal(selectCustomGamePath('   '), null);
  assert.equal(selectCustomGamePath('  C:\\Games\\The Bazaar  '), 'C:\\Games\\The Bazaar');
});

test('selectEffectiveGamePath prefers custom path over detected path', () => {
  assert.equal(
    selectEffectiveGamePath('D:\\Custom\\Bazaar', 'C:\\Detected\\Bazaar'),
    'D:\\Custom\\Bazaar'
  );
});

test('selectEffectiveGamePath falls back to detected path', () => {
  assert.equal(selectEffectiveGamePath(null, 'C:\\Detected\\Bazaar'), 'C:\\Detected\\Bazaar');
  assert.equal(selectEffectiveGamePath(null, null), '');
});

test('createPageState computes install prerequisites and version mismatch', () => {
  const state = createPageState({
    actionBusy: 'idle',
    dotnetState: 'found',
    bazaarFound: true,
    selectedGamePath: 'C:\\Games\\The Bazaar',
    detectedGamePath: null,
    isDebugInstallPreview: false,
    bundledBppVersion: '1.2.0',
    installedBppVersion: '1.1.0'
  });

  assert.equal(state.hasPath, true);
  assert.equal(state.isBusy, false);
  assert.equal(state.installPrereqsMet, true);
  assert.equal(state.canInstall, true);
  assert.equal(state.canLaunchGame, true);
  assert.equal(state.versionMismatch, true);
});

test('createPageState allows install during debug preview without prerequisites', () => {
  const state = createPageState({
    actionBusy: 'idle',
    dotnetState: 'idle',
    bazaarFound: false,
    selectedGamePath: null,
    detectedGamePath: null,
    isDebugInstallPreview: true,
    bundledBppVersion: null,
    installedBppVersion: null
  });

  assert.equal(state.installPrereqsMet, false);
  assert.equal(state.canInstall, true);
  assert.equal(state.canLaunchGame, false);
});

test('createPageState allows install when dotnet runtime is missing but game path is valid', () => {
  const state = createPageState({
    actionBusy: 'idle',
    dotnetState: 'not_found',
    bazaarFound: true,
    selectedGamePath: 'C:\\Games\\The Bazaar',
    detectedGamePath: null,
    isDebugInstallPreview: false,
    bundledBppVersion: '1.2.0',
    installedBppVersion: null
  });

  assert.equal(state.installPrereqsMet, true);
  assert.equal(state.canInstall, true);
  assert.equal(state.canLaunchGame, true);
});

test('createPageState does not block install while dotnet status is idle when game path is valid', () => {
  const state = createPageState({
    actionBusy: 'idle',
    dotnetState: 'idle',
    bazaarFound: true,
    selectedGamePath: 'C:\\Games\\The Bazaar',
    detectedGamePath: null,
    isDebugInstallPreview: false,
    bundledBppVersion: '1.2.0',
    installedBppVersion: null
  });

  assert.equal(state.installPrereqsMet, true);
  assert.equal(state.canInstall, true);
  assert.equal(state.canLaunchGame, true);
});
