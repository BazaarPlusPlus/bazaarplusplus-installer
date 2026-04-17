import test from 'node:test';
import assert from 'node:assert/strict';

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

  assert.equal(auth.token, 'token-001');
  assert.equal(requests.length, 1);
  const requestBody = JSON.parse(requests[0].body);
  assert.equal(requestBody.player_account_id, observation.player_account_id);
  assert.equal(writes.length, 1);
  assert.equal(JSON.parse(writes[0]).player_username, observation.player_username);
});

test('loginIdentity posts login and persists a local auth row', async () => {
  const writes: string[] = [];
  const api = createIdentityApi({
    postJsonImpl: async ({ url, body, authorization }) => {
      assert.equal(url.endsWith('/login'), true);
      assert.equal(authorization, undefined);
      assert.equal(JSON.parse(body).player_username, 'existing-user');
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

  assert.equal(auth.player_username, 'existing-user');
  assert.equal(writes.length, 1);
});

test('loadLocalIdentity returns null observation when observation JSON is malformed', async () => {
  const api = createIdentityApi({
    readPlayerObservationImpl: async () => '{"unexpected":"shape"}',
    readAuthRecordImpl: async () => null
  });

  const snapshot = await api.loadLocalIdentity('/games/The Bazaar');

  assert.equal(snapshot.observation, null);
  assert.equal(snapshot.auth, null);
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

  await assert.rejects(
    api.logoutIdentity({
      gameRoot: '/games/The Bazaar',
      auth: {
        token: 'token-003',
        player_account_id: 'player-account-003',
        player_username: 'player-three',
        issued_at_utc: '2026-04-11T01:00:00.000Z'
      }
    }),
    /fetch failed/
  );

  assert.equal(deleted, 1);
});
