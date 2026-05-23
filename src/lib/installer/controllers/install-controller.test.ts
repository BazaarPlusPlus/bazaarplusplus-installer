import { get } from 'svelte/store';
import { expect, test } from 'vitest';

import { createInstallController } from './install-controller.ts';
import type {
  EnvironmentInfo,
  InstallerContextPayload,
  LaunchOptionsPatchResult,
  LegacyRecordDirectoryInfo,
  SteamRunningInfo
} from '../../types.ts';

function createEnvironment(): EnvironmentInfo {
  return {
    game_path: '/games/The Bazaar',
    game_path_valid: true,
    steam_path: '/steam',
    steam_launch_options_supported: false,
    dotnet_version: '8.0.0',
    dotnet_ok: true,
    bepinex_installed: false,
    bpp_version: null,
    bundled_bpp_version: '3.3.0'
  };
}

function createController(
  overrides: {
    installBepinex?: (
      steamPath: string,
      gamePath: string,
      skipSteamShutdown: boolean
    ) => Promise<unknown>;
    installFfmpegApi?: (gamePath: string) => Promise<unknown>;
    detectEnvironmentApi?: (
      requestedGamePath?: string
    ) => Promise<EnvironmentInfo>;
  } = {}
) {
  const installState = {
    bepinexInstalled: false,
    ffmpegBinaryPath: ''
  };
  const env = createEnvironment();
  const controller = createInstallController({
    hasTauriRuntime: () => true,
    isDebugInstallPreview: false,
    createInstallDebugEnvironment: createEnvironment,
    initializeInstallerContextApi:
      async (): Promise<InstallerContextPayload> => ({
        bundled_bpp_version: '3.3.0',
        dotnet_version: '8.0.0',
        dotnet_ok: true
      }),
    detectEnvironmentApi:
      overrides.detectEnvironmentApi ??
      (async () => ({
        ...env,
        bepinex_installed: true,
        bpp_version: env.bundled_bpp_version
      })),
    detectSteamRunningApi: async (): Promise<SteamRunningInfo> => ({
      running: false
    }),
    closeSteamApi: async () => undefined,
    installBepinex:
      overrides.installBepinex ??
      (async (_steamPath, _gamePath, _skipSteamShutdown) => {
        installState.bepinexInstalled = true;
      }),
    installFfmpegApi:
      overrides.installFfmpegApi ??
      (async (gamePath) => {
        if (!installState.bepinexInstalled) {
          throw new Error('BepInEx must be installed before FFmpeg');
        }
        installState.ffmpegBinaryPath = `${gamePath}/BazaarPlusPlus/tools/ffmpeg/ffmpeg`;
      }),
    patchLaunchOptions: async (): Promise<LaunchOptionsPatchResult> => ({
      verified: true
    }),
    uninstallBppApi: async () => undefined,
    repairBppApi: async () => undefined,
    getLegacyRecordDirectoryInfoApi:
      async (): Promise<LegacyRecordDirectoryInfo> => ({
        total_bytes: 0
      }),
    openUrl: async () => undefined,
    openDialog: async () => null,
    getInstallRuntimeRisks: () => [],
    shouldShowInstallRiskModal: () => false,
    persistCustomGamePath: () => undefined,
    persistDetectedGamePath: () => undefined,
    localized: (zh) => zh,
    t: (key) => key,
    formatByteLabel: (bytes) => `${bytes} B`
  });

  controller.env.set(env);
  controller.installAcknowledged.set(true);

  return { controller, installState };
}

test('confirmed install deploys bundled FFmpeg into the game tools directory', async () => {
  const { controller, installState } = createController();

  await controller.confirmInstall({
    canInstall: true,
    effectiveGamePath: '/games/The Bazaar',
    selectedPath: null
  });

  expect(installState.ffmpegBinaryPath).toBe(
    '/games/The Bazaar/BazaarPlusPlus/tools/ffmpeg/ffmpeg'
  );
  expect(get(controller.actionBusy)).toBe('idle');
});
