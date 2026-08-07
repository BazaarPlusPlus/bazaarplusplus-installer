import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const NATIVE_RECORDER_LOCK_PATH =
  'scripts/native-recorder-input.lock.json';
export const NATIVE_RECORDER_INPUT_PATHS = Object.freeze([
  'src-tauri/resources/SourceForBuild/macos/BepInEx/plugins/libBppMacAudio.dylib',
  'src-tauri/resources/SourceForBuild/macos/TheBazaar.app/Contents/Plugins/GfxPluginBppReplayVideoToolbox.bundle/Contents/Info.plist',
  'src-tauri/resources/SourceForBuild/macos/TheBazaar.app/Contents/Plugins/GfxPluginBppReplayVideoToolbox.bundle/Contents/MacOS/GfxPluginBppReplayVideoToolbox',
  'src-tauri/resources/SourceForBuild/macos/TheBazaar.app/Contents/Plugins/GfxPluginBppReplayVideoToolbox.bundle/Contents/_CodeSignature/CodeResources',
  'src-tauri/resources/SourceForBuild/windows/TheBazaar_Data/Plugins/x86_64/GfxPluginBppReplayMediaFoundation.dll'
]);

const expectedRepository = 'BazaarPlusPlus/bazaarplusplus-mod';

function sha256(filePath) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(filePath))
    .digest('hex');
}

export function verifyNativeRecorderInput({
  rootDir,
  lockPath = path.join(rootDir, NATIVE_RECORDER_LOCK_PATH)
}) {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  if (lock.schemaVersion !== 2) {
    throw new Error(
      `Unsupported native recorder input lock schema: ${lock.schemaVersion}`
    );
  }
  if (lock.sourceRepository !== expectedRepository) {
    throw new Error(
      `Native recorder source repository must be ${expectedRepository}`
    );
  }
  if (!/^[0-9a-f]{40}$/.test(lock.sourceCommit ?? '')) {
    throw new Error(
      'Native recorder sourceCommit must be a full Git commit SHA'
    );
  }

  for (const relativePath of NATIVE_RECORDER_INPUT_PATHS) {
    const expectedHash = lock.files?.[relativePath];
    if (!/^[0-9a-f]{64}$/.test(expectedHash ?? '')) {
      throw new Error(
        `Missing locked SHA-256 for native recorder input ${relativePath}`
      );
    }
    const filePath = path.join(rootDir, relativePath);
    if (!fs.statSync(filePath, { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`Missing native recorder input file: ${filePath}`);
    }
    const actualHash = sha256(filePath);
    if (actualHash !== expectedHash) {
      throw new Error(
        `Native recorder input hash drifted for ${relativePath}: expected ${expectedHash}, got ${actualHash}`
      );
    }
  }

  return {
    sourceRepository: lock.sourceRepository,
    sourceCommit: lock.sourceCommit,
    files: NATIVE_RECORDER_INPUT_PATHS
  };
}

function main() {
  const rootDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..'
  );
  const result = verifyNativeRecorderInput({ rootDir });
  console.log(
    `native-recorder-input: verified ${result.sourceRepository}@${result.sourceCommit}`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
