import test from 'node:test';
import assert from 'node:assert/strict';

import { selectIdentityGates } from './identity-gates.ts';

test('selectIdentityGates treats blank passwords as matching but not actionable', () => {
  const selection = selectIdentityGates({
    identityState: {
      kind: 'activate_first_account',
      installation: null,
      observation: {
        player_account_id: 'player-1',
        player_username: 'Tester',
        observed_at_utc: '2026-04-12T00:00:00Z'
      }
    },
    pageState: {
      hasPath: true,
      isBusy: false,
      canInstall: true,
      canLaunchGame: true,
      versionMismatch: false,
      effectiveGamePath: 'C:\\Games\\The Bazaar'
    },
    playerObservationPresent: true,
    identityLoadState: 'idle',
    identityActionBusy: 'idle',
    identityPassword: '',
    identityPasswordConfirm: '',
    identityConfirmed: false
  });

  assert.equal(selection.activationPasswordMatches, true);
  assert.equal(selection.identityBusy, false);
  assert.equal(selection.canActivateObservedAccount, false);
  assert.equal(selection.canLoginIdentity, false);
});

test('selectIdentityGates blocks activation on mismatched passwords and busy state', () => {
  const selection = selectIdentityGates({
    identityState: {
      kind: 'activate_first_account',
      installation: null,
      observation: {
        player_account_id: 'player-1',
        player_username: 'Tester',
        observed_at_utc: '2026-04-12T00:00:00Z'
      }
    },
    pageState: {
      hasPath: true,
      isBusy: false,
      canInstall: true,
      canLaunchGame: true,
      versionMismatch: false,
      effectiveGamePath: 'C:\\Games\\The Bazaar'
    },
    playerObservationPresent: true,
    identityLoadState: 'loading',
    identityActionBusy: 'idle',
    identityPassword: 'secret',
    identityPasswordConfirm: 'mismatch',
    identityConfirmed: true
  });

  assert.equal(selection.activationPasswordMatches, false);
  assert.equal(selection.identityBusy, true);
  assert.equal(selection.canActivateObservedAccount, false);
  assert.equal(selection.canLoginIdentity, false);
});

test('selectIdentityGates preserves current login and activation rules', () => {
  const activate = selectIdentityGates({
    identityState: {
      kind: 'activate_first_account',
      installation: null,
      observation: {
        player_account_id: 'player-1',
        player_username: 'Tester',
        observed_at_utc: '2026-04-12T00:00:00Z'
      }
    },
    pageState: {
      hasPath: true,
      isBusy: false,
      canInstall: true,
      canLaunchGame: true,
      versionMismatch: false,
      effectiveGamePath: 'C:\\Games\\The Bazaar'
    },
    playerObservationPresent: true,
    identityLoadState: 'idle',
    identityActionBusy: 'idle',
    identityPassword: 'secret',
    identityPasswordConfirm: 'secret',
    identityConfirmed: true
  });
  const relogin = selectIdentityGates({
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
    pageState: {
      hasPath: true,
      isBusy: false,
      canInstall: true,
      canLaunchGame: true,
      versionMismatch: false,
      effectiveGamePath: 'C:\\Games\\The Bazaar'
    },
    playerObservationPresent: true,
    identityLoadState: 'idle',
    identityActionBusy: 'idle',
    identityPassword: 'secret',
    identityPasswordConfirm: '',
    identityConfirmed: true
  });

  assert.equal(activate.canActivateObservedAccount, true);
  assert.equal(activate.canLoginIdentity, true);
  assert.equal(relogin.canActivateObservedAccount, false);
  assert.equal(relogin.canLoginIdentity, true);
});
