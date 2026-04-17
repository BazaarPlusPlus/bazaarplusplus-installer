import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { createIdentityController } from './identity-controller.ts';
import type {
  InstallationRecordPayload,
  LoadedIdentitySnapshot,
  PlayerObservationPayload
} from '../../identity/types.ts';

const observation: PlayerObservationPayload = {
  player_account_id: 'player-1',
  player_username: 'Tester',
  observed_at_utc: '2026-04-12T00:00:00Z'
};

function localized(zh: string, en: string): string {
  return en || zh;
}

function createSnapshot(
  installation: InstallationRecordPayload | null
): LoadedIdentitySnapshot {
  return {
    observation,
    installation,
    installationPrivateKeyPkcs8B64: installation ? 'private-key' : null
  };
}

test('continueIdentity falls back to login when the observed account already exists', async () => {
  let loginCalls = 0;
  let snapshot = createSnapshot(null);

  const controller = createIdentityController({
    hasTauriRuntime: () => true,
    identityApi: {
      async loadLocalIdentity() {
        return snapshot;
      },
      async activateFirstAccount() {
        throw new Error('player_account_id_claimed');
      },
      async loginAndCreateInstallation() {
        loginCalls += 1;
        snapshot = createSnapshot({
          installation_id: 'install-1',
          player_account_id: observation.player_account_id,
          api_base_url: 'https://mod-api-v3.bazaarplusplus.com',
          public_key: { modulus_b64: 'n', exponent_b64: 'AQAB' },
          status: 'active',
          created_at_utc: '2026-04-12T00:00:00Z'
        });
        return snapshot.installation!;
      }
    },
    localized,
    formatIdentityErrorMessage: (error) =>
      error instanceof Error ? error.message : String(error)
  });

  controller.playerObservation.set(observation);
  controller.identityPassword.set('secret');
  controller.identityConfirmed.set(true);

  await controller.continueIdentity({
    identityState: {
      kind: 'activate_first_account',
      installation: null,
      observation
    },
    gameRoot: '/games/The Bazaar'
  });

  assert.equal(loginCalls, 1);
  assert.equal(get(controller.installationRecord)?.installation_id, 'install-1');
  assert.match(
    get(controller.identitySuccess),
    /local installation identity was refreshed for the current account/i
  );
  assert.equal(get(controller.identityError), '');
});

test('continueIdentity surfaces a dedicated password error after fallback login fails', async () => {
  const controller = createIdentityController({
    hasTauriRuntime: () => true,
    identityApi: {
      async loadLocalIdentity() {
        return createSnapshot(null);
      },
      async activateFirstAccount() {
        throw new Error('player_account_id_claimed');
      },
      async loginAndCreateInstallation() {
        throw new Error('invalid_credentials');
      }
    },
    localized,
    formatIdentityErrorMessage: (error) =>
      error instanceof Error ? error.message : String(error)
  });

  controller.playerObservation.set(observation);
  controller.identityPassword.set('secret');
  controller.identityConfirmed.set(true);

  await controller.continueIdentity({
    identityState: {
      kind: 'activate_first_account',
      installation: null,
      observation
    },
    gameRoot: '/games/The Bazaar'
  });

  assert.equal(
    get(controller.identityError),
    'existing_account_invalid_credentials'
  );
  assert.equal(get(controller.identitySuccess), '');
});
