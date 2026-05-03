import { test, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  compareVersions,
  readBppDataVersionPolicy,
  requiredEntriesForPlatform
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

test('compareVersions compares dotted numeric versions', () => {
  expect(compareVersions('2.9.9', '2.9.8')).toBe(1);
  expect(compareVersions('2.9', '2.9.0')).toBe(0);
  expect(compareVersions('2.8.9', '2.9.0')).toBe(-1);
  expect(compareVersions('bad', '2.9.0')).toBe(null);
});

test('readBppDataVersionPolicy reads current and minimum supported versions', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bpp-policy-'));
  fs.mkdirSync(path.join(rootDir, 'src-tauri', 'resources'), {
    recursive: true
  });
  fs.writeFileSync(
    path.join(rootDir, 'src-tauri', 'resources', 'BppDataVersionPolicy.json'),
    JSON.stringify(
      {
        current_bpp_data_version: '3.0.0',
        minimum_supported_bpp_data_version: '2.9.0'
      },
      null,
      2
    )
  );

  const policy = readBppDataVersionPolicy(rootDir);

  expect(policy).toEqual({
    currentVersion: '3.0.0',
    minimumSupported: '2.9.0'
  });
});

test('readBppDataVersionPolicy rejects minimum versions newer than current data version', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bpp-policy-'));
  fs.mkdirSync(path.join(rootDir, 'src-tauri', 'resources'), {
    recursive: true
  });
  fs.writeFileSync(
    path.join(rootDir, 'src-tauri', 'resources', 'BppDataVersionPolicy.json'),
    JSON.stringify(
      {
        current_bpp_data_version: '2.9.0',
        minimum_supported_bpp_data_version: '3.0.0'
      },
      null,
      2
    )
  );

  expect(() => readBppDataVersionPolicy(rootDir)).toThrow(
    /minimum_supported_bpp_data_version=3\.0\.0 cannot exceed current_bpp_data_version=2\.9\.0/
  );
});
