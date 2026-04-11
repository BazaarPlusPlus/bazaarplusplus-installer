export interface InstallationPublicKey {
  modulus_b64: string;
  exponent_b64: string;
}

export interface PlayerObservationPayload {
  player_account_id: string;
  player_username: string;
  observed_at_utc: string;
  installation_hint?: string | null;
}

export interface InstallationRecordPayload {
  installation_id: string;
  player_account_id: string;
  api_base_url: string;
  public_key: InstallationPublicKey;
  status: 'active' | 'revoked' | 'stale';
  created_at_utc: string;
}

export interface InstallerSessionResponse {
  session_token: string;
  player_account_id: string;
  expires_at_utc: string;
}

export interface InstallationActivationResponse {
  installation_id: string;
  status: 'active';
}

export interface RegistrationStreamProfile {
  stream_platform: string;
  stream_channel_id: string;
  stream_url: string;
}

export interface InstallationKeyPair {
  publicKey: InstallationPublicKey;
  privateKeyPkcs8B64: string;
}

export interface LoadedIdentitySnapshot {
  observation: PlayerObservationPayload | null;
  installation: InstallationRecordPayload | null;
  installationPrivateKeyPkcs8B64: string | null;
}
