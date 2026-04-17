import test from 'node:test';
import assert from 'node:assert/strict';

import { selectIdentityGates } from './identity-gates.ts';

test('selectIdentityGates blocks login when required fields are missing', () => {
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
    identityConfirmed: false
  });

  assert.equal(selection.identityBusy, false);
  assert.equal(selection.canLoginIdentity, false);
});

test('selectIdentityGates blocks login while busy', () => {
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
    identityConfirmed: true
  });

  assert.equal(selection.identityBusy, true);
  assert.equal(selection.canLoginIdentity, false);
});

test('selectIdentityGates allows login for both activation and relogin states', () => {
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
    identityConfirmed: true
  });

  assert.equal(activate.canLoginIdentity, true);
  assert.equal(relogin.canLoginIdentity, true);
});
