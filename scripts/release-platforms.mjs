import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Release platform facts live here so build.sh and the Node release scripts
// cannot drift independently. `key` values are an external wire contract: they
// are the Tauri updater {{target}}-{{arch}} lookup keys queried by every shipped
// client against latest.json (src-tauri/tauri.conf.json:33-34). NEVER rename a
// key; only append. `rustTarget` is scalar-or-null by design. A future platform
// requiring multiple Rust triples needs a schema migration, not a comma hack.
export const RELEASE_PLATFORMS = Object.freeze([
  Object.freeze({
    key: 'windows-x86_64',
    buildPlatform: 'windows',
    nodePlatform: 'win32',
    rustTarget: null,
    bundleRoot: 'src-tauri/target/release/bundle',
    installerDir: 'src-tauri/target/release/bundle/nsis',
    bundleCleanupDir: 'src-tauri/target/release/bundle/nsis',
    releaseBinary: 'src-tauri/target/release/bppinstaller.exe',
    installerNameGlob: '*.exe',
    bundleTargets: 'nsis',
    tauriConfig: 'src-tauri/tauri.windows.conf.json',
    resourceZip: 'src-tauri/resources/BepInExSource/windows/BepInEx.zip'
  }),
  Object.freeze({
    key: 'darwin-aarch64',
    buildPlatform: 'macos',
    nodePlatform: 'darwin',
    rustTarget: 'aarch64-apple-darwin',
    bundleRoot: 'src-tauri/target/aarch64-apple-darwin/release/bundle',
    installerDir: 'src-tauri/target/aarch64-apple-darwin/release/bundle/dmg',
    bundleCleanupDir: 'src-tauri/target/aarch64-apple-darwin/release/bundle',
    releaseBinary: 'src-tauri/target/aarch64-apple-darwin/release/bppinstaller',
    installerNameGlob: '*.dmg',
    bundleTargets: 'app,dmg',
    tauriConfig: 'src-tauri/tauri.macos.conf.json',
    resourceZip: 'src-tauri/resources/BepInExSource/macos/BepInEx.zip'
  })
]);

export const RELEASE_PLATFORM_KEYS = Object.freeze(
  RELEASE_PLATFORMS.map((platform) => platform.key)
);

function findByBuildPlatform(buildPlatform) {
  const matches = RELEASE_PLATFORMS.filter(
    (platform) => platform.buildPlatform === buildPlatform
  );
  if (matches.length !== 1) {
    throw new Error(
      `Unsupported or ambiguous release platform: ${buildPlatform}`
    );
  }
  return matches[0];
}

function findByKey(platformKey) {
  const platform = RELEASE_PLATFORMS.find((entry) => entry.key === platformKey);
  if (!platform) {
    throw new Error(`Unsupported release platform key: ${platformKey}`);
  }
  return platform;
}

export function resolveBuildPlatform(platformEnv) {
  return (
    RELEASE_PLATFORMS.find(
      (platform) =>
        platform.buildPlatform === platformEnv ||
        platform.nodePlatform === platformEnv
    )?.buildPlatform ?? null
  );
}

export function defaultTargetBuildPlatforms() {
  return RELEASE_PLATFORMS.map((platform) => platform.buildPlatform).sort();
}

export function bundleRoot(platform) {
  return platform.bundleRoot;
}

export function installerDir(platform) {
  return platform.installerDir;
}

export function bundleCleanupDir(platform) {
  return platform.bundleCleanupDir;
}

export function releaseBinary(platform) {
  return platform.releaseBinary;
}

export function r2UpdaterKey({ version, platformKey, updaterFileName }) {
  findByKey(platformKey);
  return `${version}/${platformKey}/updater/${updaterFileName}`;
}

export function updaterFragmentUrl({
  baseUrl,
  version,
  platformKey,
  updaterFileName
}) {
  return `${baseUrl}/${r2UpdaterKey({ version, platformKey, updaterFileName })}`;
}

function printLines(values) {
  process.stdout.write(`${values.map((value) => value ?? '').join('\n')}\n`);
}

export function cliMain(args) {
  const [verb, buildPlatform] = args;
  try {
    if (verb === 'list' && args.length === 1) {
      printLines(RELEASE_PLATFORM_KEYS);
      return 0;
    }

    const platform = findByBuildPlatform(buildPlatform);
    switch (verb) {
      case 'r2-key':
        printLines([platform.key]);
        break;
      case 'bundle-root':
        printLines([bundleRoot(platform)]);
        break;
      case 'installer-dir':
        printLines([installerDir(platform)]);
        break;
      case 'installer-glob':
        printLines([platform.installerNameGlob]);
        break;
      case 'rust-targets':
        printLines([platform.rustTarget]);
        break;
      case 'build-env':
        printLines([
          platform.tauriConfig,
          platform.resourceZip,
          platform.bundleTargets,
          installerDir(platform),
          bundleCleanupDir(platform),
          releaseBinary(platform),
          platform.rustTarget
        ]);
        break;
      default:
        throw new Error(`Unknown release-platforms verb: ${verb ?? ''}`);
    }
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = cliMain(process.argv.slice(2));
}
