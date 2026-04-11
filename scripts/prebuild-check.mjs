import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import zlib from 'node:zlib';
import {
  assertVersionsAreAligned,
  collectVersionSnapshot
} from './version-sync.mjs';

export const sharedBundledZipPath = 'BepInExSource/BepInEx.zip';
export const bppDataVersionPolicyPath =
  'src-tauri/resources/BppDataVersionPolicy.json';

const platformAliases = new Map([
  ['darwin', 'macos'],
  ['macos', 'macos'],
  ['win32', 'windows'],
  ['windows', 'windows']
]);

const managedPluginDependencies = [
  'BepInEx/plugins/Microsoft.Data.Sqlite.dll',
  'BepInEx/plugins/SQLitePCLRaw.batteries_v2.dll',
  'BepInEx/plugins/SQLitePCLRaw.core.dll',
  'BepInEx/plugins/SQLitePCLRaw.provider.e_sqlite3.dll'
];

export function resolveTargetPlatforms(platformEnv) {
  if (!platformEnv) {
    return ['macos', 'windows'];
  }

  const platform = platformAliases.get(platformEnv);
  if (!platform) {
    throw new Error(`Unsupported TAURI_ENV_PLATFORM value: ${platformEnv}`);
  }

  return [platform];
}

export function requiredEntriesForPlatform(platform) {
  if (platform === 'macos') {
    return [
      'run_bepinex.sh',
      'libdoorstop.dylib',
      'BepInEx/plugins/BazaarPlusPlus.dll',
      'BepInEx/plugins/BazaarPlusPlus.version',
      ...managedPluginDependencies,
      'BepInEx/plugins/libe_sqlite3.dylib'
    ];
  }

  if (platform === 'windows') {
    return [
      'winhttp.dll',
      'doorstop_config.ini',
      'BepInEx/plugins/BazaarPlusPlus.dll',
      'BepInEx/plugins/BazaarPlusPlus.version',
      ...managedPluginDependencies,
      'BepInEx/plugins/e_sqlite3.dll'
    ];
  }

  throw new Error(`Unsupported platform: ${platform}`);
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

function parseVersionParts(version) {
  if (typeof version !== 'string' || version.trim() === '') {
    return null;
  }

  const parts = version.trim().split('.');
  if (parts.some((part) => !/^\d+$/.test(part))) {
    return null;
  }

  return parts.map((part) => Number.parseInt(part, 10));
}

export function compareVersions(left, right) {
  const leftParts = parseVersionParts(left);
  const rightParts = parseVersionParts(right);
  if (!leftParts || !rightParts) {
    return null;
  }

  const len = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < len; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart !== rightPart) {
      return leftPart > rightPart ? 1 : -1;
    }
  }

  return 0;
}

export function readBppDataVersionPolicy(rootDir) {
  const policyFile = path.join(rootDir, bppDataVersionPolicyPath);
  const raw = fs.readFileSync(policyFile, 'utf8');
  const policy = JSON.parse(raw);

  if (
    !policy ||
    typeof policy.minimum_supported_bpp_data_version !== 'string' ||
    !policy.minimum_supported_bpp_data_version.trim()
  ) {
    throw new Error(
      `Invalid BppDataVersionPolicy.json: minimum_supported_bpp_data_version is required`
    );
  }

  return {
    minimumSupported: policy.minimum_supported_bpp_data_version.trim()
  };
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

function ensureZipLooksValid(zipPath, platform) {
  if (!fs.existsSync(zipPath)) {
    throw new Error(`Missing ${platform} zip: ${zipPath}`);
  }

  const stats = fs.statSync(zipPath);
  if (!stats.isFile() || stats.size === 0) {
    throw new Error(`Invalid ${platform} zip: ${zipPath}`);
  }

  const buffer = fs.readFileSync(zipPath);
  const entries = listZipEntries(buffer);
  for (const requiredEntry of requiredEntriesForPlatform(platform)) {
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
}

export function runPrebuildCheck(rootDir, platformEnv) {
  console.log('Running prebuild check...');
  const snapshot = collectVersionSnapshot(rootDir);
  assertVersionsAreAligned(snapshot);
  const policy = readBppDataVersionPolicy(rootDir);
  const versionComparison = compareVersions(
    policy.minimumSupported,
    snapshot.packageVersion
  );
  if (versionComparison === null) {
    throw new Error(
      `Invalid BPP data version policy: ${policy.minimumSupported}`
    );
  }
  if (versionComparison > 0) {
    throw new Error(
      `minimum_supported_bpp_data_version=${policy.minimumSupported} cannot exceed packageVersion=${snapshot.packageVersion}`
    );
  }
  const platforms = resolveTargetPlatforms(platformEnv);

  console.log(
    `BPP data policy: minimum_supported_bpp_data_version=${policy.minimumSupported}`
  );

  for (const platform of platforms) {
    ensureZipLooksValid(sourceZipPathForPlatform(rootDir, platform), platform);
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
