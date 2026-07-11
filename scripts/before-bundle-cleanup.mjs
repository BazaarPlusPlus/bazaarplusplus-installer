import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  RELEASE_PLATFORMS,
  bundleCleanupDir,
  resolveBuildPlatform
} from './release-platforms.mjs';

export function resolveBundleCleanupPath(rootDir, platformEnv) {
  const buildPlatform = resolveBuildPlatform(platformEnv);
  const platform = RELEASE_PLATFORMS.find(
    (entry) => entry.buildPlatform === buildPlatform
  );
  return platform
    ? path.join(rootDir, ...bundleCleanupDir(platform).split('/'))
    : null;
}

export function cleanupBundleArtifacts(rootDir, platformEnv) {
  const cleanupPath = resolveBundleCleanupPath(rootDir, platformEnv);
  if (!cleanupPath) {
    return { cleanupPath: null, removed: false };
  }

  if (!fs.existsSync(cleanupPath)) {
    return { cleanupPath, removed: false };
  }

  fs.rmSync(cleanupPath, { force: true, recursive: true });
  return { cleanupPath, removed: true };
}

function main() {
  const rootDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..'
  );
  const platformEnv = process.env.TAURI_ENV_PLATFORM ?? process.platform;
  const { cleanupPath, removed } = cleanupBundleArtifacts(rootDir, platformEnv);

  if (!cleanupPath) {
    console.log(
      `before-bundle-cleanup: skipping unsupported platform ${platformEnv}`
    );
    return;
  }

  if (removed) {
    console.log(
      `before-bundle-cleanup: removed stale bundle artifacts at ${cleanupPath}`
    );
    return;
  }

  console.log(
    `before-bundle-cleanup: no stale bundle artifacts at ${cleanupPath}`
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
