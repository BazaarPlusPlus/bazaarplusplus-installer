import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import zlib from 'node:zlib';
import {
  assertVersionsAreAligned,
  collectVersionSnapshot
} from './version-sync.mjs';
import {
  defaultTargetBuildPlatforms,
  resolveBuildPlatform
} from './release-platforms.mjs';

export const sharedBundledZipPath = 'BepInExSource/BepInEx.zip';

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

// Gitignored, so invisible to git status — but MSBuild's ZipDirectory zips the
// whole SourceForBuild tree verbatim, so a stray one would ship to users.
const osArtifactNames = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);

export function payloadFilesForPlatform(rootDir, platform) {
  const platformRoot = path.join(
    rootDir,
    'src-tauri',
    'resources',
    'SourceForBuild',
    platform
  );
  const entries = [];
  const walk = (dir) => {
    for (const dirent of fs.readdirSync(dir, { withFileTypes: true })) {
      const child = path.join(dir, dirent.name);
      if (dirent.isDirectory()) {
        walk(child);
      } else if (osArtifactNames.has(dirent.name)) {
        throw new Error(
          `Stray OS artifact ${child} would ship inside the BepInEx payload; delete it and rebuild the zips`
        );
      } else {
        entries.push(
          path.relative(platformRoot, child).split(path.sep).join('/')
        );
      }
    }
  };
  walk(platformRoot);
  return entries.sort();
}

function sourceZipPathForPlatform(rootDir, platform) {
  return path.join(
    rootDir,
    'src-tauri',
    'resources',
    'BepInExSource',
    platform,
    'BepInEx.zip'
  );
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

function findEndOfCentralDirectory(buffer) {
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }

  throw new Error('Zip end-of-central-directory record not found');
}

export function listZipEntries(buffer) {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const endOffset = centralDirectoryOffset + centralDirectorySize;
  const entries = [];

  let cursor = centralDirectoryOffset;
  while (cursor < endOffset) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error(`Invalid central directory header at offset ${cursor}`);
    }

    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const fileNameStart = cursor + 46;
    const fileNameEnd = fileNameStart + fileNameLength;

    entries.push(buffer.toString('utf8', fileNameStart, fileNameEnd));
    cursor = fileNameEnd + extraLength + commentLength;
  }

  return entries;
}

export function readZipEntry(buffer, entryName) {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const endOffset = centralDirectoryOffset + centralDirectorySize;

  let cursor = centralDirectoryOffset;
  while (cursor < endOffset) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) break;

    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const fileNameStart = cursor + 46;
    const fileName = buffer.toString(
      'utf8',
      fileNameStart,
      fileNameStart + fileNameLength
    );

    if (fileName === entryName || fileName.endsWith(`/${entryName}`)) {
      const compressionMethod = buffer.readUInt16LE(localHeaderOffset + 8);
      const compressedSize = buffer.readUInt32LE(localHeaderOffset + 18);
      const localFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart =
        localHeaderOffset + 30 + localFileNameLength + localExtraLength;
      const compressedData = buffer.subarray(
        dataStart,
        dataStart + compressedSize
      );

      if (compressionMethod === 0) return compressedData.toString('utf8');
      if (compressionMethod === 8)
        return zlib.inflateRawSync(compressedData).toString('utf8');
      throw new Error(
        `Unsupported compression method ${compressionMethod} for ${entryName}`
      );
    }

    cursor = fileNameStart + fileNameLength + extraLength + commentLength;
  }

  return null;
}

function ensureMacosLauncherMatchesSource(rootDir, zipPath, buffer) {
  const sourcePath = sourceMacosLauncherPath(rootDir);
  const sourceScript = fs.readFileSync(sourcePath, 'utf8');
  const zipScript = readZipEntry(buffer, 'run_bepinex.sh');

  if (!zipScript) {
    throw new Error(`${zipPath} is missing run_bepinex.sh content`);
  }

  assertMacosLauncherScriptIsSafe(sourceScript, sourcePath);
  assertMacosLauncherScriptIsSafe(zipScript, `${zipPath}:run_bepinex.sh`);

  if (zipScript !== sourceScript) {
    throw new Error(
      `${zipPath}:run_bepinex.sh does not match ${sourcePath}; rebuild the macOS BepInEx zip`
    );
  }
}

function ensureZipLooksValid(rootDir, zipPath, platform) {
  if (!fs.existsSync(zipPath)) {
    throw new Error(`Missing ${platform} zip: ${zipPath}`);
  }

  const stats = fs.statSync(zipPath);
  if (!stats.isFile() || stats.size === 0) {
    throw new Error(`Invalid ${platform} zip: ${zipPath}`);
  }

  const buffer = fs.readFileSync(zipPath);
  const entries = listZipEntries(buffer);
  for (const entry of entries) {
    if (osArtifactNames.has(entry.split('/').pop())) {
      throw new Error(
        `${platform} zip contains OS artifact '${entry}' in ${zipPath}; rebuild it from a clean SourceForBuild tree`
      );
    }
  }
  for (const requiredEntry of payloadFilesForPlatform(rootDir, platform)) {
    const present = entries.some(
      (entry) => entry === requiredEntry || entry.endsWith(`/${requiredEntry}`)
    );
    if (!present) {
      throw new Error(
        `${platform} zip is missing required entry '${requiredEntry}' in ${zipPath}`
      );
    }
  }

  const version = readZipEntry(buffer, 'BazaarPlusPlus.version');
  if (version) {
    console.log(`[${platform}] BazaarPlusPlus.version: ${version.trim()}`);
  }

  if (platform === 'macos') {
    ensureMacosLauncherMatchesSource(rootDir, zipPath, buffer);
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
  const stubPath = macosTrampolineStubPath(rootDir);
  if (!fs.existsSync(stubPath)) {
    throw new Error(
      `Missing compiled macOS trampoline stub: ${stubPath}. ` +
        'Run build.sh (which compiles it from SourceForBuild/macos/bpp_launcher.c) before bundling.'
    );
  }

  const description = execFileSync('file', [stubPath], { encoding: 'utf8' });
  if (!/Mach-O 64-bit executable arm64/.test(description)) {
    throw new Error(
      `macOS trampoline stub is not arm64 Mach-O (${stubPath}): ${description.trim()}`
    );
  }
}

const generatedTypesDir = 'src/types/generated';

export function npmExecFileInvocation(
  args,
  platform = process.platform,
  env = process.env
) {
  if (platform === 'win32') {
    const command = env.ComSpec?.trim() || 'cmd.exe';
    return { command, args: ['/d', '/s', '/c', 'npm', ...args] };
  }

  return { command: 'npm', args };
}

export function assertBindingsUpToDate(rootDir) {
  console.log('Checking TypeScript bindings...');
  const npmInvocation = npmExecFileInvocation(['run', 'generate:bindings']);

  execFileSync(npmInvocation.command, npmInvocation.args, {
    cwd: rootDir,
    stdio: 'inherit'
  });

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

export function runPrebuildCheck(rootDir, platformEnv) {
  console.log('Running prebuild check...');
  assertBindingsUpToDate(rootDir);
  const snapshot = collectVersionSnapshot(rootDir);
  assertVersionsAreAligned(snapshot);
  const platforms = resolveTargetPlatforms(platformEnv);

  for (const platform of platforms) {
    ensureZipLooksValid(
      rootDir,
      sourceZipPathForPlatform(rootDir, platform),
      platform
    );
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
    runPrebuildCheck(process.cwd(), process.env.TAURI_ENV_PLATFORM);
    console.log('prebuild-check: ok');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`prebuild-check: ${message}`);
    process.exit(1);
  }
}
