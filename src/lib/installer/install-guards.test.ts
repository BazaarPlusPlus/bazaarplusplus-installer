import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveInstallConfirmationStep,
  resolveInstallContinuationAction
} from './install-guards.ts';

test('resolveInstallConfirmationStep prioritizes closing the game before Steam', () => {
  const step = resolveInstallConfirmationStep({
    hasTauriRuntime: true,
    gameRunning: true,
    steamLaunchOptionsSupported: true,
    steamRunning: true
  });

  assert.equal(step, 'confirm_game_quit');
});

test('resolveInstallConfirmationStep falls back to Steam confirmation when the game is closed', () => {
  const step = resolveInstallConfirmationStep({
    hasTauriRuntime: true,
    gameRunning: false,
    steamLaunchOptionsSupported: true,
    steamRunning: true
  });

  assert.equal(step, 'confirm_steam_quit');
});

test('resolveInstallConfirmationStep proceeds immediately outside Tauri', () => {
  const step = resolveInstallConfirmationStep({
    hasTauriRuntime: false,
    gameRunning: true,
    steamLaunchOptionsSupported: true,
    steamRunning: true
  });

  assert.equal(step, 'proceed');
});

test('resolveInstallContinuationAction shows the game quit modal before Steam confirmation', () => {
  const action = resolveInstallContinuationAction('confirm_game_quit');

  assert.equal(action, 'show_game_quit_modal');
});

test('resolveInstallContinuationAction shows the Steam quit modal after the game is closed', () => {
  const action = resolveInstallContinuationAction('confirm_steam_quit');

  assert.equal(action, 'show_steam_quit_modal');
});

test('resolveInstallContinuationAction installs immediately when no confirmation is needed', () => {
  const action = resolveInstallContinuationAction('proceed');

  assert.equal(action, 'install');
});
