import type {
  AuthRecordPayload,
  LoadedIdentitySnapshot,
  PlayerObservationPayload
} from '../identity/types.ts';

export interface IdentityApiLike {
  loadLocalIdentity(gameRoot: string): Promise<LoadedIdentitySnapshot>;
  activateObservedAccount(input: {
    gameRoot: string;
    observation: PlayerObservationPayload;
    password: string;
  }): Promise<AuthRecordPayload>;
  loginIdentity(input: {
    gameRoot: string;
    playerUsername: string;
    password: string;
  }): Promise<AuthRecordPayload>;
  logoutIdentity(input: {
    gameRoot: string;
    auth: AuthRecordPayload;
  }): Promise<{ remoteLoggedOut: boolean }>;
}

export interface InstallIdentitySnapshot {
  playerObservation: PlayerObservationPayload | null;
  authRecord: AuthRecordPayload | null;
}

export async function loadInstallIdentitySnapshot(
  identityApi: IdentityApiLike,
  gameRoot: string
): Promise<InstallIdentitySnapshot> {
  const snapshot = await identityApi.loadLocalIdentity(gameRoot);

  return {
    playerObservation: snapshot.observation,
    authRecord: snapshot.auth
  };
}

export async function activateObservedIdentity(input: {
  identityApi: IdentityApiLike;
  gameRoot: string;
  observation: PlayerObservationPayload;
  password: string;
  successMessage: string;
}): Promise<{
  successMessage: string;
  snapshot: InstallIdentitySnapshot;
}> {
  const auth = await input.identityApi.activateObservedAccount({
    gameRoot: input.gameRoot,
    observation: input.observation,
    password: input.password
  });

  return {
    successMessage: input.successMessage,
    snapshot: {
      playerObservation: input.observation,
      authRecord: auth
    }
  };
}

export async function loginInstallIdentity(input: {
  identityApi: IdentityApiLike;
  gameRoot: string;
  playerUsername: string;
  observation: PlayerObservationPayload | null;
  password: string;
  successMessage: string;
}): Promise<{
  successMessage: string;
  snapshot: InstallIdentitySnapshot;
}> {
  const auth = await input.identityApi.loginIdentity({
    gameRoot: input.gameRoot,
    playerUsername: input.playerUsername,
    password: input.password
  });

  return {
    successMessage: input.successMessage,
    snapshot: {
      playerObservation: input.observation,
      authRecord: auth
    }
  };
}

export async function logoutInstallIdentity(input: {
  identityApi: IdentityApiLike;
  gameRoot: string;
  playerObservation: PlayerObservationPayload | null;
  auth: AuthRecordPayload;
  localOnlySuccessMessage: string;
  successMessage: string;
}): Promise<{
  successMessage: string;
  snapshot: InstallIdentitySnapshot;
}> {
  const result = await input.identityApi.logoutIdentity({
    gameRoot: input.gameRoot,
    auth: input.auth
  });

  return {
    successMessage: result.remoteLoggedOut
      ? input.successMessage
      : input.localOnlySuccessMessage,
    snapshot: {
      playerObservation: input.playerObservation,
      authRecord: null
    }
  };
}
