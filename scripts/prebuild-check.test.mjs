import { test, expect } from 'vitest';

import {
  requiredEntriesForPlatform,
  requiredFfmpegEntryForPlatform,
  sharedBundledFfmpegLicensePath,
  sharedBundledFfmpegZipPath
} from './prebuild-check.mjs';

test('macOS bundles BazaarPlusPlus SQLite dependencies', () => {
  expect(requiredEntriesForPlatform('macos')).toEqual([
    'run_bepinex.sh',
    'libdoorstop.dylib',
    'BepInEx/plugins/BazaarPlusPlus.dll',
    'BepInEx/plugins/BazaarPlusPlus.version',
    'BepInEx/plugins/Microsoft.Data.Sqlite.dll',
    'BepInEx/plugins/SQLitePCLRaw.batteries_v2.dll',
    'BepInEx/plugins/SQLitePCLRaw.core.dll',
    'BepInEx/plugins/SQLitePCLRaw.provider.e_sqlite3.dll',
    'BepInEx/plugins/libe_sqlite3.dylib'
  ]);
});

test('Windows bundles BazaarPlusPlus SQLite dependencies', () => {
  expect(requiredEntriesForPlatform('windows')).toEqual([
    'winhttp.dll',
    'doorstop_config.ini',
    'BepInEx/plugins/BazaarPlusPlus.dll',
    'BepInEx/plugins/BazaarPlusPlus.version',
    'BepInEx/plugins/Microsoft.Data.Sqlite.dll',
    'BepInEx/plugins/SQLitePCLRaw.batteries_v2.dll',
    'BepInEx/plugins/SQLitePCLRaw.core.dll',
    'BepInEx/plugins/SQLitePCLRaw.provider.e_sqlite3.dll',
    'BepInEx/plugins/e_sqlite3.dll'
  ]);
});

test('FFmpeg resources use one bundled runtime path per platform', () => {
  expect(sharedBundledFfmpegZipPath).toBe('FfmpegSource/ffmpeg.zip');
  expect(sharedBundledFfmpegLicensePath).toBe('FfmpegSource/LICENSE.txt');
  expect(requiredFfmpegEntryForPlatform('windows')).toBe('ffmpeg.exe');
  expect(requiredFfmpegEntryForPlatform('macos')).toBe('ffmpeg');
});

test('FFmpeg resources reject unsupported platforms', () => {
  expect(() => requiredFfmpegEntryForPlatform('linux')).toThrow(
    'Unsupported FFmpeg platform: linux'
  );
});
