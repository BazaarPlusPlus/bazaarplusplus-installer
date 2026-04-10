import test from 'node:test';
import assert from 'node:assert/strict';

import { createIdentityState } from './state.ts';

test('no observation blocks first activation', () => {
  const state = createIdentityState({
    observation: null,
    installation: null,
    hasInstallationPrivateKey: false
  });

  assert.equal(state.kind, 'observation_required');
});

test('observation enables first activation', () => {
  const state = createIdentityState({
    observation: {
      player_account_id: 'player-account-001',
      player_username: 'player-one',
      observed_at_utc: '2026-04-11T01:00:00.000Z'
    },
    installation: null,
    hasInstallationPrivateKey: false
  });

  assert.equal(state.kind, 'activate_first_account');
  assert.equal(state.observation.player_username, 'player-one');
});

test('logged-in user with changed observation requires re-login', () => {
  const state = createIdentityState({
    observation: {
      player_account_id: 'player-account-002',
      player_username: 'player-two',
      observed_at_utc: '2026-04-11T01:00:00.000Z'
    },
    installation: {
      installation_id: 'inst_001',
      player_account_id: 'player-account-001',
      api_base_url: 'https://mod-api-v3.bazaarplusplus.com',
      public_key: {
        modulus_b64: 'modulus',
        exponent_b64: 'AQAB'
      },
      status: 'active',
      created_at_utc: '2026-04-10T01:00:00.000Z'
    },
    hasInstallationPrivateKey: true
  });

  assert.equal(state.kind, 'relogin_required');
});

test('logged-in user with no new observation can still view profile', () => {
  const state = createIdentityState({
    observation: null,
    installation: {
      installation_id: 'inst_001',
      player_account_id: 'player-account-001',
      api_base_url: 'https://mod-api-v3.bazaarplusplus.com',
      public_key: {
        modulus_b64: 'modulus',
        exponent_b64: 'AQAB'
      },
      status: 'active',
      created_at_utc: '2026-04-10T01:00:00.000Z'
    },
    hasInstallationPrivateKey: true
  });

  assert.equal(state.kind, 'ready');
  assert.equal(state.installation.player_account_id, 'player-account-001');
});
