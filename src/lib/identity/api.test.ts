import test from 'node:test';
import assert from 'node:assert/strict';

import { base64ToBytes, decodePayloadEnvelope, encodePayloadEnvelope } from './codec.ts';
import { createIdentityApi } from './api.ts';
import type { InstallationKeyPair, PlayerObservationPayload } from './types.ts';

test('decode rejects wrong magic', async () => {
  const payloadBytes = await encodePayloadEnvelope({
    player_account_id: 'player-account-001'
  });
  payloadBytes[0] = 'X'.charCodeAt(0);

  await assert.rejects(
    decodePayloadEnvelope(base64ToBytes(Buffer.from(payloadBytes).toString('base64'))),
    /identity_envelope_magic_mismatch/
  );
});

test('decode rejects checksum mismatch', async () => {
  const payloadBytes = await encodePayloadEnvelope({
    player_account_id: 'player-account-001'
  });
  payloadBytes[payloadBytes.length - 1] ^= 0xff;

  await assert.rejects(
    decodePayloadEnvelope(base64ToBytes(Buffer.from(payloadBytes).toString('base64'))),
    /identity_envelope_checksum_mismatch/
  );
});

test('activateFirstAccount posts activate and persists local installation files', async () => {
  const writes: Array<{ kind: string; value: string }> = [];
  const observation: PlayerObservationPayload = {
    player_account_id: 'player-account-001',
    player_username: 'player-one',
    observed_at_utc: '2026-04-11T01:00:00.000Z'
  };
  const keyPair: InstallationKeyPair = {
    publicKey: {
      modulus_b64: 'modulus',
      exponent_b64: 'AQAB'
    },
    privateKeyPkcs8B64: 'private-key'
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
          installation_id: 'inst_001',
          status: 'active'
        })
      };
    },
    writeInstallationRecordImpl: async (_gameRoot, value) => {
      writes.push({ kind: 'record', value });
    },
    writeInstallationPrivateKeyImpl: async (_gameRoot, value) => {
      writes.push({ kind: 'private', value });
    },
    generateInstallationKeyPairImpl: async () => keyPair
  });

  const installation = await api.activateFirstAccount({
    gameRoot: '/games/The Bazaar',
    observation,
    password: 'hunter2',
    streamProfile: {
      stream_platform: 'Bilibili',
      stream_channel_id: 'player_one_live',
      stream_url: 'https://live.bilibili.com/10001'
    }
  });

  assert.equal(installation.installation_id, 'inst_001');
  assert.equal(requests.length, 1);
  const requestBody = JSON.parse(requests[0].body);
  assert.equal(requestBody.player_account_id, observation.player_account_id);
  assert.equal(requestBody.stream_platform, 'Bilibili');
  assert.equal(requestBody.stream_channel_id, 'player_one_live');
  assert.equal(requestBody.stream_url, 'https://live.bilibili.com/10001');
  assert.equal(writes.length, 2);
  assert.equal(writes[1]?.value, 'private-key');
});

test('loginAndCreateInstallation rejects mismatched observed player account', async () => {
  const api = createIdentityApi({
    postJsonImpl: async ({ url }) => {
      if (url.endsWith('/login')) {
        return {
          status: 200,
          body: JSON.stringify({
            session_token: 'sess_001',
            player_account_id: 'player-account-999',
            expires_at_utc: '2099-04-11T00:30:00.000Z'
          })
        };
      }

      throw new Error('unexpected_installations_call');
    }
  });

  await assert.rejects(
    api.loginAndCreateInstallation({
      gameRoot: '/games/The Bazaar',
      observation: {
        player_account_id: 'player-account-001',
        player_username: 'player-one',
        observed_at_utc: '2026-04-11T01:00:00.000Z'
      },
      password: 'hunter2'
    }),
    /observed_player_account_mismatch/
  );
});
