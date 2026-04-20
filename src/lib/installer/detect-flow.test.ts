import { test, expect } from 'vitest';

import { detectInstallerEnvironment } from './detect-flow.ts';

test('detectInstallerEnvironment keeps env null when environment detection fails', async () => {
  const result = await detectInstallerEnvironment({
    requestedGamePath: 'C:\\Games\\The Bazaar',
    detectEnvironment: async () => {
      throw new Error('detect failed');
    },
    verifyGamePath: async () => true
  });

  expect(result).toEqual({
    env: null,
    dotnetState: 'idle',
    bazaarFound: false,
    bazaarInvalid: false
  });
});

test('detectInstallerEnvironment derives dotnet state from environment response', async () => {
  const calls: string[] = [];

  const result = await detectInstallerEnvironment({
    requestedGamePath: 'D:\\Bazaar',
    detectEnvironment: async (gamePath) => {
      calls.push(`detect:${gamePath ?? ''}`);
      return {
        steam_path: 'C:\\Program Files (x86)\\Steam',
        steam_launch_options_supported: true,
        game_path: gamePath ?? null,
        dotnet_version: '9.0.1',
        dotnet_ok: true,
        bepinex_installed: false,
        bpp_version: null,
        bundled_bpp_version: '2.0.0',
        bpp_data_version: '1',
        bpp_data_reset_required: false,
        bpp_data_issue: null
      };
    },
    verifyGamePath: async (path) => {
      calls.push(`verify:${path}`);
      return true;
    }
  });

  expect(calls).toEqual(['detect:D:\\Bazaar', 'verify:D:\\Bazaar']);
  expect(result).toEqual({
    env: {
      steam_path: 'C:\\Program Files (x86)\\Steam',
      steam_launch_options_supported: true,
      game_path: 'D:\\Bazaar',
      dotnet_version: '9.0.1',
      dotnet_ok: true,
      bepinex_installed: false,
      bpp_version: null,
      bundled_bpp_version: '2.0.0',
      bpp_data_version: '1',
      bpp_data_reset_required: false,
      bpp_data_issue: null
    },
    dotnetState: 'found',
    bazaarFound: true,
    bazaarInvalid: false
  });
});

test('detectInstallerEnvironment reports not_found dotnet state when runtime missing', async () => {
  const result = await detectInstallerEnvironment({
    requestedGamePath: null,
    detectEnvironment: async () => ({
      steam_path: null,
      steam_launch_options_supported: false,
      game_path: null,
      dotnet_version: null,
      dotnet_ok: false,
      bepinex_installed: false,
      bpp_version: null,
      bundled_bpp_version: null,
      bpp_data_version: null,
      bpp_data_reset_required: false,
      bpp_data_issue: null
    }),
    verifyGamePath: async () => false
  });

  expect(result.dotnetState).toBe('not_found');
  expect(result.bazaarFound).toBe(false);
  expect(result.bazaarInvalid).toBe(false);
});
