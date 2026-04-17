import test from 'node:test';
import assert from 'node:assert/strict';

import { createIdentityState } from './state.ts';

test('no observation blocks sign-in onboarding', () => {
  const state = createIdentityState({
    observation: null,
    auth: null
  });

  assert.equal(state.kind, 'observation_required');
});

test('observation with no auth opens login or register flow', () => {
  const state = createIdentityState({
    observation: {
      player_account_id: 'player-account-001',
      player_username: 'player-one',
      observed_at_utc: '2026-04-11T01:00:00.000Z'
    },
    auth: null
  });

  assert.equal(state.kind, 'login_or_register');
  assert.equal(state.observation.player_username, 'player-one');
});

test('signed-in user with changed observation requires logout and relogin', () => {
  const state = createIdentityState({
    observation: {
      player_account_id: 'player-account-002',
      player_username: 'player-two',
      observed_at_utc: '2026-04-11T01:00:00.000Z'
    },
    auth: {
      token: 'token-001',
      player_account_id: 'player-account-001',
      player_username: 'player-one',
      issued_at_utc: '2026-04-10T01:00:00.000Z'
    }
  });

  assert.equal(state.kind, 'account_mismatch');
});

test('signed-in user with no observation can still view profile', () => {
  const state = createIdentityState({
    observation: null,
    auth: {
      token: 'token-001',
      player_account_id: 'player-account-001',
      player_username: 'player-one',
      issued_at_utc: '2026-04-10T01:00:00.000Z'
    }
  });

  assert.equal(state.kind, 'ready');
  assert.equal(state.auth.player_account_id, 'player-account-001');
});
