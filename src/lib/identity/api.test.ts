import { test, expect } from 'vitest';

import { createIdentityApi } from './api.ts';
import type { PlayerObservationPayload } from './types.ts';

test('activateObservedAccount posts activate and persists a local auth row', async () => {
  const writes: string[] = [];
  const observation: PlayerObservationPayload = {
    player_account_id: 'player-account-001',
    player_username: 'player-one',
    observed_at_utc: '2026-04-11T01:00:00.000Z'
  };
  const requests: Array<{
    url: string;
    body: string;
    authorization?: string;
  }> = [];
  const api = createIdentityApi({
    postJsonImpl: async ({ url, body, authorization }) => {
      requests.push({ url, body, authorization });
      return {
        status: 200,
        body: JSON.stringify({
          token: 'token-001',
          player_account_id: observation.player_account_id,
          player_username: observation.player_username
        })
      };
    },
    writeAuthRecordImpl: async (_gameRoot, value) => {
      writes.push(value);
    }
  });

  const auth = await api.activateObservedAccount({
    gameRoot: '/games/The Bazaar',
    observation,
    password: 'hunter2'
  });

  expect(auth.token).toBe('token-001');
  expect(requests.length).toBe(1);
  const requestBody = JSON.parse(requests[0].body);
  expect(requestBody.player_account_id).toBe(observation.player_account_id);
  expect(writes.length).toBe(1);
  expect(JSON.parse(writes[0]).player_username).toBe(
    observation.player_username
  );
});

test('loginIdentity posts login and persists a local auth row', async () => {
  const writes: string[] = [];
  const api = createIdentityApi({
    postJsonImpl: async ({ url, body, authorization }) => {
      expect(url.endsWith('/login')).toBe(true);
      expect(authorization).toBe(undefined);
      expect(JSON.parse(body).player_username).toBe('existing-user');
      return {
        status: 200,
        body: JSON.stringify({
          token: 'token-002',
          player_account_id: 'player-account-002',
          player_username: 'existing-user'
        })
      };
    },
    writeAuthRecordImpl: async (_gameRoot, value) => {
      writes.push(value);
    }
  });

  const auth = await api.loginIdentity({
    gameRoot: '/games/The Bazaar',
    playerUsername: 'existing-user',
    password: 'hunter2'
  });

  expect(auth.player_username).toBe('existing-user');
  expect(writes.length).toBe(1);
});

test('loadLocalIdentity returns null observation when observation JSON is malformed', async () => {
  let snapshotReads = 0;
  const api = createIdentityApi({
    readIdentitySnapshotImpl: async () => {
      snapshotReads += 1;
      return {
        playerObservationJson: '{"unexpected":"shape"}',
        authRecordJson: JSON.stringify({
          token: 'token-004',
          player_account_id: 'player-account-004',
          player_username: 'player-four',
          issued_at_utc: '2026-04-11T01:00:00.000Z'
        })
      };
    }
  });

  const snapshot = await api.loadLocalIdentity('/games/The Bazaar');

  expect(snapshotReads).toBe(1);
  expect(snapshot.observation).toBe(null);
  expect(snapshot.auth?.token).toBe('token-004');
});

test('logoutIdentity always deletes the local auth row', async () => {
  let deleted = 0;
  const api = createIdentityApi({
    postJsonImpl: async () => {
      throw new Error('fetch failed');
    },
    deleteAuthRecordImpl: async () => {
      deleted += 1;
    }
  });

  await expect(
    api.logoutIdentity({
      gameRoot: '/games/The Bazaar',
      auth: {
        token: 'token-003',
        player_account_id: 'player-account-003',
        player_username: 'player-three',
        issued_at_utc: '2026-04-11T01:00:00.000Z'
      }
    })
  ).rejects.toThrow(/fetch failed/);

  expect(deleted).toBe(1);
});
