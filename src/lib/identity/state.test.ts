import { test, expect } from 'vitest';

import { createIdentityState } from './state.ts';

test('no observation blocks sign-in onboarding', () => {
  const state = createIdentityState({
    observation: null,
    auth: null
  });

  expect(state.kind).toBe('observation_required');
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

  expect(state.kind).toBe('login_or_register');
  if (state.kind !== 'login_or_register') {
    throw new Error(`Unexpected identity state: ${state.kind}`);
  }
  expect(state.observation.player_username).toBe('player-one');
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

  expect(state.kind).toBe('account_mismatch');
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

  expect(state.kind).toBe('ready');
  if (state.kind !== 'ready') {
    throw new Error(`Unexpected identity state: ${state.kind}`);
  }
  expect(state.auth.player_account_id).toBe('player-account-001');
});
