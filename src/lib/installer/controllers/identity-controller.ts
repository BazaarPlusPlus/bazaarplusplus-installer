import { writable, get } from 'svelte/store';

import type { IdentityApiLike, InstallIdentitySnapshot } from '../identity-flow.ts';
import {
  activateObservedIdentity,
  loadInstallIdentitySnapshot,
  loginInstallIdentity,
  logoutInstallIdentity
} from '../identity-flow.ts';
import type { IdentityState } from '../../identity/state.ts';
import type {
  AuthRecordPayload,
  PlayerObservationPayload
} from '../../identity/types.ts';

function debugIdentityControllerLog(
  message: string,
  payload: Record<string, unknown>
) {
  console.debug(`[identity-controller] ${message}`, payload);
}

export function createIdentityController(input: {
  hasTauriRuntime: () => boolean;
  identityApi: IdentityApiLike;
  localized: (zh: string, en: string) => string;
  formatIdentityErrorMessage: (
    error: unknown,
    localized: (zh: string, en: string) => string
  ) => string;
}) {
  const playerObservation = writable<PlayerObservationPayload | null>(null);
  const authRecord = writable<AuthRecordPayload | null>(null);
  const identityLoadState = writable<'idle' | 'loading'>('idle');
  const identityActionBusy = writable<
    'idle' | 'activating' | 'logging_in' | 'logging_out'
  >('idle');
  const identityPassword = writable('');
  const identityError = writable('');
  const identitySuccess = writable('');
  const identityLoadedGamePath = writable('');
  let identityLoadRequestId = 0;

  function clearFormState() {
    identityPassword.set('');
  }

  function applySnapshot(snapshot: InstallIdentitySnapshot, gameRoot: string) {
    debugIdentityControllerLog('applySnapshot', {
      gameRoot,
      observation: snapshot.playerObservation,
      auth: snapshot.authRecord
    });
    playerObservation.set(snapshot.playerObservation);
    authRecord.set(snapshot.authRecord);
    identityLoadedGamePath.set(gameRoot);
  }

  function resetIdentitySnapshot() {
    debugIdentityControllerLog('resetIdentitySnapshot', {});
    playerObservation.set(null);
    authRecord.set(null);
    identityError.set('');
    identitySuccess.set('');
  }

  function resetIdentityMessages() {
    identityError.set('');
    identitySuccess.set('');
  }

  async function refreshIdentity(gameRoot: string) {
    if (!input.hasTauriRuntime() || !gameRoot) {
      debugIdentityControllerLog('refreshIdentity skipped', {
        gameRoot,
        hasTauriRuntime: input.hasTauriRuntime()
      });
      identityLoadedGamePath.set('');
      resetIdentitySnapshot();
      return;
    }

    const requestId = ++identityLoadRequestId;
    identityLoadState.set('loading');

    try {
      const snapshot = await loadInstallIdentitySnapshot(input.identityApi, gameRoot);
      if (requestId !== identityLoadRequestId) {
        return;
      }

      applySnapshot(snapshot, gameRoot);
    } catch (error) {
      if (requestId !== identityLoadRequestId) {
        return;
      }

      console.error('[identity-controller] refreshIdentity failed', {
        gameRoot,
        requestId,
        error
      });
      resetIdentitySnapshot();
      identityError.set(input.formatIdentityErrorMessage(error, input.localized));
    } finally {
      if (requestId === identityLoadRequestId) {
        identityLoadState.set('idle');
      }
    }
  }

  function syncGameRoot(gameRoot: string) {
    if (!input.hasTauriRuntime() || !gameRoot) {
      identityLoadedGamePath.set('');
      resetIdentitySnapshot();
      return;
    }

    if (gameRoot !== get(identityLoadedGamePath)) {
      void refreshIdentity(gameRoot);
    }
  }

  async function continueIdentity(inputArgs: {
    identityState: IdentityState;
    gameRoot: string;
  }) {
    if (inputArgs.identityState.kind !== 'login_or_register') {
      return;
    }

    const observation = get(playerObservation);
    const password = get(identityPassword).trim();
    const actionBusy = get(identityActionBusy);

    if (!inputArgs.gameRoot || !observation || !password || actionBusy !== 'idle') {
      return;
    }

    identityActionBusy.set('activating');
    resetIdentityMessages();

    try {
      const result = await activateObservedIdentity({
        identityApi: input.identityApi,
        gameRoot: inputArgs.gameRoot,
        observation,
        password,
        successMessage: input.localized(
          '已登录。',
          'Signed in.'
        )
      });
      applySnapshot(result.snapshot, inputArgs.gameRoot);
      clearFormState();
      identitySuccess.set(result.successMessage);
      return;
    } catch (error) {
      const errorCode = error instanceof Error ? error.message : String(error);
      if (
        errorCode !== 'player_account_id_taken' &&
        errorCode !== 'player_username_taken'
      ) {
        identityError.set(input.formatIdentityErrorMessage(error, input.localized));
        identityActionBusy.set('idle');
        return;
      }
    }

    identityActionBusy.set('logging_in');

    try {
      const result = await loginInstallIdentity({
        identityApi: input.identityApi,
        gameRoot: inputArgs.gameRoot,
        playerUsername: observation.player_username,
        password,
        successMessage: input.localized(
          '已登录。',
          'Signed in.'
        )
      });
      applySnapshot(result.snapshot, inputArgs.gameRoot);
      clearFormState();

      const refreshedObservation = result.snapshot.playerObservation;
      const refreshedAuth = result.snapshot.authRecord;
      if (
        refreshedObservation &&
        refreshedAuth &&
        refreshedObservation.player_account_id !== refreshedAuth.player_account_id
      ) {
        identitySuccess.set(
          input.localized(
            '已登录，但与当前游戏账号不一致。',
            "Signed in, but doesn't match the current game account."
          )
        );
      } else {
        identitySuccess.set(result.successMessage);
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'invalid_credentials') {
        identityError.set(
          input.formatIdentityErrorMessage(
            new Error('existing_account_invalid_credentials'),
            input.localized
          )
        );
      } else {
        identityError.set(input.formatIdentityErrorMessage(error, input.localized));
      }
    } finally {
      identityActionBusy.set('idle');
    }
  }

  async function logoutIdentity(inputArgs: {
    identityState: IdentityState;
    gameRoot: string;
  }) {
    if (
      inputArgs.identityState.kind !== 'ready' &&
      inputArgs.identityState.kind !== 'account_mismatch'
    ) {
      return;
    }

    const auth = get(authRecord);
    const actionBusy = get(identityActionBusy);
    if (!inputArgs.gameRoot || !auth || actionBusy !== 'idle') {
      return;
    }

    identityActionBusy.set('logging_out');
    resetIdentityMessages();

    try {
      const result = await logoutInstallIdentity({
        identityApi: input.identityApi,
        gameRoot: inputArgs.gameRoot,
        auth,
        successMessage: input.localized(
          '已登出。',
          'Signed out.'
        ),
        localOnlySuccessMessage: input.localized(
          '已登出（离线）。',
          'Signed out (offline).'
        )
      });
      applySnapshot(result.snapshot, inputArgs.gameRoot);
      clearFormState();
      identitySuccess.set(result.successMessage);
    } catch (error) {
      identityError.set(input.formatIdentityErrorMessage(error, input.localized));
    } finally {
      identityActionBusy.set('idle');
    }
  }

  return {
    playerObservation,
    authRecord,
    identityLoadState,
    identityActionBusy,
    identityPassword,
    identityError,
    identitySuccess,
    identityLoadedGamePath,
    resetIdentitySnapshot,
    resetIdentityMessages,
    refreshIdentity,
    syncGameRoot,
    continueIdentity,
    logoutIdentity
  };
}
