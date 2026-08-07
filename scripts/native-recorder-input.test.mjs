import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';

import {
  NATIVE_RECORDER_INPUT_PATHS,
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
  for (const relativePath of NATIVE_RECORDER_INPUT_PATHS) {
    const filePath = path.join(rootDir, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `native input: ${relativePath}`);
  }
  const lockPath = path.join(rootDir, 'native-recorder.lock.json');
  fs.writeFileSync(
    lockPath,
    `${JSON.stringify(
      {
        schemaVersion: 2,
        sourceRepository: 'BazaarPlusPlus/bazaarplusplus-mod',
        sourceCommit: '1'.repeat(40),
        files: Object.fromEntries(
          NATIVE_RECORDER_INPUT_PATHS.map((relativePath) => [
            relativePath,
            sha256(path.join(rootDir, relativePath))
          ])
        )
      },
      null,
      2
    )}\n`
  );
  return { rootDir, lockPath };
}

test('verifies all pinned desktop native recorder inputs', () => {
  const fixture = createFixture();
  try {
    expect(verifyNativeRecorderInput(fixture)).toMatchObject({
      sourceRepository: 'BazaarPlusPlus/bazaarplusplus-mod',
      sourceCommit: '1'.repeat(40),
      files: NATIVE_RECORDER_INPUT_PATHS
    });
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test('rejects native recorder input bytes that drift from the source lock', () => {
  const fixture = createFixture();
  try {
    const nativeDll = NATIVE_RECORDER_INPUT_PATHS.at(-1);
    fs.appendFileSync(path.join(fixture.rootDir, nativeDll), 'drift');
    expect(() => verifyNativeRecorderInput(fixture)).toThrow(
      /input hash drifted.*GfxPluginBppReplayMediaFoundation/
    );
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test('rejects a lock that omits a required native recorder artifact', () => {
  const fixture = createFixture();
  try {
    const lock = JSON.parse(fs.readFileSync(fixture.lockPath, 'utf8'));
    delete lock.files[NATIVE_RECORDER_INPUT_PATHS[0]];
    fs.writeFileSync(fixture.lockPath, `${JSON.stringify(lock)}\n`);
    expect(() => verifyNativeRecorderInput(fixture)).toThrow(
      /Missing locked SHA-256/
    );
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});
