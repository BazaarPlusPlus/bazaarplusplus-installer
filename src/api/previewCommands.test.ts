import { describe, expect, it } from 'vitest';
import { commandClient } from './commandClient';
import {
  defaultCropSettings,
  emptyHistoryRunList,
  emptyInstallState,
  fallbackBootstrap,
  idleStreamStatus
} from './previewDefaults';

describe('browser-preview command adapter', () => {
  it('returns the shared seed references', async () => {
    expect(await commandClient.getInstallState(null)).toBe(emptyInstallState);
    expect(await commandClient.getStreamStatus()).toBe(idleStreamStatus);
    expect(await commandClient.ensureStreamSession(null)).toBe(
      idleStreamStatus
    );
    expect(await commandClient.restartStreamSession(null)).toBe(
      idleStreamStatus
    );
    expect(await commandClient.setStreamWindow(null, 3)).toBe(idleStreamStatus);
    expect(await commandClient.getOverlaySettings()).toBe(defaultCropSettings);
    expect(await commandClient.resetOverlayCrop()).toBe(defaultCropSettings);
    expect(await commandClient.listHistoryRuns(null, null)).toBe(
      emptyHistoryRunList
    );
    expect(await commandClient.getAppBootstrap()).toBe(fallbackBootstrap);
  });

  it('reproduces input-dependent overlay fallbacks', async () => {
    expect(await commandClient.applyOverlayCropCode('x')).toEqual({
      ...defaultCropSettings,
      code: 'x'
    });
    expect(await commandClient.saveOverlayDisplayMode('hero')).toEqual({
      ...defaultCropSettings,
      display_mode: 'hero'
    });
  });

  it('returns inline preview literals', async () => {
    expect(await commandClient.chooseGameDirectory()).toEqual({
      game_path: null
    });
    expect(await commandClient.launchGame()).toEqual({ ok: true });
  });

  it('preserves nullable desktop-only preview results', async () => {
    const preset = 'all';
    expect(await commandClient.getHistoryRunDetail(null, 'r')).toBeNull();
    expect(await commandClient.deleteBattleVideo(null, 'b', 'v')).toBeNull();
    expect(
      await commandClient.previewScreenshotCleanup(null, preset)
    ).toBeNull();
    expect(
      await commandClient.executeScreenshotCleanup(null, preset)
    ).toBeNull();
    expect(await commandClient.previewRunDataCleanup(null, preset)).toBeNull();
    expect(await commandClient.executeRunDataCleanup(null, preset)).toBeNull();
  });

  it('returns typed locale state and null for Tauri unit-returning no-ops', async () => {
    expect(await commandClient.setAppLocale('en')).toEqual({ locale: 'en' });
    expect(await commandClient.revealRunScreenshot(null, 'r')).toBeNull();
    expect(await commandClient.revealBattleVideo(null, 'b', null)).toBeNull();
  });

  it('keeps preview bootstrap and install gates wired to real defaults', () => {
    expect(fallbackBootstrap.app_version).toBe(__FRONTEND_VERSION__);
    expect(fallbackBootstrap.bundled_bpp_version).toBeNull();
    expect(fallbackBootstrap.links).toBeTruthy();
    expect(emptyInstallState.selected_game_path).toBeNull();
    expect(emptyInstallState.has_resettable_data).toBe(false);
    expect(emptyInstallState.has_bepinex_files).toBe(false);
  });

  it('passes native-only preview commands through to the normalized client', async () => {
    await expect(commandClient.installMod('x', false)).rejects.toBeInstanceOf(
      Error
    );
  });
});
