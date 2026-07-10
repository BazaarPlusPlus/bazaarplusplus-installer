import type { CommandInput, CommandName, CommandOutput } from './tauri';
import type { TauriCommandName } from '../types/generated/tauri-command-names';
import {
  defaultCropSettings,
  emptyHistoryRunList,
  emptyInstallState,
  fallbackBootstrap,
  idleStreamStatus
} from './previewDefaults';

/** Commands whose desktop-only preview fallback resolves null. Keeping this
 * union explicit prevents unrelated command fallbacks from silently widening. */
type NullFallbackCommand =
  | 'get_history_run_detail'
  | 'delete_battle_video'
  | 'preview_screenshot_cleanup'
  | 'execute_screenshot_cleanup'
  | 'preview_run_data_cleanup'
  | 'execute_run_data_cleanup';

/** set_app_locale historically returned undefined outside Tauri; its caller
 * discards the result while preserving the frontend locale switch. */
type UndefinedFallbackCommand = 'set_app_locale';

type PreviewReturn<K extends CommandName> =
  | CommandOutput<K>
  | (K extends NullFallbackCommand ? null : never)
  | (K extends UndefinedFallbackCommand ? undefined : never);

/** Keying this type on the generated union makes a newly generated command a
 * compile error until both its command-map and preview behavior are declared. */
type PreviewFallbackEntry<K extends TauriCommandName> = K extends CommandName
  ? ((input: CommandInput<K>) => PreviewReturn<K>) | 'invoke'
  : { 'add a TauriCommandMap entry in src/api/tauri.ts first': K };

type PreviewFallbackTable = {
  readonly [K in TauriCommandName]: PreviewFallbackEntry<K>;
};

/**
 * Browser-preview behavior for every Tauri command.
 * Function entries resolve fallback values without cloning shared defaults.
 * The shared identity lets React skip redundant state updates during polling.
 * 'invoke' entries intentionally pass through to the native invoke path; the
 * install entries are gated by emptyInstallState's falsy fields, while
 * delete_run_videos currently has no frontend caller.
 */
export const PREVIEW_FALLBACKS = {
  get_app_bootstrap: () => fallbackBootstrap,
  set_app_locale: () => undefined,
  get_install_state: () => emptyInstallState,
  choose_game_directory: () => ({ game_path: null }),
  install_mod: 'invoke',
  reset_bpp_data: 'invoke',
  reset_bepinex: 'invoke',
  uninstall_mod: 'invoke',
  launch_game: () => ({ ok: true }),
  get_stream_status: () => idleStreamStatus,
  ensure_stream_session: () => idleStreamStatus,
  restart_stream_session: () => idleStreamStatus,
  set_stream_window: () => idleStreamStatus,
  get_overlay_settings: () => defaultCropSettings,
  save_overlay_display_mode: ({ displayMode }) => ({
    ...defaultCropSettings,
    display_mode: displayMode
  }),
  apply_overlay_crop_code: ({ code }) => ({ ...defaultCropSettings, code }),
  reset_overlay_crop: () => defaultCropSettings,
  list_history_runs: () => emptyHistoryRunList,
  get_history_run_detail: () => null,
  reveal_run_screenshot: () => undefined,
  reveal_battle_video: () => undefined,
  delete_battle_video: () => null,
  delete_run_videos: 'invoke',
  preview_screenshot_cleanup: () => null,
  execute_screenshot_cleanup: () => null,
  preview_run_data_cleanup: () => null,
  execute_run_data_cleanup: () => null
} satisfies PreviewFallbackTable;
