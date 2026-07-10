import { invoke } from '@tauri-apps/api/core';
import type {
  AppBootstrap,
  AppLocalePayload,
  CleanupPreset,
  FileActionResult,
  GameDirectorySelection,
  HistoryRunDetail,
  HistoryRunList,
  InstallState,
  ResetBepinexResult,
  ResetBppDataResult,
  RunDataCleanupPreview,
  RunDataCleanupResult,
  ScreenshotCleanupPreview,
  ScreenshotCleanupResult,
  StreamOverlayCropSettingsPayload,
  StreamOverlayDisplayMode,
  StreamServiceStatus
} from '../types/backend';
import type { TauriCommandName } from '../types/generated/tauri-command-names';
import { hasTauriRuntime } from './runtime';
import { PREVIEW_FALLBACKS } from './previewFallbacks';

export interface TauriCommandMap {
  // Input object keys mirror Rust command parameters after Tauri's snake_case to
  // camelCase conversion, for example `game_path` -> `gamePath`.
  get_app_bootstrap: {
    input: undefined;
    output: AppBootstrap;
  };
  set_app_locale: {
    input: { locale: 'zh' | 'en' };
    output: AppLocalePayload;
  };
  get_install_state: {
    input: { gamePath?: string };
    output: InstallState;
  };
  choose_game_directory: {
    input: undefined;
    output: GameDirectorySelection;
  };
  install_mod: {
    input: { gamePath: string; compatOptIn: boolean };
    output: InstallState;
  };
  reset_bpp_data: {
    input: { gamePath: string };
    output: ResetBppDataResult;
  };
  reset_bepinex: {
    input: { gamePath: string };
    output: ResetBepinexResult;
  };
  uninstall_mod: {
    input: { gamePath: string };
    output: InstallState;
  };
  launch_game: {
    input: undefined;
    output: FileActionResult;
  };
  get_stream_status: {
    input: undefined;
    output: StreamServiceStatus;
  };
  ensure_stream_session: {
    input: { gamePath?: string };
    output: StreamServiceStatus;
  };
  restart_stream_session: {
    input: { gamePath?: string };
    output: StreamServiceStatus;
  };
  set_stream_window: {
    input: { gamePath?: string; offset: number };
    output: StreamServiceStatus;
  };
  get_overlay_settings: {
    input: undefined;
    output: StreamOverlayCropSettingsPayload;
  };
  apply_overlay_crop_code: {
    input: { code: string };
    output: StreamOverlayCropSettingsPayload;
  };
  save_overlay_display_mode: {
    input: { displayMode: StreamOverlayDisplayMode };
    output: StreamOverlayCropSettingsPayload;
  };
  reset_overlay_crop: {
    input: undefined;
    output: StreamOverlayCropSettingsPayload;
  };
  list_history_runs: {
    input: { gamePath?: string; limit?: number };
    output: HistoryRunList;
  };
  get_history_run_detail: {
    input: { gamePath?: string; runId: string };
    output: HistoryRunDetail;
  };
  reveal_run_screenshot: {
    input: { gamePath?: string; runId: string };
    output: void;
  };
  reveal_battle_video: {
    input: { gamePath?: string; battleId: string; videoId?: string };
    output: void;
  };
  delete_battle_video: {
    input: { gamePath?: string; battleId: string; videoId: string };
    output: HistoryRunDetail;
  };
  delete_run_videos: {
    input: {
      gamePath?: string;
      runId: string;
      limit?: number;
    };
    output: HistoryRunList;
  };
  preview_screenshot_cleanup: {
    input: { gamePath?: string; preset: CleanupPreset };
    output: ScreenshotCleanupPreview;
  };
  execute_screenshot_cleanup: {
    input: { gamePath?: string; preset: CleanupPreset };
    output: ScreenshotCleanupResult;
  };
  preview_run_data_cleanup: {
    input: { gamePath?: string; preset: CleanupPreset };
    output: RunDataCleanupPreview;
  };
  execute_run_data_cleanup: {
    input: { gamePath?: string; preset: CleanupPreset };
    output: RunDataCleanupResult;
  };
}

export type CommandName = Extract<TauriCommandName, keyof TauriCommandMap>;
export type CommandInput<K extends CommandName> = TauriCommandMap[K]['input'];
export type CommandOutput<K extends CommandName> = TauriCommandMap[K]['output'];
type CommandArgs<K extends CommandName> =
  undefined extends CommandInput<K>
    ? [payload?: Exclude<CommandInput<K>, undefined>]
    : [payload: CommandInput<K>];

async function invokeCommand<K extends CommandName>(
  name: K,
  ...args: CommandArgs<K>
): Promise<CommandOutput<K>> {
  try {
    const payload = args[0];
    if (payload === undefined) {
      return await invoke<CommandOutput<K>>(name);
    }
    return await invoke<CommandOutput<K>>(
      name,
      payload as Record<string, unknown>
    );
  } catch (error) {
    throw normalizeBackendError(error);
  }
}

type PreviewResult<K extends CommandName> =
  (typeof PREVIEW_FALLBACKS)[K] extends (...args: never[]) => infer R
    ? R
    : never;

export async function invokeOrFallback<K extends CommandName>(
  name: K,
  ...args: CommandArgs<K>
): Promise<CommandOutput<K> | PreviewResult<K>> {
  const entry = PREVIEW_FALLBACKS[name];
  if (entry !== 'invoke' && !hasTauriRuntime()) {
    // This is the single correlated-union cast at the runtime seam. Returning
    // shared objects directly preserves the existing preview identity behavior.
    return (entry as (input: CommandInput<K> | undefined) => PreviewResult<K>)(
      args[0] as CommandInput<K> | undefined
    );
  }
  return invokeCommand(name, ...args);
}

export function normalizeBackendError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === 'string') {
    return new Error(error);
  }
  return new Error('Backend command failed.');
}
