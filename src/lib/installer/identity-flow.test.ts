import test from 'node:test';
import assert from 'node:assert/strict';

import {
  activateInstallIdentity,
  loadInstallIdentitySnapshot,
  reloginInstallIdentity
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
        installation: null,
        installationPrivateKeyPkcs8B64: 'secret'
      })
    } as never,
    'C:\\Games\\The Bazaar'
  );

  assert.equal(snapshot.playerObservation?.player_username, 'Tester');
  assert.equal(snapshot.hasInstallationPrivateKey, true);
});

test('activateInstallIdentity persists then reloads identity state', async () => {
  let activated = false;

  const result = await activateInstallIdentity({
    identityApi: {
      activateFirstAccount: async () => {
        activated = true;
      },
      loadLocalIdentity: async () => ({
        observation: {
          player_account_id: 'player-1',
          player_username: 'Tester',
          observed_at_utc: '2026-04-12T00:00:00Z'
        },
        installation: {
          installation_id: 'install-1',
          player_account_id: 'player-1',
          api_base_url: 'https://example.com',
          public_key: {
            modulus_b64: 'mod',
            exponent_b64: 'exp'
          },
          status: 'active',
          created_at_utc: '2026-04-12T00:00:00Z'
        },
        installationPrivateKeyPkcs8B64: 'secret'
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
  assert.equal(result.snapshot.installationRecord?.installation_id, 'install-1');
});

test('reloginInstallIdentity reuses the same snapshot reload path', async () => {
  let loggedIn = false;

  const result = await reloginInstallIdentity({
    identityApi: {
      loginAndCreateInstallation: async () => {
        loggedIn = true;
      },
      loadLocalIdentity: async () => ({
        observation: {
          player_account_id: 'player-1',
          player_username: 'Tester',
          observed_at_utc: '2026-04-12T00:00:00Z'
        },
        installation: null,
        installationPrivateKeyPkcs8B64: null
      })
    } as never,
    gameRoot: 'C:\\Games\\The Bazaar',
    observation: {
      player_account_id: 'player-1',
      player_username: 'Tester',
      observed_at_utc: '2026-04-12T00:00:00Z'
    },
    password: 'secret',
    successMessage: 'relogged'
  });

  assert.equal(loggedIn, true);
  assert.equal(result.successMessage, 'relogged');
});
