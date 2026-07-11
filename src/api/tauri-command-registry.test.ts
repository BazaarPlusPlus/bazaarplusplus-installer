import { describe, expect, it } from 'vitest';

import type { TauriCommandMap } from './tauri';
import {
  TAURI_COMMAND_NAMES,
  type TauriCommandName
} from '../types/generated/tauri-command-names';

type InputFieldChecklist = {
  [K in TauriCommandName]: readonly (keyof NonNullable<
    TauriCommandMap[K]['input']
  > &
    string)[];
};

const COMMAND_INPUT_FIELDS = {
  get_app_bootstrap: [],
  set_app_locale: ['locale'],
  get_install_state: ['gamePath'],
  choose_game_directory: [],
  install_mod: ['gamePath'],
  reset_bpp_data: ['gamePath'],
  reset_bepinex: ['gamePath'],
  uninstall_mod: ['gamePath'],
  launch_game: [],
  get_stream_status: [],
  ensure_stream_session: ['gamePath'],
  restart_stream_session: ['gamePath'],
  set_stream_window: ['gamePath', 'offset'],
  get_overlay_settings: [],
  save_overlay_display_mode: ['displayMode'],
  apply_overlay_crop_code: ['code'],
  reset_overlay_crop: [],
  list_history_runs: ['gamePath', 'limit'],
  get_history_run_detail: ['gamePath', 'runId'],
  reveal_run_screenshot: ['gamePath', 'runId'],
  reveal_battle_video: ['gamePath', 'battleId', 'videoId'],
  delete_battle_video: ['gamePath', 'battleId', 'videoId'],
  delete_run_videos: ['gamePath', 'runId', 'limit'],
  preview_screenshot_cleanup: ['gamePath', 'preset'],
  execute_screenshot_cleanup: ['gamePath', 'preset'],
  preview_run_data_cleanup: ['gamePath', 'preset'],
  execute_run_data_cleanup: ['gamePath', 'preset']
} satisfies InputFieldChecklist;

describe('Tauri command registry', () => {
  it('every registered command has a TauriCommandMap entry', () => {
    for (const name of TAURI_COMMAND_NAMES) {
      type AssertMapped = typeof name extends keyof TauriCommandMap
        ? true
        : false;
      const mapped: AssertMapped = true;
      expect(mapped).toBe(true);
    }
  });

  it('tracks command input fields against the frontend command map', () => {
    expect(Object.keys(COMMAND_INPUT_FIELDS)).toEqual([...TAURI_COMMAND_NAMES]);
  });
});
