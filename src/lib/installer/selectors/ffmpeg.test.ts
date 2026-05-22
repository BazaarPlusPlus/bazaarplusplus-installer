import { test, expect } from 'vitest';

import { selectFfmpegDisplay } from './ffmpeg.ts';
import type { FfmpegDetectResult } from '$lib/generated/commands';

function detect(
  status: FfmpegDetectResult['status'],
  bundledPath = '/games/Bazaar/BazaarPlusPlus/tools/ffmpeg/ffmpeg'
): FfmpegDetectResult {
  return { status, bundled_path: bundledPath };
}

test('returns platform_unsupported irrespective of detect status when platform unsupported', () => {
  const display = selectFfmpegDisplay({
    detect: detect({ kind: 'not_installed' }),
    platformSupported: false
  });
  expect(display.primaryAction).toBe('platform_unsupported');
  expect(display.tag).toBe('idle');
});

test('returns install when nothing detected', () => {
  const display = selectFfmpegDisplay({
    detect: null,
    platformSupported: true
  });
  expect(display.primaryAction).toBe('install');
  expect(display.tag).toBe('idle');
});

test('returns reinstall when a bundled binary is already ready', () => {
  const display = selectFfmpegDisplay({
    detect: detect({ kind: 'bundled', version: '7.1' }),
    platformSupported: true
  });
  expect(display.primaryAction).toBe('reinstall');
  expect(display.tag).toBe('ok');
});

test('returns repair when bundled but corrupted', () => {
  const display = selectFfmpegDisplay({
    detect: detect({ kind: 'bundled_corrupted', reason: 'crash' }),
    platformSupported: true
  });
  expect(display.primaryAction).toBe('repair');
  expect(display.tag).toBe('danger');
});

test('returns override_install when system ffmpeg already on PATH', () => {
  const display = selectFfmpegDisplay({
    detect: detect({ kind: 'system_available' }),
    platformSupported: true
  });
  expect(display.primaryAction).toBe('override_install');
  expect(display.tag).toBe('warn');
});
