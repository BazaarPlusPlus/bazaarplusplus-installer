import type { EnvironmentInfo } from '$lib/types';
import type { StepState } from '$lib/installer/state';

function debugDetectLog(message: string, payload: Record<string, unknown>) {
  if (!import.meta.env?.DEV) return;
  console.debug(`[detect-flow] ${message}`, payload);
}

export interface DetectInstallerEnvironmentOptions {
  requestedGamePath: string | null;
  detectEnvironment: (gamePath?: string) => Promise<EnvironmentInfo>;
  verifyGamePath: (path: string) => Promise<boolean>;
}

export interface DetectInstallerEnvironmentResult {
  env: EnvironmentInfo | null;
  dotnetState: StepState;
  bazaarFound: boolean;
  bazaarInvalid: boolean;
}

function resolveDotnetState(env: EnvironmentInfo | null): StepState {
  if (!env) {
    return 'idle';
  }
  return env.dotnet_ok ? 'found' : 'not_found';
}

async function resolveBazaarState(
  requestedGamePath: string | null,
  detectedGamePath: string | null,
  verifyGamePath: (path: string) => Promise<boolean>
): Promise<
  Pick<DetectInstallerEnvironmentResult, 'bazaarFound' | 'bazaarInvalid'>
> {
  const pathToVerify = requestedGamePath ?? detectedGamePath;
  if (!pathToVerify) {
    debugDetectLog('skip verify: no path available', {
      requestedGamePath,
      detectedGamePath
    });
    return {
      bazaarFound: false,
      bazaarInvalid: false
    };
  }

  const bazaarFound = await verifyGamePath(pathToVerify);
  debugDetectLog('verify_game_path resolved', {
    requestedGamePath,
    detectedGamePath,
    pathToVerify,
    bazaarFound
  });
  return {
    bazaarFound,
    bazaarInvalid: !bazaarFound
  };
}

export async function detectInstallerEnvironment(
  options: DetectInstallerEnvironmentOptions
): Promise<DetectInstallerEnvironmentResult> {
  try {
    const env = await options.detectEnvironment(
      options.requestedGamePath ?? undefined
    );
    debugDetectLog('detect_environment resolved', {
      requestedGamePath: options.requestedGamePath,
      env
    });
    const bazaarState = await resolveBazaarState(
      options.requestedGamePath,
      env.game_path,
      options.verifyGamePath
    );

    debugDetectLog('combined detection result', {
      requestedGamePath: options.requestedGamePath,
      env,
      bazaarState
    });

    return {
      env,
      dotnetState: resolveDotnetState(env),
      bazaarFound: bazaarState.bazaarFound,
      bazaarInvalid: bazaarState.bazaarInvalid
    };
  } catch (error) {
    debugDetectLog('detect_environment failed', {
      requestedGamePath: options.requestedGamePath,
      error: error instanceof Error ? error.message : String(error)
    });
    return {
      env: null,
      dotnetState: 'idle',
      bazaarFound: false,
      bazaarInvalid: false
    };
  }
}
