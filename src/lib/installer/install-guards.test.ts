import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getInstallRuntimeRisks,
  shouldShowInstallRiskModal
} from './install-guards.ts';

test('getInstallRuntimeRisks only returns the Steam risk when Steam is running', () => {
  const risks = getInstallRuntimeRisks({
    hasTauriRuntime: true,
    steamLaunchOptionsSupported: true,
    steamRunning: true
  });

  assert.deepEqual(risks, ['steam_running']);
});

test('getInstallRuntimeRisks does not depend on game state', () => {
  const risks = getInstallRuntimeRisks({
    hasTauriRuntime: true,
    steamLaunchOptionsSupported: true,
    steamRunning: true
  });

  assert.deepEqual(risks, ['steam_running']);
});

test('getInstallRuntimeRisks suppresses all warnings outside Tauri', () => {
  const risks = getInstallRuntimeRisks({
    hasTauriRuntime: false,
    steamLaunchOptionsSupported: true,
    steamRunning: true
  });

  assert.deepEqual(risks, []);
});

test('getInstallRuntimeRisks ignores Steam when launch option updates are unsupported', () => {
  const risks = getInstallRuntimeRisks({
    hasTauriRuntime: true,
    steamLaunchOptionsSupported: false,
    steamRunning: true
  });

  assert.deepEqual(risks, []);
});

test('shouldShowInstallRiskModal returns true when any runtime risk is present', () => {
  const shouldShow = shouldShowInstallRiskModal(['steam_running']);

  assert.equal(shouldShow, true);
});

test('shouldShowInstallRiskModal returns false when there are no runtime risks', () => {
  const shouldShow = shouldShowInstallRiskModal([]);

  assert.equal(shouldShow, false);
});
