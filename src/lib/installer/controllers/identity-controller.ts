import { writable, get } from 'svelte/store';

import type { IdentityApiLike, InstallIdentitySnapshot } from '../identity-flow.ts';
import {
  activateInstallIdentity,
  loadInstallIdentitySnapshot,
  reloginInstallIdentity
} from '../identity-flow.ts';
import type { IdentityState } from '../../identity/state.ts';
import type {
  InstallationRecordPayload,
  PlayerObservationPayload
} from '../../identity/types.ts';

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
  const installationRecord = writable<InstallationRecordPayload | null>(null);
  const hasInstallationPrivateKey = writable(false);
  const identityLoadState = writable<'idle' | 'loading'>('idle');
  const identityActionBusy = writable<'idle' | 'activating' | 'logging_in'>('idle');
  const identityPassword = writable('');
  const identityConfirmed = writable(false);
  const identityError = writable('');
  const identitySuccess = writable('');
  const identityLoadedGamePath = writable('');
  let identityLoadRequestId = 0;

  function applySnapshot(snapshot: InstallIdentitySnapshot, gameRoot: string) {
    playerObservation.set(snapshot.playerObservation);
    installationRecord.set(snapshot.installationRecord);
    hasInstallationPrivateKey.set(snapshot.hasInstallationPrivateKey);
    identityLoadedGamePath.set(gameRoot);
  }

  function resetIdentitySnapshot() {
    playerObservation.set(null);
    installationRecord.set(null);
    hasInstallationPrivateKey.set(false);
    identityError.set('');
    identitySuccess.set('');
  }

  function resetIdentityMessages() {
    identityError.set('');
    identitySuccess.set('');
  }

  async function refreshIdentity(gameRoot: string) {
    if (!input.hasTauriRuntime() || !gameRoot) {
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

      resetIdentitySnapshot();
      identityError.set(
        input.formatIdentityErrorMessage(error, input.localized)
      );
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
    if (inputArgs.identityState.kind === 'relogin_required') {
      await loginAndRefreshInstallation({ gameRoot: inputArgs.gameRoot });
      return;
    }

    if (inputArgs.identityState.kind !== 'activate_first_account') {
      return;
    }

    const observation = get(playerObservation);
    const password = get(identityPassword).trim();
    const confirmed = get(identityConfirmed);
    const actionBusy = get(identityActionBusy);

    if (!inputArgs.gameRoot || !observation || !confirmed || !password || actionBusy !== 'idle') {
      return;
    }

    identityActionBusy.set('activating');
    resetIdentityMessages();

    try {
      const result = await activateInstallIdentity({
        identityApi: input.identityApi,
        gameRoot: inputArgs.gameRoot,
        observation,
        password,
        successMessage: input.localized(
          '当前账号的 installation 身份已写入本地共享目录。',
          'Installation identity for the current account was written to the shared local directory.'
        )
      });
      applySnapshot(result.snapshot, inputArgs.gameRoot);
      identityPassword.set('');
      identityConfirmed.set(false);
      identitySuccess.set(result.successMessage);
      return;
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'player_account_id_claimed') {
        identityError.set(
          input.formatIdentityErrorMessage(error, input.localized)
        );
        identityActionBusy.set('idle');
        return;
      }
    }

    identityActionBusy.set('logging_in');

    try {
      const result = await reloginInstallIdentity({
        identityApi: input.identityApi,
        gameRoot: inputArgs.gameRoot,
        observation,
        password,
        successMessage: input.localized(
          '检测到这个账号已经存在，已按当前账号刷新本地 installation 身份。',
          'This account already existed, so the local installation identity was refreshed for the current account.'
        )
      });
      applySnapshot(result.snapshot, inputArgs.gameRoot);
      identityPassword.set('');
      identityConfirmed.set(false);
      identitySuccess.set(result.successMessage);
    } catch (error) {
      if (error instanceof Error && error.message === 'invalid_credentials') {
        identityError.set(
          input.formatIdentityErrorMessage(
            new Error('existing_account_invalid_credentials'),
            input.localized
          )
        );
      } else {
        identityError.set(
          input.formatIdentityErrorMessage(error, input.localized)
        );
      }
    } finally {
      identityActionBusy.set('idle');
    }
  }

  async function loginAndRefreshInstallation(inputArgs: {
    gameRoot: string;
  }) {
    const observation = get(playerObservation);
    const password = get(identityPassword).trim();
    const confirmed = get(identityConfirmed);
    const actionBusy = get(identityActionBusy);

    if (!inputArgs.gameRoot || !observation || !confirmed || !password || actionBusy !== 'idle') {
      return;
    }

    identityActionBusy.set('logging_in');
    resetIdentityMessages();

    try {
      const result = await reloginInstallIdentity({
        identityApi: input.identityApi,
        gameRoot: inputArgs.gameRoot,
        observation,
        password,
        successMessage: input.localized(
          'installation 材料已经按当前观察到的账号重新生成。',
          'Installation material was regenerated for the currently observed account.'
        )
      });
      applySnapshot(result.snapshot, inputArgs.gameRoot);
      identityPassword.set('');
      identityConfirmed.set(false);
      identitySuccess.set(result.successMessage);
    } catch (error) {
      identityError.set(
        input.formatIdentityErrorMessage(error, input.localized)
      );
    } finally {
      identityActionBusy.set('idle');
    }
  }

  return {
    playerObservation,
    installationRecord,
    hasInstallationPrivateKey,
    identityLoadState,
    identityActionBusy,
    identityPassword,
    identityConfirmed,
    identityError,
    identitySuccess,
    identityLoadedGamePath,
    resetIdentitySnapshot,
    resetIdentityMessages,
    refreshIdentity,
    syncGameRoot,
    continueIdentity,
    loginAndRefreshInstallation
  };
}
