import type { InstallerUpdateInfo } from '$lib/types';

export const DEFAULT_UPDATE_CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;

interface UpdateCheckResponse {
  ok?: boolean;
  latestVersion?: string;
  websiteUrl?: string;
  title?: string;
  message?: string;
}

interface CheckForInstallerUpdateOptions {
  endpoint: string;
  appVersion: string;
  installId: string;
  machineId: string;
  platform: string;
  osVersion: string;
  arch: string;
  locale: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

interface RunInstallerUpdateCheckOptions {
  endpoint: string;
  now?: number;
  getLastCheckedAt: () => number | null;
  persistLastCheckedAt: (timestamp: number) => void;
  getAppVersion: () => Promise<string | null>;
  getInstallId: () => string;
  getMachineId: () => Promise<string>;
  getClientMetadata: () => {
    platform: string;
    osVersion: string;
    arch: string;
    locale: string;
  };
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

interface UpdateCheckResult {
  updateInfo: InstallerUpdateInfo | null;
  requestSucceeded: boolean;
}

export function compareSemanticVersions(left: string, right: string): number {
  const leftSegments = normalizeVersionSegments(left);
  const rightSegments = normalizeVersionSegments(right);
  const maxLength = Math.max(leftSegments.length, rightSegments.length);

  for (let index = 0; index < maxLength; index += 1) {
    const delta = (leftSegments[index] ?? 0) - (rightSegments[index] ?? 0);
    if (delta !== 0) {
      return delta;
    }
  }

  return 0;
}

export function shouldCheckForInstallerUpdate(options: {
  now: number;
  lastCheckedAt: number | null;
  minIntervalMs?: number;
}): boolean {
  if (options.lastCheckedAt === null) {
    return true;
  }

  return options.now - options.lastCheckedAt >= (options.minIntervalMs ?? DEFAULT_UPDATE_CHECK_INTERVAL_MS);
}

export async function checkForInstallerUpdate(
  options: CheckForInstallerUpdateOptions
): Promise<InstallerUpdateInfo | null> {
  const result = await checkForInstallerUpdateResult(options);
  return result.updateInfo;
}

async function checkForInstallerUpdateResult(
  options: CheckForInstallerUpdateOptions
): Promise<UpdateCheckResult> {
  const endpoint = options.endpoint.trim();
  const appVersion = options.appVersion.trim();
  if (!endpoint || !appVersion) {
    return { updateInfo: null, requestSucceeded: false };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs ?? 1000);

  try {
    const response = await (options.fetchImpl ?? fetch)(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        installId: options.installId,
        machineId: options.machineId,
        appVersion,
        platform: options.platform,
        osVersion: options.osVersion,
        arch: options.arch,
        locale: options.locale
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      return { updateInfo: null, requestSucceeded: false };
    }

    const payload = await response.json() as UpdateCheckResponse;
    if (payload.ok === false) {
      return { updateInfo: null, requestSucceeded: false };
    }
    const latestVersion = payload.latestVersion?.trim();
    const websiteUrl = payload.websiteUrl?.trim();
    if (!latestVersion || !websiteUrl) {
      return { updateInfo: null, requestSucceeded: true };
    }

    if (compareSemanticVersions(latestVersion, appVersion) <= 0) {
      return { updateInfo: null, requestSucceeded: true };
    }

    return {
      updateInfo: {
        latestVersion,
        websiteUrl,
        title: payload.title?.trim() || null,
        message: payload.message?.trim() || null
      },
      requestSucceeded: true
    };
  } catch {
    return { updateInfo: null, requestSucceeded: false };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function runInstallerUpdateCheck(
  options: RunInstallerUpdateCheckOptions
): Promise<InstallerUpdateInfo | null> {
  const now = options.now ?? Date.now();
  const lastCheckedAt = options.getLastCheckedAt();
  if (!shouldCheckForInstallerUpdate({ now, lastCheckedAt })) {
    return null;
  }

  const appVersion = (await options.getAppVersion())?.trim() ?? '';
  if (!appVersion) {
    return null;
  }

  const metadata = options.getClientMetadata();
  const machineId = (await options.getMachineId())?.trim();
  if (!machineId) {
    return null;
  }
  const result = await checkForInstallerUpdateResult({
    endpoint: options.endpoint,
    appVersion,
    installId: options.getInstallId(),
    machineId,
    platform: metadata.platform,
    osVersion: metadata.osVersion,
    arch: metadata.arch,
    locale: metadata.locale,
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs
  });

  if (result.requestSucceeded) {
    options.persistLastCheckedAt(now);
  }

  return result.updateInfo;
}

export function resolveClientUpdateMetadata(): {
  platform: string;
  osVersion: string;
  arch: string;
  locale: string;
} {
  if (typeof navigator === 'undefined') {
    return {
      platform: 'unknown',
      osVersion: 'unknown',
      arch: 'unknown',
      locale: 'unknown'
    };
  }

  const userAgent = navigator.userAgent.toLowerCase();
  const userAgentData = (navigator as Navigator & {
    userAgentData?: {
      platform?: string;
      platformVersion?: string;
      architecture?: string;
    };
  }).userAgentData as {
    platform?: string;
    platformVersion?: string;
    architecture?: string;
  } | undefined;

  return {
    platform: userAgentData?.platform?.trim() || detectPlatformFromUserAgent(userAgent),
    osVersion: userAgentData?.platformVersion?.trim() || 'unknown',
    arch: userAgentData?.architecture?.trim() || 'unknown',
    locale: navigator.language?.trim() || 'unknown'
  };
}

function normalizeVersionSegments(version: string): number[] {
  return version
    .trim()
    .split('.')
    .map((segment) => Number.parseInt(segment, 10))
    .map((segment) => (Number.isFinite(segment) ? segment : 0));
}

function detectPlatformFromUserAgent(userAgent: string): string {
  if (userAgent.includes('mac os x') || userAgent.includes('macintosh')) {
    return 'macos';
  }

  if (userAgent.includes('windows')) {
    return 'windows';
  }

  if (userAgent.includes('linux')) {
    return 'linux';
  }

  return 'unknown';
}
