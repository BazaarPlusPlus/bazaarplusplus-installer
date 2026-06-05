import { test, expect } from 'vitest';

import {
  assertMacosLauncherScriptIsSafe,
  npmExecFileInvocation,
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
    'BepInEx/plugins/SixLabors.ImageSharp.dll',
    'BepInEx/plugins/System.Buffers.dll',
    'BepInEx/plugins/System.Memory.dll',
    'BepInEx/plugins/System.Numerics.Vectors.dll',
    'BepInEx/plugins/System.Text.Encoding.CodePages.dll',
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
    'BepInEx/plugins/SixLabors.ImageSharp.dll',
    'BepInEx/plugins/System.Buffers.dll',
    'BepInEx/plugins/System.Memory.dll',
    'BepInEx/plugins/System.Numerics.Vectors.dll',
    'BepInEx/plugins/System.Text.Encoding.CodePages.dll',
    'BepInEx/plugins/e_sqlite3.dll'
  ]);
});

test('macOS launcher check accepts safe codesign tempfile handling', () => {
  const script = [
    '_entitlements_file="$(mktemp "${TMPDIR:-/tmp}/bepinex_ents.XXXXXX")"',
    'trap cleanup_entitlements EXIT HUP INT TERM',
    'codesign --force --deep --sign - --entitlements "$_entitlements_file" "$app_path"'
  ].join('\n');

  expect(() => assertMacosLauncherScriptIsSafe(script)).not.toThrow();
});

test('macOS launcher check rejects the broken BSD mktemp template', () => {
  const script = [
    '_entitlements_file="$(mktemp /tmp/bepinex_ents.XXXXXX.plist)"',
    'trap cleanup_entitlements EXIT HUP INT TERM',
    'codesign --force --deep --sign - --entitlements "$_entitlements_file" "$app_path"'
  ].join('\n');

  expect(() => assertMacosLauncherScriptIsSafe(script)).toThrow(
    'mktemp /tmp/bepinex_ents.XXXXXX.plist'
  );
});

test('macOS launcher check rejects preemptive signature removal', () => {
  const script = [
    '_entitlements_file="$(mktemp "${TMPDIR:-/tmp}/bepinex_ents.XXXXXX")"',
    'trap cleanup_entitlements EXIT HUP INT TERM',
    'codesign --remove-signature "$app_path" 2>/dev/null || true',
    'codesign --force --deep --sign - --entitlements "$_entitlements_file" "$app_path"'
  ].join('\n');

  expect(() => assertMacosLauncherScriptIsSafe(script)).toThrow(
    'codesign --remove-signature'
  );
});

test('prebuild check invokes npm through cmd on Windows', () => {
  expect(
    npmExecFileInvocation(['run', 'generate:bindings'], 'win32', {
      ComSpec: 'C:\\Windows\\System32\\cmd.exe'
    })
  ).toEqual({
    command: 'C:\\Windows\\System32\\cmd.exe',
    args: ['/d', '/s', '/c', 'npm', 'run', 'generate:bindings']
  });
});
