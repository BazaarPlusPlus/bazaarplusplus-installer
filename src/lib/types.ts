export type {
  BppDataIssue,
  DotnetInfo,
  EnvironmentInfo,
  GameRunningInfo,
  InstallerContextPayload,
  LaunchOptionsPatchResult,
  LegacyRecordDirectoryInfo,
  SteamRunningInfo,
  StreamDbPathInfo,
  StreamOverlayCropSettings,
  StreamOverlayCropSettingsPayload,
  StreamOverlayDisplayMode,
  StreamRecordSummary,
  StreamServiceStatus
} from './generated/commands';

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

export interface StreamRecordWindowSummary {
  total: number;
  existing_before_start: number;
  captured_since_start: number;
}
