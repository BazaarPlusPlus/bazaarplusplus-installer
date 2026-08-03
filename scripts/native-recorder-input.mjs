import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const NATIVE_RECORDER_INPUT_PATH =
  'src-tauri/resources/SourceForBuild/macos/BepInEx/plugins/BppReplayRecorder.app';
export const NATIVE_RECORDER_LOCK_PATH =
  'scripts/native-recorder-input.lock.json';
export const DEBUG_BUNDLE_IDENTIFIER =
  'com.bazaarplusplus.replay-recorder.debug';

const expectedRepository = 'BazaarPlusPlus/bazaarplusplus-mod';
const artifactFiles = [
  'Contents/Info.plist',
  'Contents/MacOS/BppReplayRecorder',
  'Contents/_CodeSignature/CodeResources'
];

function sha256(filePath) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(filePath))
    .digest('hex');
}

function readBundleIdentifier(infoPlistPath) {
  const plist = fs.readFileSync(infoPlistPath, 'utf8');
  const match = plist.match(
    /<key>CFBundleIdentifier<\/key>\s*<string>([^<]+)<\/string>/
  );
  if (!match) {
    throw new Error(`Missing CFBundleIdentifier in ${infoPlistPath}`);
  }
  return match[1];
}

export function verifyNativeRecorderInput({
  rootDir,
  lockPath = path.join(rootDir, NATIVE_RECORDER_LOCK_PATH)
}) {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  if (lock.schemaVersion !== 1) {
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
  if (lock.bundleIdentifier !== DEBUG_BUNDLE_IDENTIFIER) {
    throw new Error(
      `Native recorder input bundle identifier must be ${DEBUG_BUNDLE_IDENTIFIER}`
    );
  }

  const appPath = path.join(rootDir, NATIVE_RECORDER_INPUT_PATH);
  const actualBundleIdentifier = readBundleIdentifier(
    path.join(appPath, 'Contents', 'Info.plist')
  );
  if (actualBundleIdentifier !== lock.bundleIdentifier) {
    throw new Error(
      `Native recorder input bundle identifier drifted: expected ${lock.bundleIdentifier}, got ${actualBundleIdentifier}`
    );
  }

  for (const relativePath of artifactFiles) {
    const expectedHash = lock.files?.[relativePath];
    if (!/^[0-9a-f]{64}$/.test(expectedHash ?? '')) {
      throw new Error(
        `Missing locked SHA-256 for native recorder input ${relativePath}`
      );
    }
    const filePath = path.join(appPath, relativePath);
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
    appPath,
    sourceRepository: lock.sourceRepository,
    sourceCommit: lock.sourceCommit
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
