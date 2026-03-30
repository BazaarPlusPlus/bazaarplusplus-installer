import test from 'node:test';
import assert from 'node:assert/strict';

import { detectInstallerEnvironment } from './detect-flow.ts';

test('detectInstallerEnvironment keeps env null when environment detection fails', async () => {
  let resolveDotnet: ((value: { dotnet_version: string; dotnet_ok: boolean }) => void) | undefined;

  const resultPromise = detectInstallerEnvironment({
    requestedGamePath: 'C:\\Games\\The Bazaar',
    detectEnvironment: async () => {
      throw new Error('detect failed');
    },
    detectDotnetRuntime: () =>
      new Promise((resolve) => {
        resolveDotnet = resolve;
      }),
    verifyGamePath: async () => true
  });

  resolveDotnet?.({ dotnet_version: '9.0.1', dotnet_ok: true });
  const result = await resultPromise;

  assert.deepEqual(result, {
    env: null,
    dotnetState: 'idle',
    bazaarFound: false,
    bazaarInvalid: false
  });
});

test('detectInstallerEnvironment merges dotnet state into a successful environment result', async () => {
  const calls: string[] = [];

  const result = await detectInstallerEnvironment({
    requestedGamePath: 'D:\\Bazaar',
    detectEnvironment: async (gamePath) => {
      calls.push(`detect:${gamePath ?? ''}`);
      return {
        steam_path: 'C:\\Program Files (x86)\\Steam',
        steam_launch_options_supported: true,
        game_path: gamePath ?? null,
        dotnet_version: null,
        dotnet_ok: false,
        bepinex_installed: false,
        bpp_version: null,
        bundled_bpp_version: '2.0.0'
      };
    },
    detectDotnetRuntime: async () => {
      calls.push('dotnet');
      return {
        dotnet_version: '9.0.1',
        dotnet_ok: true
      };
    },
    verifyGamePath: async (path) => {
      calls.push(`verify:${path}`);
      return true;
    }
  });

  assert.deepEqual(calls, ['dotnet', 'detect:D:\\Bazaar', 'verify:D:\\Bazaar']);
  assert.deepEqual(result, {
    env: {
      steam_path: 'C:\\Program Files (x86)\\Steam',
      steam_launch_options_supported: true,
      game_path: 'D:\\Bazaar',
      dotnet_version: '9.0.1',
      dotnet_ok: true,
      bepinex_installed: false,
      bpp_version: null,
      bundled_bpp_version: '2.0.0'
    },
    dotnetState: 'found',
    bazaarFound: true,
    bazaarInvalid: false
  });
});
