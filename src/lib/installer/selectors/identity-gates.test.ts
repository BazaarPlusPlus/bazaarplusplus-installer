import test from 'node:test';
import assert from 'node:assert/strict';

import { selectIdentityGates } from './identity-gates.ts';

const pageState = {
  hasPath: true,
  isBusy: false,
  canInstall: true,
  canLaunchGame: true,
  versionMismatch: false,
  effectiveGamePath: 'C:\\Games\\The Bazaar'
} as const;

test('selectIdentityGates blocks activation and login when fields are missing', () => {
  const selection = selectIdentityGates({
    identityState: {
      kind: 'login_or_register',
      auth: null,
      observation: {
        player_account_id: 'player-1',
        player_username: 'Tester',
        observed_at_utc: '2026-04-12T00:00:00Z'
      }
    },
    pageState,
    identityLoadState: 'idle',
    identityActionBusy: 'idle',
    identityPassword: ''
  });

  assert.equal(selection.identityBusy, false);
  assert.equal(selection.canContinueIdentity, false);
});

test('selectIdentityGates blocks actions while busy', () => {
  const selection = selectIdentityGates({
    identityState: {
      kind: 'login_or_register',
      auth: null,
      observation: {
        player_account_id: 'player-1',
        player_username: 'Tester',
        observed_at_utc: '2026-04-12T00:00:00Z'
      }
    },
    pageState,
    identityLoadState: 'loading',
    identityActionBusy: 'idle',
    identityPassword: 'secret'
  });

  assert.equal(selection.identityBusy, true);
  assert.equal(selection.canContinueIdentity, false);
});

test('selectIdentityGates allows continue when password is present', () => {
  const selection = selectIdentityGates({
    identityState: {
      kind: 'login_or_register',
      auth: null,
      observation: {
        player_account_id: 'player-1',
        player_username: 'Tester',
        observed_at_utc: '2026-04-12T00:00:00Z'
      }
    },
    pageState,
    identityLoadState: 'idle',
    identityActionBusy: 'idle',
    identityPassword: 'secret'
  });

  assert.equal(selection.canContinueIdentity, true);
  assert.equal(selection.canLogoutIdentity, false);
});

test('selectIdentityGates exposes logout only for signed-in states', () => {
  const selection = selectIdentityGates({
    identityState: {
      kind: 'account_mismatch',
      auth: {
        token: 'token-1',
        player_account_id: 'player-1',
        player_username: 'Tester',
        issued_at_utc: '2026-04-12T00:00:00Z'
      },
      observation: {
        player_account_id: 'player-2',
        player_username: 'OtherTester',
        observed_at_utc: '2026-04-12T00:00:00Z'
      }
    },
    pageState,
    identityLoadState: 'idle',
    identityActionBusy: 'idle',
    identityPassword: ''
  });

  assert.equal(selection.canLogoutIdentity, true);
});
