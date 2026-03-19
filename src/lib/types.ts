export interface EnvironmentInfo {
  steam_path: string | null;
  game_path: string | null;
  dotnet_version: string | null;
  dotnet_ok: boolean;
  bepinex_installed: boolean;
  bpp_version: string | null;
  bundled_bpp_version: string | null;
}

export interface DotnetInfo {
  dotnet_version: string | null;
  dotnet_ok: boolean;
}

export interface LaunchOptionsPatchResult {
  verified: boolean;
}

export interface SteamRunningInfo {
  running: boolean;
}

export type SupporterTierId = 1 | 2 | 3 | 4;

export interface SupporterEntry {
  name: string;
  tier: SupporterTierId;
  amount: number;
}

export type SupportersSource = 'bundled' | 'cache' | 'remote';

export interface SupportersResponse {
  entries: SupporterEntry[];
  source: SupportersSource;
  fetchedAt: number | null;
  stale: boolean;
}
