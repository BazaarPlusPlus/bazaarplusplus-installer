import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';

import {
  buildZipBuffer,
  listPayloadFiles,
  preparePayloadZip,
  readZipEntries,
  validateZipEntrySet,
  writeDeterministicZip
} from './payload-zip.mjs';

function fixtureRoot(platform = 'macos') {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bpp-payload-zip-'));
  const sourceDir = path.join(
    rootDir,
    'src-tauri',
    'resources',
    'SourceForBuild',
    platform
  );
  fs.mkdirSync(sourceDir, { recursive: true });
  return { rootDir, sourceDir, platform };
}

test.each([
  ['macos', 'run_bepinex.sh', 0o755],
  ['windows', 'doorstop_config.ini', 0o644]
])(
  'preparePayloadZip creates a deterministic %s archive and preserves file mode',
  (platform, fileName, mode) => {
    const fixture = fixtureRoot(platform);
    const nested = path.join(fixture.sourceDir, 'BepInEx', 'plugins');
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(fixture.sourceDir, fileName), 'launcher');
    fs.chmodSync(path.join(fixture.sourceDir, fileName), mode);
    fs.writeFileSync(path.join(nested, 'BazaarPlusPlus.version'), '9.9.9');

    try {
      const first = preparePayloadZip({
        ...fixture,
        requiredStagingPaths: [
          fileName,
          'BepInEx/plugins/BazaarPlusPlus.version'
        ]
      });
      const firstBytes = fs.readFileSync(first.zipPath);
      const second = preparePayloadZip({
        ...fixture,
        requiredStagingPaths: [
          fileName,
          'BepInEx/plugins/BazaarPlusPlus.version'
        ]
      });
      const secondBytes = fs.readFileSync(second.zipPath);
      const entries = readZipEntries(secondBytes);

      expect(secondBytes.equals(firstBytes)).toBe(true);
      expect(entries.map((entry) => entry.name)).toEqual(
        [...entries.map((entry) => entry.name)].sort()
      );
      expect(entries.find((entry) => entry.name === fileName)?.mode).toBe(mode);
      expect(
        JSON.parse(fs.readFileSync(second.manifestPath, 'utf8'))
      ).toMatchObject({ schemaVersion: 1, platform });
    } finally {
      fs.rmSync(fixture.rootDir, { recursive: true, force: true });
    }
  }
);

test('preparePayloadZip reports every missing external staging input at once', () => {
  const fixture = fixtureRoot('windows');
  try {
    expect(() =>
      preparePayloadZip({
        ...fixture,
        requiredStagingPaths: [
          'BepInEx/plugins/BazaarPlusPlus.dll',
          'BepInEx/plugins/BazaarPlusPlus.version'
        ]
      })
    ).toThrow(
      /SourceForBuild[\s\S]*BazaarPlusPlus\.dll[\s\S]*BazaarPlusPlus\.version/
    );
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test('listPayloadFiles rejects OS artifacts before creating a release archive', () => {
  const fixture = fixtureRoot('windows');
  fs.writeFileSync(path.join(fixture.sourceDir, 'Thumbs.db'), 'junk');
  try {
    expect(() => listPayloadFiles(fixture.sourceDir)).toThrow(/OS artifact/);
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test.each([
  {
    name: 'missing entry',
    entries: ['BepInEx/a.dll'],
    expected: ['BepInEx/a.dll', 'BepInEx/b.dll'],
    error: /missing.*BepInEx\/b\.dll/i
  },
  {
    name: 'stale extra entry',
    entries: ['BepInEx/a.dll', 'BepInEx/old.dll'],
    expected: ['BepInEx/a.dll'],
    error: /extra.*BepInEx\/old\.dll/i
  },
  {
    name: 'OS artifact',
    entries: ['BepInEx/a.dll', 'BepInEx/.DS_Store'],
    expected: ['BepInEx/a.dll'],
    error: /OS artifact/i
  },
  {
    name: 'absolute path',
    entries: ['/BepInEx/a.dll'],
    expected: ['BepInEx/a.dll'],
    error: /unsafe absolute/i
  },
  {
    name: 'parent traversal',
    entries: ['BepInEx/../a.dll'],
    expected: ['BepInEx/a.dll'],
    error: /parent traversal/i
  },
  {
    name: 'backslash escape',
    entries: ['BepInEx\\..\\a.dll'],
    expected: ['BepInEx/a.dll'],
    error: /backslash/i
  },
  {
    name: 'duplicate normalized path',
    entries: ['BepInEx/a.dll', 'BepInEx/./a.dll'],
    expected: ['BepInEx/a.dll'],
    error: /duplicate normalized path/i
  }
])('validateZipEntrySet rejects $name', ({ entries, expected, error }) => {
  expect(() =>
    validateZipEntrySet(
      entries.map((name) => ({ name, isDirectory: false })),
      expected
    )
  ).toThrow(error);
});

test('validateZipEntrySet ignores directories and accepts one legal top-level prefix', () => {
  const mapping = validateZipEntrySet(
    [
      { name: 'payload/', isDirectory: true },
      { name: 'payload/BepInEx/', isDirectory: true },
      { name: 'payload/BepInEx/a.dll', isDirectory: false },
      { name: 'payload/run_bepinex.sh', isDirectory: false }
    ],
    ['BepInEx/a.dll', 'run_bepinex.sh']
  );

  expect([...mapping.keys()]).toEqual(['BepInEx/a.dll', 'run_bepinex.sh']);
});

test('BazaarPlusPlus.version is a required release invariant', () => {
  const fixture = fixtureRoot('macos');
  fs.writeFileSync(path.join(fixture.sourceDir, 'run_bepinex.sh'), 'launcher');
  try {
    expect(() =>
      preparePayloadZip({
        ...fixture,
        requiredStagingPaths: [
          'run_bepinex.sh',
          'BepInEx/plugins/BazaarPlusPlus.version'
        ]
      })
    ).toThrow(/BazaarPlusPlus\.version/);
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test('macOS release preparation rejects a launcher without executable permission', () => {
  const fixture = fixtureRoot('macos');
  fs.writeFileSync(path.join(fixture.sourceDir, 'run_bepinex.sh'), 'launcher');
  fs.chmodSync(path.join(fixture.sourceDir, 'run_bepinex.sh'), 0o644);
  try {
    expect(() =>
      preparePayloadZip({
        ...fixture,
        requiredStagingPaths: ['run_bepinex.sh']
      })
    ).toThrow(/must be executable/);
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test('ZIP parser exposes directory entries without treating them as payload files', () => {
  const buffer = buildZipBuffer([
    { name: 'BepInEx/', data: Buffer.alloc(0), mode: 0o755, isDirectory: true },
    { name: 'BepInEx/a.dll', data: Buffer.from('a'), mode: 0o644 }
  ]);

  expect(
    readZipEntries(buffer).map(({ name, isDirectory }) => ({
      name,
      isDirectory
    }))
  ).toEqual([
    { name: 'BepInEx/', isDirectory: true },
    { name: 'BepInEx/a.dll', isDirectory: false }
  ]);
});

test('deterministic repack refreshes the checksum manifest for signed payload bytes', () => {
  const fixture = fixtureRoot('macos');
  const outputPath = path.join(fixture.rootDir, 'signed', 'BepInEx.zip');
  const manifestPath = `${outputPath}.manifest.json`;
  fs.writeFileSync(
    path.join(fixture.sourceDir, 'signed-library.dylib'),
    'signed'
  );

  try {
    writeDeterministicZip({
      sourceDir: fixture.sourceDir,
      outputPath,
      manifestPath,
      platform: 'macos'
    });

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const zipSha256 = crypto
      .createHash('sha256')
      .update(fs.readFileSync(outputPath))
      .digest('hex');
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      platform: 'macos',
      zipSha256,
      entries: [
        {
          path: 'signed-library.dylib',
          size: 6,
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          mode: expect.any(Number)
        }
      ]
    });
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});
