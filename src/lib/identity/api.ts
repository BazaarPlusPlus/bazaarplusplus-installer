import {
  readInstallationPrivateKey,
  readInstallationRecord,
  readPlayerObservation,
  writeInstallationPrivateKey,
  writeInstallationRecord
} from '../installer/api.ts';
import {
  base64ToBase64Url,
  base64ToBytes,
  base64UrlToBase64,
  decodePayloadEnvelope,
  encodePayloadEnvelope,
  bytesToBase64
} from './codec.ts';
import type {
  InstallationActivationResponse,
  InstallationKeyPair,
  InstallationRecordPayload,
  InstallationPublicKey,
  InstallerSessionResponse,
  LoadedIdentitySnapshot,
  PlayerObservationPayload
} from './types.ts';

export const DEFAULT_V3_API_BASE_URL = 'https://mod-api-v3.bazaarplusplus.com';

export interface IdentityTransportResponse {
  status: number;
  body: string;
}

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

async function readJsonOrError<T>(
  response: IdentityTransportResponse
): Promise<T> {
  const body = ((): { error?: string } | T | null => {
    try {
      return (JSON.parse(response.body || 'null') as { error?: string } | T | null) ?? null;
    } catch {
      return null;
    }
  })();

  if (response.status < 200 || response.status >= 300) {
    const errorCode =
      body && typeof body === 'object' && 'error' in body
        ? String(body.error ?? 'identity_request_failed')
        : 'identity_request_failed';
    throw new Error(errorCode);
  }

  return body as T;
}

async function postJsonWithFetch(input: {
  url: string;
  body: string;
  authorization?: string;
}): Promise<IdentityTransportResponse> {
  const response = await fetch(input.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(input.authorization
        ? { authorization: `Bearer ${input.authorization}` }
        : {})
    },
    body: input.body
  });

  return {
    status: response.status,
    body: await response.text()
  };
}

export async function generateInstallationKeyPair(): Promise<InstallationKeyPair> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('webcrypto_unavailable');
  }

  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1])
    },
    true,
    ['sign', 'verify']
  );

  const jwk = (await crypto.subtle.exportKey(
    'jwk',
    keyPair.publicKey
  )) as JsonWebKey;
  const pkcs8 = new Uint8Array(
    await crypto.subtle.exportKey('pkcs8', keyPair.privateKey)
  );

  if (!jwk.n || !jwk.e) {
    throw new Error('installation_key_export_failed');
  }

  return {
    publicKey: {
      modulus_b64: base64UrlToBase64(jwk.n),
      exponent_b64: base64UrlToBase64(jwk.e)
    },
    privateKeyPkcs8B64: bytesToBase64(pkcs8)
  };
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
        ? await decodePayloadEnvelope<PlayerObservationPayload>(
            base64ToBytes(observationEnvelopeB64)
          )
        : null;
      const installation = installationEnvelopeB64
        ? await decodePayloadEnvelope<InstallationRecordPayload>(
            base64ToBytes(installationEnvelopeB64)
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
    },

    exportPrivateKeyToJwk(privateKeyPkcs8B64: string) {
      return {
        pkcs8_b64: privateKeyPkcs8B64,
        pkcs8_b64url: base64ToBase64Url(privateKeyPkcs8B64)
      };
    }
  };
}
