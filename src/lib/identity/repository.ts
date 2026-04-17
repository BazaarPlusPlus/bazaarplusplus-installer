import { call } from '../bridge/commands.ts';

export async function readPlayerObservation(gameRoot: string) {
  return call('read_player_observation', { gameRoot });
}

export async function readAuthRecord(gameRoot: string) {
  return call('read_auth_record', { gameRoot });
}

export async function writeAuthRecord(gameRoot: string, payloadJson: string) {
  return call('write_auth_record', { gameRoot, payloadJson });
}

export async function deleteAuthRecord(gameRoot: string) {
  return call('delete_auth_record', { gameRoot });
}
