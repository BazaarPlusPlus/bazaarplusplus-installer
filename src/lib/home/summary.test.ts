import test from 'node:test';
import assert from 'node:assert/strict';

import { createHomeSummary } from './summary.ts';

test('createHomeSummary marks stream mode active when service is running', () => {
  const summary = createHomeSummary({
    env: {
      steam_path: 'C:/Steam',
      steam_launch_options_supported: true,
      game_path: 'C:/Games/The Bazaar',
      dotnet_version: '9.0.0',
      dotnet_ok: true,
      bepinex_installed: true,
      bpp_version: '2.3.7',
      bundled_bpp_version: '2.3.7',
      bpp_data_version: '1',
      bpp_data_reset_required: false,
      bpp_data_issue: null
    },
    streamStatus: {
      running: true,
      host: '127.0.0.1',
      port: 17654,
      overlay_url: 'http://127.0.0.1:17654/overlay',
      using_fallback_port: false,
      last_error: null,
      started_at: '2026-04-11T21:00:00+08:00',
      active_from: '2026-04-11T21:00:00+08:00',
      active_window_offset: 0
    }
  });

  assert.equal(summary.stream.tone, 'active');
  assert.match(summary.stream.detail, /17654/);
});

test('createHomeSummary shows install guidance when BazaarPlusPlus is missing', () => {
  const summary = createHomeSummary({
    env: null,
    streamStatus: {
      running: false,
      host: '127.0.0.1',
      port: null,
      overlay_url: null,
      using_fallback_port: false,
      last_error: null,
      started_at: null,
      active_from: null,
      active_window_offset: 0
    }
  });

  assert.equal(summary.install.tone, 'idle');
  assert.match(summary.install.detail, /Install & Repair/);
});
