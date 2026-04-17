import type { AuthRecordPayload, PlayerObservationPayload } from './types.ts';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
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

export function normalizeAuthRecord(value: unknown): AuthRecordPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  const { token, player_account_id, player_username, issued_at_utc } = value;
  if (
    !isNonEmptyString(token) ||
    !isNonEmptyString(player_account_id) ||
    !isNonEmptyString(player_username) ||
    !isNonEmptyString(issued_at_utc)
  ) {
    return null;
  }

  return {
    token,
    player_account_id,
    player_username,
    issued_at_utc
  };
}
