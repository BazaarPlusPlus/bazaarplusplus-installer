import type {
  InstallationPublicKey,
  InstallationRecordPayload,
  PlayerObservationPayload
} from './types.ts';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizePublicKey(value: unknown): InstallationPublicKey | null {
  if (!isRecord(value)) {
    return null;
  }

  const { modulus_b64, exponent_b64 } = value;
  if (!isNonEmptyString(modulus_b64) || !isNonEmptyString(exponent_b64)) {
    return null;
  }

  return { modulus_b64, exponent_b64 };
}

export function normalizePlayerObservation(
  value: unknown
): PlayerObservationPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  const { player_account_id, player_username, observed_at_utc, installation_hint } =
    value;
  if (
    !isNonEmptyString(player_account_id) ||
    !isNonEmptyString(player_username) ||
    !isNonEmptyString(observed_at_utc)
  ) {
    return null;
  }

  const normalized: PlayerObservationPayload = {
    player_account_id,
    player_username,
    observed_at_utc
  };

  if (typeof installation_hint === 'string') {
    normalized.installation_hint = installation_hint;
  } else if (installation_hint === null) {
    normalized.installation_hint = null;
  }

  return normalized;
}

export function normalizeInstallationRecord(
  value: unknown
): InstallationRecordPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  const {
    installation_id,
    player_account_id,
    api_base_url,
    public_key,
    status,
    created_at_utc
  } = value;
  if (
    !isNonEmptyString(installation_id) ||
    !isNonEmptyString(player_account_id) ||
    !isNonEmptyString(api_base_url) ||
    !isNonEmptyString(created_at_utc)
  ) {
    return null;
  }

  if (status !== 'active' && status !== 'revoked' && status !== 'stale') {
    return null;
  }

  const normalizedPublicKey = normalizePublicKey(public_key);
  if (normalizedPublicKey === null) {
    return null;
  }

  return {
    installation_id,
    player_account_id,
    api_base_url,
    public_key: normalizedPublicKey,
    status,
    created_at_utc
  };
}
