import test from 'node:test';
import assert from 'node:assert/strict';

import { selectSteamModal } from './steam-modal.ts';
import type { TranslateText } from './types.ts';

const t: TranslateText = (key) => String(key);

test('selectSteamModal uses install-specific copy for install actions', () => {
  const selection = selectSteamModal({
    pendingSteamAction: 'install',
    t
  });

  assert.equal(selection.title, 'installRiskTitle');
  assert.equal(
    selection.body,
    'installRiskSteamDetected\n\ninstallRiskBody'
  );
  assert.equal(selection.cancelText, 'actionContinueInstall');
});

test('selectSteamModal falls back to steam quit copy for uninstall and null', () => {
  const uninstall = selectSteamModal({
    pendingSteamAction: 'uninstall',
    t
  });
  const none = selectSteamModal({
    pendingSteamAction: null,
    t
  });

  assert.equal(uninstall.title, 'steamQuitTitle');
  assert.equal(uninstall.body, 'steamQuitBody');
  assert.equal(uninstall.cancelText, 'actionClose');
  assert.deepEqual(none, uninstall);
});
