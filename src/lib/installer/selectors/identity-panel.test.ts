import test from 'node:test';
import assert from 'node:assert/strict';

import { selectIdentityPanel } from './identity-panel.ts';
import type { LocalizedText } from './types.ts';

const localized: LocalizedText = (zh, en) => en || zh;

test('selectIdentityPanel describes the observation-required state', () => {
  const selection = selectIdentityPanel({
    identityState: {
      kind: 'observation_required',
      installation: null,
      observation: null
    },
    identityLoadState: 'idle',
    localized
  });

  assert.equal(selection.title, 'No game account detected');
  assert.equal(selection.summary, 'Launch the game once to complete account detection.');
});

test('selectIdentityPanel describes activation and relogin states', () => {
  const activate = selectIdentityPanel({
    identityState: {
      kind: 'activate_first_account',
      installation: null,
      observation: {
        player_account_id: 'player-1',
        player_username: 'Tester',
        observed_at_utc: '2026-04-12T00:00:00Z'
      }
    },
    identityLoadState: 'idle',
    localized
  });
  const relogin = selectIdentityPanel({
    identityState: {
      kind: 'relogin_required',
      installation: {
        installation_id: 'install-1',
        player_account_id: 'player-1',
        api_base_url: 'https://mod-api-v3.bazaarplusplus.com',
        public_key: { modulus_b64: 'n', exponent_b64: 'AQAB' },
        status: 'active',
        created_at_utc: '2026-04-12T00:00:00Z'
      },
      observation: {
        player_account_id: 'player-2',
        player_username: 'OtherTester',
        observed_at_utc: '2026-04-12T00:00:00Z'
      }
    },
    identityLoadState: 'idle',
    localized
  });

  assert.equal(activate.title, 'Identity verification required');
  assert.match(activate.summary, /Current account: Tester/);
  assert.match(activate.summary, /create local credentials for this machine/);
  assert.equal(relogin.title, 'Reconnect current account');
  assert.match(relogin.summary, /Current account: OtherTester/);
  assert.match(relogin.summary, /refresh the local credentials on this machine/);
});

test('selectIdentityPanel prefers loading summary over ready summary', () => {
  const loading = selectIdentityPanel({
    identityState: {
      kind: 'ready',
      installation: {
        installation_id: 'install-1',
        player_account_id: 'player-1',
        api_base_url: 'https://mod-api-v3.bazaarplusplus.com',
        public_key: { modulus_b64: 'n', exponent_b64: 'AQAB' },
        status: 'active',
        created_at_utc: '2026-04-12T00:00:00Z'
      },
      observation: null
    },
    identityLoadState: 'loading',
    localized
  });

  assert.equal(loading.title, 'Account connected');
  assert.equal(loading.summary, 'Reading account status...');
});
