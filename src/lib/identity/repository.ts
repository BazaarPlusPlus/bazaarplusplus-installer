import { call } from '../bridge/commands.ts';

export async function readIdentitySnapshot(gameRoot: string) {
  return call('read_identity_snapshot', { gameRoot });
}

export async function writeAuthRecord(gameRoot: string, payloadJson: string) {
  return call('write_auth_record', { gameRoot, payloadJson });
}

export async function deleteAuthRecord(gameRoot: string) {
  return call('delete_auth_record', { gameRoot });
}
