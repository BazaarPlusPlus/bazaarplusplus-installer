import {
  readInstallationPrivateKey,
  readInstallationRecord,
  readPlayerObservation,
  writeInstallationPrivateKey,
  writeInstallationRecord
} from './repository.ts';
import {
  base64ToBytes,
  decodePayloadEnvelope,
  encodePayloadEnvelope,
  bytesToBase64
} from './codec.ts';
import { generateInstallationKeyPair } from './crypto.ts';
import {
  normalizeInstallationRecord,
  normalizePlayerObservation
} from './normalize.ts';
import {
  postJsonWithFetch,
  readJsonOrError,
  type IdentityTransportResponse
} from './transport.ts';
import type {
  InstallationActivationResponse,
  InstallationKeyPair,
  InstallationRecordPayload,
  InstallationPublicKey,
  InstallerSessionResponse,
  LoadedIdentitySnapshot,
  PlayerObservationPayload
} from './types.ts';

export type { IdentityTransportResponse } from './transport.ts';

export const DEFAULT_V3_API_BASE_URL = 'https://mod-api-v3.bazaarplusplus.com';

export interface IdentityApiDeps {
  postJsonImpl?: (input: {
    url: string;
    body: string;
    authorization?: string;
  }) => Promise<IdentityTransportResponse>;
  readPlayerObservationImpl?: typeof readPlayerObservation;
  readInstallationRecordImpl?: typeof readInstallationRecord;
  readInstallationPrivateKeyImpl?: typeof readInstallationPrivateKey;
  writeInstallationRecordImpl?: typeof writeInstallationRecord;
  writeInstallationPrivateKeyImpl?: typeof writeInstallationPrivateKey;
  generateInstallationKeyPairImpl?: () => Promise<InstallationKeyPair>;
}

function buildInstallationRecord(input: {
  installationId: string;
  playerAccountId: string;
  apiBaseUrl: string;
  publicKey: InstallationPublicKey;
  status: 'active';
}): InstallationRecordPayload {
  return {
    installation_id: input.installationId,
    player_account_id: input.playerAccountId,
    api_base_url: input.apiBaseUrl,
    public_key: input.publicKey,
    status: input.status,
    created_at_utc: new Date().toISOString()
  };
}

export function createIdentityApi(deps: IdentityApiDeps = {}) {
  const postJsonImpl = deps.postJsonImpl ?? postJsonWithFetch;
  const readPlayerObservationImpl =
    deps.readPlayerObservationImpl ?? readPlayerObservation;
  const readInstallationRecordImpl =
    deps.readInstallationRecordImpl ?? readInstallationRecord;
  const readInstallationPrivateKeyImpl =
    deps.readInstallationPrivateKeyImpl ?? readInstallationPrivateKey;
  const writeInstallationRecordImpl =
    deps.writeInstallationRecordImpl ?? writeInstallationRecord;
  const writeInstallationPrivateKeyImpl =
    deps.writeInstallationPrivateKeyImpl ?? writeInstallationPrivateKey;
  const generateInstallationKeyPairImpl =
    deps.generateInstallationKeyPairImpl ?? generateInstallationKeyPair;

  async function persistInstallationIdentity(
    gameRoot: string,
    installation: InstallationRecordPayload,
    privateKeyPkcs8B64: string
  ) {
    const installationBytes = await encodePayloadEnvelope(installation);

    await writeInstallationRecordImpl(gameRoot, bytesToBase64(installationBytes));
    await writeInstallationPrivateKeyImpl(gameRoot, privateKeyPkcs8B64);
  }

  return {
    async loadLocalIdentity(gameRoot: string): Promise<LoadedIdentitySnapshot> {
      const [
        observationEnvelopeB64,
        installationEnvelopeB64,
        installationPrivateKeyPkcs8B64
      ] = await Promise.all([
        readPlayerObservationImpl(gameRoot),
        readInstallationRecordImpl(gameRoot),
        readInstallationPrivateKeyImpl(gameRoot)
      ]);

      const observation = observationEnvelopeB64
        ? normalizePlayerObservation(
            await decodePayloadEnvelope<unknown>(base64ToBytes(observationEnvelopeB64))
          )
        : null;
      const installation = installationEnvelopeB64
        ? normalizeInstallationRecord(
            await decodePayloadEnvelope<unknown>(
              base64ToBytes(installationEnvelopeB64)
            )
          )
        : null;

      return {
        observation,
        installation,
        installationPrivateKeyPkcs8B64:
          installationPrivateKeyPkcs8B64?.trim() || null
      };
    },

    async activateFirstAccount(input: {
      gameRoot: string;
      observation: PlayerObservationPayload;
      password: string;
      apiBaseUrl?: string;
    }): Promise<InstallationRecordPayload> {
      const apiBaseUrl = input.apiBaseUrl ?? DEFAULT_V3_API_BASE_URL;
      const keyPair = await generateInstallationKeyPairImpl();
      const response = await postJsonImpl({
        url: `${apiBaseUrl}/activate`,
        body: JSON.stringify({
          player_account_id: input.observation.player_account_id,
          player_username: input.observation.player_username,
          password: input.password,
          installation_public_key: JSON.stringify(keyPair.publicKey)
        })
      });
      const payload =
        await readJsonOrError<InstallationActivationResponse>(response);
      const installation = buildInstallationRecord({
        installationId: payload.installation_id,
        playerAccountId: input.observation.player_account_id,
        apiBaseUrl,
        publicKey: keyPair.publicKey,
        status: payload.status
      });

      await persistInstallationIdentity(
        input.gameRoot,
        installation,
        keyPair.privateKeyPkcs8B64
      );

      return installation;
    },

    async loginAndCreateInstallation(input: {
      gameRoot: string;
      observation: PlayerObservationPayload;
      password: string;
      apiBaseUrl?: string;
    }): Promise<InstallationRecordPayload> {
      const apiBaseUrl = input.apiBaseUrl ?? DEFAULT_V3_API_BASE_URL;
      const sessionResponse = await postJsonImpl({
        url: `${apiBaseUrl}/login`,
        body: JSON.stringify({
          player_username: input.observation.player_username,
          password: input.password
        })
      });
      const session = await readJsonOrError<InstallerSessionResponse>(
        sessionResponse
      );

      if (session.player_account_id !== input.observation.player_account_id) {
        throw new Error('observed_player_account_mismatch');
      }

      const keyPair = await generateInstallationKeyPairImpl();
      const installationResponse = await postJsonImpl({
        url: `${apiBaseUrl}/installations`,
        authorization: session.session_token,
        body: JSON.stringify({
          player_account_id: input.observation.player_account_id,
          installation_public_key: JSON.stringify(keyPair.publicKey)
        })
      });
      const payload =
        await readJsonOrError<InstallationActivationResponse>(installationResponse);
      const installation = buildInstallationRecord({
        installationId: payload.installation_id,
        playerAccountId: input.observation.player_account_id,
        apiBaseUrl,
        publicKey: keyPair.publicKey,
        status: payload.status
      });

      await persistInstallationIdentity(
        input.gameRoot,
        installation,
        keyPair.privateKeyPkcs8B64
      );

      return installation;
    }
  };
}
