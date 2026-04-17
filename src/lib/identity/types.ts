export interface AuthRecordPayload {
  token: string;
  player_account_id: string;
  player_username: string;
  issued_at_utc: string;
}

export interface PlayerObservationPayload {
  player_account_id: string;
  player_username: string;
  observed_at_utc: string;
  installation_hint?: string | null;
}

export interface IdentityAuthResponse {
  token: string;
  player_account_id: string;
  player_username: string;
}

export interface LoadedIdentitySnapshot {
  observation: PlayerObservationPayload | null;
  auth: AuthRecordPayload | null;
}
