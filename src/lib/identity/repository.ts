import { invoke } from '@tauri-apps/api/core';

export async function readPlayerObservation(gameRoot: string) {
  return invoke<string | null>('read_player_observation', { gameRoot });
}

export async function readInstallationRecord(gameRoot: string) {
  return invoke<string | null>('read_installation_record', { gameRoot });
}

export async function readInstallationPrivateKey(gameRoot: string) {
  return invoke<string | null>('read_installation_private_key', { gameRoot });
}

export async function writeInstallationRecord(gameRoot: string, payloadB64: string) {
  return invoke('write_installation_record', { gameRoot, payloadB64 });
}

export async function writeInstallationPrivateKey(
  gameRoot: string,
  privateKeyB64: string
) {
  return invoke('write_installation_private_key', { gameRoot, privateKeyB64 });
}
