export interface EnvironmentInfo {
  steam_path: string | null;
  steam_launch_options_supported: boolean;
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

export interface GameRunningInfo {
  running: boolean;
}

export interface LegacyRecordDirectoryInfo {
  total_bytes: number;
}

export type SupporterTierId = 1 | 2 | 3 | 4;

export interface SupporterEntry {
  name: string;
  tier: SupporterTierId;
}

export type SupportersSource = 'bundled' | 'cache' | 'remote';

export interface SupportersResponse {
  entries: SupporterEntry[];
  source: SupportersSource;
  fetchedAt: number | null;
  stale: boolean;
}

export interface StreamServiceStatus {
  running: boolean;
  host: string;
  port: number | null;
  overlay_url: string | null;
  using_fallback_port: boolean;
  last_error: string | null;
  started_at: string | null;
}

export interface StreamRecordSummary {
  id: string;
  title: string;
  subtitle: string;
  captured_at: string;
  image_url?: string | null;
  wins?: number | null;
  position?: number | null;
  battle_count?: number | null;
  rank?: string | null;
  rating?: number | null;
}

export interface StreamRecordWindowSummary {
  total: number;
  existing_before_start: number;
  captured_since_start: number;
}

export interface StreamOverlayCropSettings {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface StreamOverlayCropSettingsPayload {
  crop: StreamOverlayCropSettings;
  code: string;
}
