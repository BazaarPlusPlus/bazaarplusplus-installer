import test from 'node:test';
import assert from 'node:assert/strict';

import {
  activateObservedIdentity,
  loadInstallIdentitySnapshot,
  loginInstallIdentity,
  logoutInstallIdentity
} from './identity-flow.ts';

test('loadInstallIdentitySnapshot maps the local identity payload', async () => {
  const snapshot = await loadInstallIdentitySnapshot(
    {
      loadLocalIdentity: async () => ({
        observation: {
          player_account_id: 'player-1',
          player_username: 'Tester',
          observed_at_utc: '2026-04-12T00:00:00Z'
        },
        auth: {
          token: 'token-1',
          player_account_id: 'player-1',
          player_username: 'Tester',
          issued_at_utc: '2026-04-12T00:00:00Z'
        }
      })
    } as never,
    'C:\\Games\\The Bazaar'
  );

  assert.equal(snapshot.playerObservation?.player_username, 'Tester');
  assert.equal(snapshot.authRecord?.token, 'token-1');
});

test('activateObservedIdentity persists then reloads identity state', async () => {
  let activated = false;

  const result = await activateObservedIdentity({
    identityApi: {
      activateObservedAccount: async () => {
        activated = true;
        return {
          token: 'token-1',
          player_account_id: 'player-1',
          player_username: 'Tester',
          issued_at_utc: '2026-04-12T00:00:00Z'
        };
      },
      loadLocalIdentity: async () => ({
        observation: {
          player_account_id: 'player-1',
          player_username: 'Tester',
          observed_at_utc: '2026-04-12T00:00:00Z'
        },
        auth: {
          token: 'token-1',
          player_account_id: 'player-1',
          player_username: 'Tester',
          issued_at_utc: '2026-04-12T00:00:00Z'
        }
      })
    } as never,
    gameRoot: 'C:\\Games\\The Bazaar',
    observation: {
      player_account_id: 'player-1',
      player_username: 'Tester',
      observed_at_utc: '2026-04-12T00:00:00Z'
    },
    password: 'secret',
    successMessage: 'ok'
  });

  assert.equal(activated, true);
  assert.equal(result.successMessage, 'ok');
  assert.equal(result.snapshot.authRecord?.token, 'token-1');
});

test('loginInstallIdentity reuses the same snapshot reload path', async () => {
  let loggedIn = false;

  const result = await loginInstallIdentity({
    identityApi: {
      loginIdentity: async () => {
        loggedIn = true;
        return {
          token: 'token-1',
          player_account_id: 'player-1',
          player_username: 'Tester',
          issued_at_utc: '2026-04-12T00:00:00Z'
        };
      },
      loadLocalIdentity: async () => ({
        observation: {
          player_account_id: 'player-1',
          player_username: 'Tester',
          observed_at_utc: '2026-04-12T00:00:00Z'
        },
        auth: {
          token: 'token-1',
          player_account_id: 'player-1',
          player_username: 'Tester',
          issued_at_utc: '2026-04-12T00:00:00Z'
        }
      })
    } as never,
    gameRoot: 'C:\\Games\\The Bazaar',
    playerUsername: 'Tester',
    password: 'secret',
    successMessage: 'logged'
  });

  assert.equal(loggedIn, true);
  assert.equal(result.successMessage, 'logged');
});

test('logoutInstallIdentity returns the local-only message when remote logout fails', async () => {
  const result = await logoutInstallIdentity({
    identityApi: {
      logoutIdentity: async () => ({
        remoteLoggedOut: false
      }),
      loadLocalIdentity: async () => ({
        observation: {
          player_account_id: 'player-1',
          player_username: 'Tester',
          observed_at_utc: '2026-04-12T00:00:00Z'
        },
        auth: null
      })
    } as never,
    gameRoot: 'C:\\Games\\The Bazaar',
    auth: {
      token: 'token-1',
      player_account_id: 'player-1',
      player_username: 'Tester',
      issued_at_utc: '2026-04-12T00:00:00Z'
    },
    successMessage: 'remote',
    localOnlySuccessMessage: 'local'
  });

  assert.equal(result.successMessage, 'local');
  assert.equal(result.snapshot.authRecord, null);
});
