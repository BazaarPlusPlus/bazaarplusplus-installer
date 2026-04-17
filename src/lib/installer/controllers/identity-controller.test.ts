import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { createIdentityController } from './identity-controller.ts';
import type {
  AuthRecordPayload,
  LoadedIdentitySnapshot,
  PlayerObservationPayload
} from '../../identity/types.ts';

const vitest = (
  import.meta as ImportMeta & {
    vitest?: {
      test: (
        name: string,
        fn: () => void | Promise<void>
      ) => void;
    };
  }
).vitest;
const { test } = vitest ?? {
  test: () => undefined
};

const observation: PlayerObservationPayload = {
  player_account_id: 'player-1',
  player_username: 'Tester',
  observed_at_utc: '2026-04-12T00:00:00Z'
};

function localized(zh: string, en: string): string {
  return en || zh;
}

function createSnapshot(auth: AuthRecordPayload | null): LoadedIdentitySnapshot {
  return {
    observation,
    auth
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
      async activateObservedAccount() {
        throw new Error('player_account_id_taken');
      },
      async loginIdentity() {
        loginCalls += 1;
        snapshot = createSnapshot({
          token: 'token-1',
          player_account_id: observation.player_account_id,
          player_username: observation.player_username,
          issued_at_utc: '2026-04-12T00:00:00Z'
        });
        return snapshot.auth!;
      }
    } as never,
    localized,
    formatIdentityErrorMessage: (error) =>
      error instanceof Error ? error.message : String(error)
  });

  controller.playerObservation.set(observation);
  controller.identityPassword.set('secret');

  await controller.continueIdentity({
    identityState: {
      kind: 'login_or_register',
      auth: null,
      observation
    },
    gameRoot: '/games/The Bazaar'
  });

  assert.equal(loginCalls, 1);
  assert.equal(get(controller.authRecord)?.token, 'token-1');
  assert.equal(get(controller.identitySuccess), 'Signed in.');
  assert.equal(get(controller.identityError), '');
});

test('continueIdentity surfaces a password error after fallback login fails', async () => {
  const controller = createIdentityController({
    hasTauriRuntime: () => true,
    identityApi: {
      async loadLocalIdentity() {
        return createSnapshot(null);
      },
      async activateObservedAccount() {
        throw new Error('player_account_id_taken');
      },
      async loginIdentity() {
        throw new Error('invalid_credentials');
      }
    } as never,
    localized,
    formatIdentityErrorMessage: (error) =>
      error instanceof Error ? error.message : String(error)
  });

  controller.playerObservation.set(observation);
  controller.identityPassword.set('secret');

  await controller.continueIdentity({
    identityState: {
      kind: 'login_or_register',
      auth: null,
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

test('logoutIdentity keeps the local-only warning when remote logout fails', async () => {
  const controller = createIdentityController({
    hasTauriRuntime: () => true,
    identityApi: {
      async loadLocalIdentity() {
        return createSnapshot(null);
      },
      async logoutIdentity() {
        return { remoteLoggedOut: false };
      }
    } as never,
    localized,
    formatIdentityErrorMessage: (error) =>
      error instanceof Error ? error.message : String(error)
  });

  controller.authRecord.set({
    token: 'token-1',
    player_account_id: 'player-1',
    player_username: 'Tester',
    issued_at_utc: '2026-04-12T00:00:00Z'
  });
  controller.playerObservation.set(observation);

  await controller.logoutIdentity({
    identityState: {
      kind: 'ready',
      auth: {
        token: 'token-1',
        player_account_id: 'player-1',
        player_username: 'Tester',
        issued_at_utc: '2026-04-12T00:00:00Z'
      },
      observation
    },
    gameRoot: '/games/The Bazaar'
  });

  assert.equal(get(controller.identitySuccess), 'Signed out (offline).');
});
