import { invoke } from '@tauri-apps/api/core';
import type {
  DotnetInfo,
  EnvironmentInfo,
  GameRunningInfo,
  LegacyRecordDirectoryInfo,
  LaunchOptionsPatchResult,
  SteamRunningInfo,
  SupportersResponse
} from '$lib/types';

export async function verifyGamePath(path: string) {
  return invoke<boolean>('verify_game_path', { path });
}

export async function detectDotnetRuntime() {
  return invoke<DotnetInfo>('detect_dotnet_runtime');
}

export async function detectEnvironment(gamePath?: string) {
  return gamePath
    ? invoke<EnvironmentInfo>('detect_environment', { gamePath })
    : invoke<EnvironmentInfo>('detect_environment');
}

export async function detectSteamRunning() {
  return invoke<SteamRunningInfo>('detect_steam_running');
}

export async function closeSteam() {
  return invoke('close_steam');
}

export async function detectBazaarRunning() {
  return invoke<GameRunningInfo>('detect_bazaar_running');
}

export async function installBepinex(
  steamPath: string,
  gamePath: string,
  skipSteamShutdown = false
) {
  return invoke('install_bepinex', { steamPath, gamePath, skipSteamShutdown });
}

export async function uninstallBpp(steamPath: string, gamePath: string) {
  return invoke('uninstall_bpp', { steamPath, gamePath });
}

export async function repairBpp(gamePath: string) {
  return invoke('repair_bpp', { gamePath });
}

export async function getLegacyRecordDirectoryInfo(gamePath: string) {
  return invoke<LegacyRecordDirectoryInfo>('get_legacy_record_directory_info', {
    gamePath
  });
}

export async function patchLaunchOptions(
  steamPath: string,
  gamePath: string,
  skipSteamShutdown = false
) {
  return invoke<LaunchOptionsPatchResult>('patch_launch_options', {
    steamPath,
    gamePath,
    skipSteamShutdown
  });
}

export async function loadSupporters() {
  return invoke<SupportersResponse>('load_supporters');
}

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

export interface IdentityHttpResponse {
  status: number;
  body: string;
}

export async function postIdentityJson(
  url: string,
  bodyJson: string,
  authorization?: string
) {
  return invoke<IdentityHttpResponse>('post_identity_json', {
    url,
    bodyJson,
    authorization
  });
}
