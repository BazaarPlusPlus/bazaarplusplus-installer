import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  compareVersions,
  readBppDataVersionPolicy,
  requiredEntriesForPlatform
} from './prebuild-check.mjs';

test('macOS bundles BazaarPlusPlus SQLite dependencies', () => {
  assert.deepEqual(requiredEntriesForPlatform('macos'), [
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
  assert.deepEqual(requiredEntriesForPlatform('windows'), [
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
  assert.equal(compareVersions('2.9.9', '2.9.8'), 1);
  assert.equal(compareVersions('2.9', '2.9.0'), 0);
  assert.equal(compareVersions('2.8.9', '2.9.0'), -1);
  assert.equal(compareVersions('bad', '2.9.0'), null);
});

test('readBppDataVersionPolicy reads minimum supported version', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bpp-policy-'));
  fs.mkdirSync(path.join(rootDir, 'src-tauri', 'resources'), { recursive: true });
  fs.writeFileSync(
    path.join(rootDir, 'src-tauri', 'resources', 'BppDataVersionPolicy.json'),
    JSON.stringify({ minimum_supported_bpp_data_version: '2.9.0' }, null, 2)
  );

  const policy = readBppDataVersionPolicy(rootDir);

  assert.deepEqual(policy, { minimumSupported: '2.9.0' });
});
