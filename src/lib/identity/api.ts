import {
  deleteAuthRecord,
  readIdentitySnapshot,
  writeAuthRecord
} from './repository.ts';
import {
  isNonEmptyString,
  isRecord,
  normalizeAuthRecord,
  normalizePlayerObservation
} from './normalize.ts';
import {
  postJsonWithFetch,
  readJsonOrError,
  type IdentityTransportResponse
} from './transport.ts';
import { V3_API_BASE_URL } from '../config/endpoints.ts';
import type {
  AuthRecordPayload,
  IdentityAuthResponse,
  IdentitySnapshotResponse,
  LoadedIdentitySnapshot,
  PlayerObservationPayload
} from './types.ts';

export type { IdentityTransportResponse } from './transport.ts';

export const DEFAULT_V3_API_BASE_URL = V3_API_BASE_URL;

function debugIdentityLog(message: string, payload: Record<string, unknown>) {
  if (!import.meta.env?.DEV) return;
  console.debug(`[identity-api] ${message}`, payload);
}

function summarizeJson(name: string, payloadJson: string | null | undefined) {
  return {
    [`${name}Present`]: Boolean(payloadJson?.trim()),
    [`${name}Length`]: payloadJson?.trim().length ?? 0
  };
}

function summarizeObservationCandidate(
  value: unknown
): Record<string, unknown> {
  if (!isRecord(value)) {
    return {
      isRecord: false,
      valueType: Array.isArray(value) ? 'array' : typeof value,
      value
    };
  }

  return {
    isRecord: true,
    keys: Object.keys(value),
    player_account_id: value.player_account_id ?? null,
    player_account_id_valid: isNonEmptyString(value.player_account_id),
    player_username: value.player_username ?? null,
    player_username_valid: isNonEmptyString(value.player_username),
    observed_at_utc: value.observed_at_utc ?? null,
    observed_at_utc_valid: isNonEmptyString(value.observed_at_utc)
  };
}

function parseJsonOrNull(value: string | null | undefined): unknown | null {
  if (!value?.trim()) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function buildAuthRecord(payload: IdentityAuthResponse): AuthRecordPayload {
  return {
    token: payload.token,
    player_account_id: payload.player_account_id,
    player_username: payload.player_username,
    issued_at_utc: new Date().toISOString()
  };
}

export interface IdentityApiDeps {
  postJsonImpl?: (input: {
    url: string;
    body: string;
    authorization?: string;
  }) => Promise<IdentityTransportResponse>;
  readIdentitySnapshotImpl?: typeof readIdentitySnapshot;
  writeAuthRecordImpl?: typeof writeAuthRecord;
  deleteAuthRecordImpl?: typeof deleteAuthRecord;
}

export function createIdentityApi(deps: IdentityApiDeps = {}) {
  const postJsonImpl = deps.postJsonImpl ?? postJsonWithFetch;
  const readIdentitySnapshotImpl =
    deps.readIdentitySnapshotImpl ?? readIdentitySnapshot;
  const writeAuthRecordImpl = deps.writeAuthRecordImpl ?? writeAuthRecord;
  const deleteAuthRecordImpl = deps.deleteAuthRecordImpl ?? deleteAuthRecord;

  async function persistAuthRecord(gameRoot: string, auth: AuthRecordPayload) {
    await writeAuthRecordImpl(gameRoot, JSON.stringify(auth));
  }

  return {
    async loadLocalIdentity(gameRoot: string): Promise<LoadedIdentitySnapshot> {
      const localSnapshot: IdentitySnapshotResponse =
        await readIdentitySnapshotImpl(gameRoot);
      const observationJson = localSnapshot.playerObservationJson;
      const authJson = localSnapshot.authRecordJson;

      debugIdentityLog('loaded local identity snapshot files', {
        gameRoot,
        ...summarizeJson('observationJson', observationJson),
        ...summarizeJson('authJson', authJson)
      });

      const observationCandidate = parseJsonOrNull(observationJson);
      const authCandidate = parseJsonOrNull(authJson);
      const observation = normalizePlayerObservation(observationCandidate);
      const auth = normalizeAuthRecord(authCandidate);

      debugIdentityLog('resolved local identity snapshot', {
        gameRoot,
        observationPresent: Boolean(observation),
        authPresent: Boolean(auth),
        observationCandidate:
          summarizeObservationCandidate(observationCandidate)
      });

      return {
        observation,
        auth
      };
    },

    async activateObservedAccount(input: {
      gameRoot: string;
      observation: PlayerObservationPayload;
      password: string;
      apiBaseUrl?: string;
    }): Promise<AuthRecordPayload> {
      const apiBaseUrl = input.apiBaseUrl ?? DEFAULT_V3_API_BASE_URL;
      const response = await postJsonImpl({
        url: `${apiBaseUrl}/activate`,
        body: JSON.stringify({
          player_account_id: input.observation.player_account_id,
          player_username: input.observation.player_username,
          password: input.password
        })
      });
      const payload = await readJsonOrError<IdentityAuthResponse>(response);
      const auth = buildAuthRecord(payload);
      await persistAuthRecord(input.gameRoot, auth);
      return auth;
    },

    async loginIdentity(input: {
      gameRoot: string;
      playerUsername: string;
      password: string;
      apiBaseUrl?: string;
    }): Promise<AuthRecordPayload> {
      const apiBaseUrl = input.apiBaseUrl ?? DEFAULT_V3_API_BASE_URL;
      const response = await postJsonImpl({
        url: `${apiBaseUrl}/login`,
        body: JSON.stringify({
          player_username: input.playerUsername,
          password: input.password
        })
      });
      const payload = await readJsonOrError<IdentityAuthResponse>(response);
      const auth = buildAuthRecord(payload);
      await persistAuthRecord(input.gameRoot, auth);
      return auth;
    },

    async logoutIdentity(input: {
      gameRoot: string;
      auth: AuthRecordPayload;
      apiBaseUrl?: string;
    }): Promise<{ remoteLoggedOut: boolean }> {
      const apiBaseUrl = input.apiBaseUrl ?? DEFAULT_V3_API_BASE_URL;
      let remoteLoggedOut = false;

      try {
        const response = await postJsonImpl({
          url: `${apiBaseUrl}/logout`,
          body: '{}',
          authorization: input.auth.token
        });
        if (response.status >= 200 && response.status < 300) {
          remoteLoggedOut = true;
        } else {
          await readJsonOrError(response);
        }
      } finally {
        await deleteAuthRecordImpl(input.gameRoot);
      }

      return { remoteLoggedOut };
    }
  };
}
