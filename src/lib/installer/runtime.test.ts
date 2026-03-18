import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldConfirmSteamQuit, shouldPatchSteamLaunchOptions } from './runtime.ts';

test('shouldPatchSteamLaunchOptions returns false when Steam path is missing', () => {
  assert.equal(shouldPatchSteamLaunchOptions(null), false);
  assert.equal(shouldPatchSteamLaunchOptions(undefined), false);
  assert.equal(shouldPatchSteamLaunchOptions('   '), false);
});

test('shouldPatchSteamLaunchOptions returns true when Steam path is present', () => {
  assert.equal(shouldPatchSteamLaunchOptions('/Applications/Steam'), true);
});

test('shouldConfirmSteamQuit returns true only when patching is needed and Steam is running', () => {
  assert.equal(shouldConfirmSteamQuit({ steamPath: '/Applications/Steam', steamRunning: true }), true);
  assert.equal(shouldConfirmSteamQuit({ steamPath: '/Applications/Steam', steamRunning: false }), false);
  assert.equal(shouldConfirmSteamQuit({ steamPath: '', steamRunning: true }), false);
});
