import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  assertVersionsAreAligned,
  collectVersionSnapshot
} from './version-sync.mjs';
import {
  assertPlatformCoherence,
  defaultTargetBuildPlatforms,
  resolveBuildPlatform
} from './release-platforms.mjs';
import { validatePayloadZip } from './payload-zip.mjs';
import { verifyNativeRecorderInput } from './native-recorder-input.mjs';

export function resolveTargetPlatforms(platformEnv) {
  if (!platformEnv) {
    return defaultTargetBuildPlatforms();
  }

  const platform = resolveBuildPlatform(platformEnv);
  if (!platform) {
    throw new Error(`Unsupported TAURI_ENV_PLATFORM value: ${platformEnv}`);
  }

  return [platform];
}

function sourceMacosLauncherPath(rootDir) {
  return path.join(
    rootDir,
    'src-tauri',
    'resources',
    'SourceForBuild',
    'macos',
    'run_bepinex.sh'
  );
}

export function assertMacosLauncherScriptIsSafe(
  script,
  label = 'run_bepinex.sh'
) {
  const forbiddenSnippets = [
    'mktemp /tmp/bepinex_ents.XXXXXX.plist',
    'codesign --remove-signature'
  ];

  for (const snippet of forbiddenSnippets) {
    if (script.includes(snippet)) {
      throw new Error(
        `${label} contains forbidden launcher snippet: ${snippet}`
      );
    }
  }

  const requiredSnippets = [
    'mktemp "${TMPDIR:-/tmp}/bepinex_ents.XXXXXX"',
    'trap cleanup_entitlements EXIT HUP INT TERM',
    'codesign --force --deep --sign - --entitlements "$_entitlements_file" "$app_path"'
  ];

  for (const snippet of requiredSnippets) {
    if (!script.includes(snippet)) {
      throw new Error(
        `${label} is missing required launcher snippet: ${snippet}`
      );
    }
  }
}

export function macosTrampolineStubPath(rootDir) {
  return path.join(
    rootDir,
    'src-tauri',
    'resources',
    'Trampoline',
    'macos',
    'bpp_launcher'
  );
}

export function assertMacosTrampolineStub(rootDir) {
  return assertMacosTrampolineStubWith(rootDir, (stubPath) =>
    execFileSync('file', [stubPath], { encoding: 'utf8' })
  );
}

export function assertMacosTrampolineStubWith(rootDir, describeStub) {
  const stubPath = macosTrampolineStubPath(rootDir);
  if (!fs.existsSync(stubPath)) {
    throw new Error(
      `Missing compiled macOS trampoline stub: ${stubPath}. ` +
        'Run build.sh (which compiles it from SourceForBuild/macos/bpp_launcher.c) before bundling.'
    );
  }

  const description = describeStub(stubPath);
  if (!/Mach-O 64-bit executable arm64/.test(description)) {
    throw new Error(
      `macOS trampoline stub is not arm64 Mach-O (${stubPath}): ${description.trim()}`
    );
  }
}

const generatedTypesDir = 'src/types/generated';

export function assertBindingsUpToDate(rootDir) {
  console.log('Checking generated TypeScript binding freshness...');
  const porcelain = execFileSync(
    'git',
    ['status', '--porcelain', '--untracked-files=all', '--', generatedTypesDir],
    { cwd: rootDir, encoding: 'utf8' }
  ).trim();

  if (porcelain) {
    throw new Error(
      `Generated TypeScript bindings are out of date under ${generatedTypesDir}. ` +
        'Run npm run generate:bindings and commit all files under that directory.\n' +
        porcelain
    );
  }
}

export function runPrebuildCheck(
  rootDir,
  { platformEnv, releaseResources = true, bindingsOnly = false } = {}
) {
  console.log('Running prebuild check...');
  assertBindingsUpToDate(rootDir);
  if (bindingsOnly) return;

  const snapshot = collectVersionSnapshot(rootDir);
  assertVersionsAreAligned(snapshot);
  assertPlatformCoherence(rootDir);
  if (!releaseResources) return;

  const platforms = resolveTargetPlatforms(platformEnv);
  verifyNativeRecorderInput({ rootDir });

  for (const platform of platforms) {
    const result = validatePayloadZip({ rootDir, platform });
    if (platform === 'macos') {
      const sourcePath = sourceMacosLauncherPath(rootDir);
      const sourceScript = fs.readFileSync(sourcePath, 'utf8');
      const zipScript = result.entries
        .get('run_bepinex.sh')
        ?.data.toString('utf8');
      if (!zipScript) {
        throw new Error(`${result.zipPath} is missing run_bepinex.sh content`);
      }
      assertMacosLauncherScriptIsSafe(sourceScript, sourcePath);
      assertMacosLauncherScriptIsSafe(
        zipScript,
        `${result.zipPath}:run_bepinex.sh`
      );
      if (zipScript !== sourceScript) {
        throw new Error(
          `${result.zipPath}:run_bepinex.sh does not match ${sourcePath}; rebuild the macOS BepInEx zip`
        );
      }
    }
  }

  // The compiled arm64 stub is only produced on (and needed by) a macOS build
  // host. Skip the check when cross-validating the macOS target from elsewhere.
  if (process.platform === 'darwin' && platforms.includes('macos')) {
    assertMacosTrampolineStub(rootDir);
  }
}

const invokedAsScript =
  process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename;

if (invokedAsScript) {
  try {
    const args = process.argv.slice(2);
    let platformEnv = process.env.TAURI_ENV_PLATFORM;
    let releaseResources = true;
    let bindingsOnly = false;
    for (let index = 0; index < args.length; index += 1) {
      if (args[index] === '--source-only') {
        releaseResources = false;
      } else if (args[index] === '--bindings-only') {
        bindingsOnly = true;
      } else if (args[index] === '--platform') {
        platformEnv = args[index + 1];
        if (!platformEnv) throw new Error('--platform needs a value');
        index += 1;
      } else {
        throw new Error(`Unknown prebuild-check argument: ${args[index]}`);
      }
    }
    runPrebuildCheck(process.cwd(), {
      platformEnv,
      releaseResources,
      bindingsOnly
    });
    console.log('prebuild-check: ok');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`prebuild-check: ${message}`);
    process.exit(1);
  }
}
