import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  cleanupBundleArtifacts,
  resolveBundleCleanupPath
} from './before-bundle-cleanup.mjs';

test('resolveBundleCleanupPath returns the macOS bundle root', () => {
  const rootDir = '/tmp/bpp';
  assert.equal(
    resolveBundleCleanupPath(rootDir, 'darwin'),
    path.join(
      rootDir,
      'src-tauri',
      'target',
      'aarch64-apple-darwin',
      'release',
      'bundle'
    )
  );
});

test('cleanupBundleArtifacts removes stale macOS bundle outputs', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bpp-cleanup-'));
  const bundleDir = path.join(
    rootDir,
    'src-tauri',
    'target',
    'aarch64-apple-darwin',
    'release',
    'bundle',
    'dmg'
  );

  fs.mkdirSync(bundleDir, { recursive: true });
  fs.writeFileSync(path.join(bundleDir, 'BazaarPlusPlus_3.1.0_aarch64.dmg'), 'stale');

  try {
    const result = cleanupBundleArtifacts(rootDir, 'macos');
    assert.equal(result.removed, true);
    assert.equal(
      result.cleanupPath,
      path.join(
        rootDir,
        'src-tauri',
        'target',
        'aarch64-apple-darwin',
        'release',
        'bundle'
      )
    );
    assert.equal(
      fs.existsSync(
        path.join(
          rootDir,
          'src-tauri',
          'target',
          'aarch64-apple-darwin',
          'release',
          'bundle'
        )
      ),
      false
    );
  } finally {
    fs.rmSync(rootDir, { force: true, recursive: true });
  }
});

test('cleanupBundleArtifacts removes stale Windows installer outputs', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bpp-cleanup-'));
  const nsisDir = path.join(rootDir, 'src-tauri', 'target', 'release', 'bundle', 'nsis');

  fs.mkdirSync(nsisDir, { recursive: true });
  fs.writeFileSync(path.join(nsisDir, 'BazaarPlusPlus_3.1.0_x64-setup.exe'), 'stale');

  try {
    const result = cleanupBundleArtifacts(rootDir, 'windows');
    assert.equal(result.removed, true);
    assert.equal(result.cleanupPath, nsisDir);
    assert.equal(fs.existsSync(nsisDir), false);
  } finally {
    fs.rmSync(rootDir, { force: true, recursive: true });
  }
});
