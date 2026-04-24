import { test, expect } from 'vitest';

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

  expect(snapshot.playerObservation?.player_username).toBe('Tester');
  expect(snapshot.authRecord?.token).toBe('token-1');
});

test('activateObservedIdentity builds the next snapshot without reloading from disk', async () => {
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
      }
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

  expect(activated).toBe(true);
  expect(result.successMessage).toBe('ok');
  expect(result.snapshot.authRecord?.token).toBe('token-1');
  expect(result.snapshot.playerObservation?.player_username).toBe('Tester');
});

test('loginInstallIdentity builds the next snapshot from the returned auth', async () => {
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
      }
    } as never,
    gameRoot: 'C:\\Games\\The Bazaar',
    playerUsername: 'Tester',
    observation: {
      player_account_id: 'player-1',
      player_username: 'Tester',
      observed_at_utc: '2026-04-12T00:00:00Z'
    },
    password: 'secret',
    successMessage: 'logged'
  });

  expect(loggedIn).toBe(true);
  expect(result.successMessage).toBe('logged');
  expect(result.snapshot.authRecord?.token).toBe('token-1');
  expect(result.snapshot.playerObservation?.player_username).toBe('Tester');
});

test('logoutInstallIdentity clears auth without reloading from disk', async () => {
  const result = await logoutInstallIdentity({
    identityApi: {
      logoutIdentity: async () => ({
        remoteLoggedOut: false
      })
    } as never,
    gameRoot: 'C:\\Games\\The Bazaar',
    playerObservation: {
      player_account_id: 'player-1',
      player_username: 'Tester',
      observed_at_utc: '2026-04-12T00:00:00Z'
    },
    auth: {
      token: 'token-1',
      player_account_id: 'player-1',
      player_username: 'Tester',
      issued_at_utc: '2026-04-12T00:00:00Z'
    },
    successMessage: 'remote',
    localOnlySuccessMessage: 'local'
  });

  expect(result.successMessage).toBe('local');
  expect(result.snapshot.authRecord).toBe(null);
  expect(result.snapshot.playerObservation?.player_username).toBe('Tester');
});
