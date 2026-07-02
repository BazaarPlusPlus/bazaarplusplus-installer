import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test, expect } from 'vitest';

import {
  assertMacosLauncherScriptIsSafe,
  assertMacosTrampolineStub,
  macosTrampolineStubPath,
  npmExecFileInvocation,
  payloadFilesForPlatform
} from './prebuild-check.mjs';

test('payload manifest is derived from the SourceForBuild tree', () => {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'bpp-payload-'));
  const platformRoot = path.join(
    rootDir,
    'src-tauri',
    'resources',
    'SourceForBuild',
    'windows'
  );
  mkdirSync(path.join(platformRoot, 'BepInEx', 'plugins'), { recursive: true });
  writeFileSync(path.join(platformRoot, 'winhttp.dll'), 'x');
  writeFileSync(
    path.join(platformRoot, 'BepInEx', 'plugins', 'BazaarPlusPlus.dll'),
    'x'
  );
  writeFileSync(
    path.join(platformRoot, 'BepInEx', 'plugins', 'NewDependency.dll'),
    'x'
  );

  expect(payloadFilesForPlatform(rootDir, 'windows')).toEqual([
    'BepInEx/plugins/BazaarPlusPlus.dll',
    'BepInEx/plugins/NewDependency.dll',
    'winhttp.dll'
  ]);
});

test('payload manifest rejects stray OS artifacts that would ship to users', () => {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'bpp-payload-'));
  const platformRoot = path.join(
    rootDir,
    'src-tauri',
    'resources',
    'SourceForBuild',
    'windows'
  );
  mkdirSync(path.join(platformRoot, 'BepInEx', 'plugins'), { recursive: true });
  writeFileSync(path.join(platformRoot, 'winhttp.dll'), 'x');
  writeFileSync(path.join(platformRoot, 'BepInEx', '.DS_Store'), 'x');

  expect(() => payloadFilesForPlatform(rootDir, 'windows')).toThrow(
    /OS artifact/
  );
});

test('real SourceForBuild trees include the core payload files', () => {
  const repoRoot = process.cwd();
  const macos = payloadFilesForPlatform(repoRoot, 'macos');
  const windows = payloadFilesForPlatform(repoRoot, 'windows');
  expect(macos).toContain('BepInEx/plugins/BazaarPlusPlus.dll');
  expect(macos).toContain('run_bepinex.sh');
  expect(windows).toContain('BepInEx/plugins/BazaarPlusPlus.dll');
  expect(windows).toContain('winhttp.dll');
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

test('trampoline stub check fails loudly when the compiled stub is missing', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'bpp-stub-'));
  expect(() => assertMacosTrampolineStub(root)).toThrow(
    'Missing compiled macOS trampoline stub'
  );
});

test('trampoline stub check rejects a non-Mach-O stub', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'bpp-stub-'));
  const stubPath = macosTrampolineStubPath(root);
  mkdirSync(path.dirname(stubPath), { recursive: true });
  writeFileSync(stubPath, 'not a mach-o binary');
  expect(() => assertMacosTrampolineStub(root)).toThrow('not arm64 Mach-O');
});
