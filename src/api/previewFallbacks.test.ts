import { describe, expect, it } from 'vitest';
import { invokeOrFallback } from './tauri';
import {
  defaultCropSettings,
  emptyHistoryRunList,
  emptyInstallState,
  fallbackBootstrap,
  idleStreamStatus
} from './previewDefaults';

describe('browser-preview fallbacks', () => {
  it('returns the shared seed references', async () => {
    expect(await invokeOrFallback('get_install_state', {})).toBe(
      emptyInstallState
    );
    expect(await invokeOrFallback('get_stream_status')).toBe(idleStreamStatus);
    expect(await invokeOrFallback('ensure_stream_session', {})).toBe(
      idleStreamStatus
    );
    expect(await invokeOrFallback('restart_stream_session', {})).toBe(
      idleStreamStatus
    );
    expect(await invokeOrFallback('set_stream_window', { offset: 3 })).toBe(
      idleStreamStatus
    );
    expect(await invokeOrFallback('get_overlay_settings')).toBe(
      defaultCropSettings
    );
    expect(await invokeOrFallback('reset_overlay_crop')).toBe(
      defaultCropSettings
    );
    expect(await invokeOrFallback('list_history_runs', {})).toBe(
      emptyHistoryRunList
    );
    expect(await invokeOrFallback('get_app_bootstrap')).toBe(fallbackBootstrap);
  });

  it('reproduces the input-dependent overlay fallbacks', async () => {
    expect(
      await invokeOrFallback('apply_overlay_crop_code', { code: 'x' })
    ).toEqual({ ...defaultCropSettings, code: 'x' });
    expect(
      await invokeOrFallback('save_overlay_display_mode', {
        displayMode: 'hero'
      })
    ).toEqual({ ...defaultCropSettings, display_mode: 'hero' });
  });

  it('returns the inline literals', async () => {
    expect(await invokeOrFallback('choose_game_directory')).toEqual({
      game_path: null
    });
    expect(await invokeOrFallback('launch_game')).toEqual({ ok: true });
  });

  it('resolves null for desktop-only data commands', async () => {
    const preset = 'all';
    expect(
      await invokeOrFallback('get_history_run_detail', { runId: 'r' })
    ).toBeNull();
    expect(
      await invokeOrFallback('delete_battle_video', {
        battleId: 'b',
        videoId: 'v'
      })
    ).toBeNull();
    expect(
      await invokeOrFallback('preview_screenshot_cleanup', { preset })
    ).toBeNull();
    expect(
      await invokeOrFallback('execute_screenshot_cleanup', { preset })
    ).toBeNull();
    expect(
      await invokeOrFallback('preview_run_data_cleanup', { preset })
    ).toBeNull();
    expect(
      await invokeOrFallback('execute_run_data_cleanup', { preset })
    ).toBeNull();
  });

  it('resolves undefined for the silent no-ops', async () => {
    expect(
      await invokeOrFallback('set_app_locale', { locale: 'en' })
    ).toBeUndefined();
    expect(
      await invokeOrFallback('reveal_run_screenshot', { runId: 'r' })
    ).toBeUndefined();
    expect(
      await invokeOrFallback('reveal_battle_video', { battleId: 'b' })
    ).toBeUndefined();
  });

  it('keeps fallbackBootstrap wired to the Vite define and bundled resource', () => {
    expect(fallbackBootstrap.app_version).toBe(__FRONTEND_VERSION__);
    expect(fallbackBootstrap.bundled_bpp_version).toBeNull();
    expect(fallbackBootstrap.links).toBeTruthy();
  });

  it('keeps the install command preview gates false', () => {
    expect(emptyInstallState.selected_game_path).toBeNull();
    expect(emptyInstallState.has_resettable_data).toBe(false);
    expect(emptyInstallState.has_bepinex_files).toBe(false);
  });

  it("passes 'invoke' commands through to invoke without a runtime", async () => {
    await expect(
      invokeOrFallback('install_mod', {
        gamePath: 'x',
        compatOptIn: false
      })
    ).rejects.toBeInstanceOf(Error);
  });
});
