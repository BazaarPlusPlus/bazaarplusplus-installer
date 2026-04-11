import type {
  InstallationRecordPayload,
  LoadedIdentitySnapshot,
  PlayerObservationPayload
} from '../identity/types.ts';

export interface IdentityApiLike {
  loadLocalIdentity(gameRoot: string): Promise<LoadedIdentitySnapshot>;
  activateFirstAccount(input: {
    gameRoot: string;
    observation: PlayerObservationPayload;
    password: string;
  }): Promise<InstallationRecordPayload>;
  loginAndCreateInstallation(input: {
    gameRoot: string;
    observation: PlayerObservationPayload;
    password: string;
  }): Promise<InstallationRecordPayload>;
}

export interface InstallIdentitySnapshot {
  playerObservation: PlayerObservationPayload | null;
  installationRecord: InstallationRecordPayload | null;
  hasInstallationPrivateKey: boolean;
}

export async function loadInstallIdentitySnapshot(
  identityApi: IdentityApiLike,
  gameRoot: string
): Promise<InstallIdentitySnapshot> {
  const snapshot = await identityApi.loadLocalIdentity(gameRoot);

  return {
    playerObservation: snapshot.observation,
    installationRecord: snapshot.installation,
    hasInstallationPrivateKey: Boolean(snapshot.installationPrivateKeyPkcs8B64)
  };
}

export async function activateInstallIdentity(input: {
  identityApi: IdentityApiLike;
  gameRoot: string;
  observation: PlayerObservationPayload;
  password: string;
  successMessage: string;
}): Promise<{
  successMessage: string;
  snapshot: InstallIdentitySnapshot;
}> {
  await input.identityApi.activateFirstAccount({
    gameRoot: input.gameRoot,
    observation: input.observation,
    password: input.password
  });

  return {
    successMessage: input.successMessage,
    snapshot: await loadInstallIdentitySnapshot(input.identityApi, input.gameRoot)
  };
}

export async function reloginInstallIdentity(input: {
  identityApi: IdentityApiLike;
  gameRoot: string;
  observation: PlayerObservationPayload;
  password: string;
  successMessage: string;
}): Promise<{
  successMessage: string;
  snapshot: InstallIdentitySnapshot;
}> {
  await input.identityApi.loginAndCreateInstallation({
    gameRoot: input.gameRoot,
    observation: input.observation,
    password: input.password
  });

  return {
    successMessage: input.successMessage,
    snapshot: await loadInstallIdentitySnapshot(input.identityApi, input.gameRoot)
  };
}
