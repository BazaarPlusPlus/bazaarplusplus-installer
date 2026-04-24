import { test, expect } from 'vitest';
import { get } from 'svelte/store';

import { createIdentityController } from './identity-controller.ts';
import type {
  AuthRecordPayload,
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
  auth: AuthRecordPayload | null
): LoadedIdentitySnapshot {
  return {
    observation,
    auth
  };
}

test('syncGameRoot does not start a duplicate load for the path already loading', async () => {
  let loadCalls = 0;
  let resolveLoad: ((snapshot: LoadedIdentitySnapshot) => void) | undefined;
  const loadPromise = new Promise<LoadedIdentitySnapshot>((resolve) => {
    resolveLoad = resolve;
  });

  const controller = createIdentityController({
    hasTauriRuntime: () => true,
    identityApi: {
      async loadLocalIdentity() {
        loadCalls += 1;
        return loadPromise;
      }
    } as never,
    localized,
    formatIdentityErrorMessage: (error) =>
      error instanceof Error ? error.message : String(error)
  });

  controller.syncGameRoot('/games/The Bazaar');
  controller.syncGameRoot('/games/The Bazaar');

  expect(loadCalls).toBe(1);

  resolveLoad?.(createSnapshot(null));
  await loadPromise;
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(get(controller.identityLoadState)).toBe('idle');
});

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

  expect(loginCalls).toBe(1);
  expect(get(controller.authRecord)?.token).toBe('token-1');
  expect(get(controller.identitySuccess)).toEqual({ kind: 'logged_in' });
  expect(get(controller.identityError)).toBe('');
});

test('continueIdentity keeps the just-registered password only in memory on registration success', async () => {
  let snapshot = createSnapshot(null);

  const controller = createIdentityController({
    hasTauriRuntime: () => true,
    identityApi: {
      async loadLocalIdentity() {
        return snapshot;
      },
      async activateObservedAccount() {
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

  expect(get(controller.authRecord)?.token).toBe('token-1');
  expect(get(controller.identitySuccess)).toEqual({
    kind: 'registered',
    password: 'secret'
  });
  expect(get(controller.identityPassword)).toBe('');
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

  expect(get(controller.identityError)).toBe(
    'existing_account_invalid_credentials'
  );
  expect(get(controller.identitySuccess)).toBeNull();
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

  expect(get(controller.identitySuccess)).toBeNull();
});
