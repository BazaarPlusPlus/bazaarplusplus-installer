import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test, expect } from 'vitest';

import {
  assertMacosLauncherScriptIsSafe,
  assertMacosTrampolineStub,
  assertMacosTrampolineStubWith,
  macosTrampolineStubPath
} from './prebuild-check.mjs';

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
  expect(() => assertMacosTrampolineStubWith(root, () => 'ASCII text')).toThrow(
    'not arm64 Mach-O'
  );
});
