import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';

import {
  DEBUG_BUNDLE_IDENTIFIER,
  NATIVE_RECORDER_INPUT_PATH,
  verifyNativeRecorderInput
} from './native-recorder-input.mjs';

function sha256(filePath) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(filePath))
    .digest('hex');
}

function createFixture() {
  const rootDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'bpp-native-recorder-')
  );
  const appPath = path.join(rootDir, NATIVE_RECORDER_INPUT_PATH);
  const files = {
    'Contents/Info.plist': `<?xml version="1.0"?><plist><dict><key>CFBundleIdentifier</key><string>${DEBUG_BUNDLE_IDENTIFIER}</string></dict></plist>`,
    'Contents/MacOS/BppReplayRecorder': 'executable',
    'Contents/_CodeSignature/CodeResources': 'adhoc-signature'
  };
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(appPath, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents);
  }
  const lockPath = path.join(rootDir, 'native-recorder.lock.json');
  fs.writeFileSync(
    lockPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        sourceRepository: 'BazaarPlusPlus/bazaarplusplus-mod',
        sourceCommit: '1'.repeat(40),
        bundleIdentifier: DEBUG_BUNDLE_IDENTIFIER,
        files: Object.fromEntries(
          Object.keys(files).map((relativePath) => [
            relativePath,
            sha256(path.join(appPath, relativePath))
          ])
        )
      },
      null,
      2
    )}\n`
  );
  return { rootDir, appPath, lockPath };
}

test('verifies the pinned ad-hoc native recorder input', () => {
  const fixture = createFixture();
  try {
    expect(verifyNativeRecorderInput(fixture)).toMatchObject({
      sourceRepository: 'BazaarPlusPlus/bazaarplusplus-mod',
      sourceCommit: '1'.repeat(40)
    });
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test('rejects native recorder input bytes that drift from the source lock', () => {
  const fixture = createFixture();
  try {
    fs.appendFileSync(
      path.join(fixture.appPath, 'Contents/MacOS/BppReplayRecorder'),
      'drift'
    );
    expect(() => verifyNativeRecorderInput(fixture)).toThrow(
      /input hash drifted.*BppReplayRecorder/
    );
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test('rejects a production bundle identifier in the unsigned input', () => {
  const fixture = createFixture();
  try {
    const infoPlistPath = path.join(fixture.appPath, 'Contents/Info.plist');
    fs.writeFileSync(
      infoPlistPath,
      fs
        .readFileSync(infoPlistPath, 'utf8')
        .replace(DEBUG_BUNDLE_IDENTIFIER, 'com.bazaarplusplus.replay-recorder')
    );
    expect(() => verifyNativeRecorderInput(fixture)).toThrow(
      /bundle identifier drifted/
    );
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});
