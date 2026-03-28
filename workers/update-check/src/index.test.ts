import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildClientActivityRecord,
  buildUpsertStatement,
  compareSemanticVersions,
  isValidSemanticVersion,
  isValidReleaseConfig,
} from './index.ts';

test('buildClientActivityRecord normalizes client metadata for D1 storage', () => {
  const record = buildClientActivityRecord(
    {
      installId: ' install-123 ',
      machineId: ' machine-123 ',
      appVersion: ' 1.9.0 ',
      platform: ' windows ',
      osVersion: ' 11 ',
      arch: ' x64 ',
      locale: ' zh-CN ',
    },
    '2026-03-28T12:00:00.000Z',
  );

  assert.deepEqual(record, {
    installId: 'install-123',
    machineId: 'machine-123',
    appVersion: '1.9.0',
    platform: 'windows',
    osVersion: '11',
    arch: 'x64',
    locale: 'zh-CN',
    seenAt: '2026-03-28T12:00:00.000Z',
  });
});

test('buildClientActivityRecord returns null without a usable installId', () => {
  assert.equal(
    buildClientActivityRecord(
      {
        installId: '   ',
        machineId: 'machine-123',
        appVersion: '1.9.0',
      },
      '2026-03-28T12:00:00.000Z',
    ),
    null,
  );
});

test('buildClientActivityRecord caps stored field lengths for public input', () => {
  const record = buildClientActivityRecord(
    {
      installId: 'x'.repeat(200),
      machineId: 'm'.repeat(200),
      appVersion: '9'.repeat(80),
      platform: 'p'.repeat(80),
      osVersion: 'o'.repeat(80),
      arch: 'a'.repeat(80),
      locale: 'l'.repeat(80),
    },
    '2026-03-28T12:00:00.000Z',
  );

  assert.equal(record?.installId.length, 64);
  assert.equal(record?.machineId.length, 64);
  assert.equal(record?.appVersion.length, 32);
  assert.equal(record?.platform?.length, 32);
  assert.equal(record?.osVersion?.length, 32);
  assert.equal(record?.arch?.length, 32);
  assert.equal(record?.locale?.length, 32);
});

test('buildUpsertStatement keeps first_seen_at and updates the latest metadata', () => {
  const statement = buildUpsertStatement({
    installId: 'install-123',
    machineId: 'machine-123',
    appVersion: '1.9.0',
    platform: 'macos',
    osVersion: '15',
    arch: 'arm64',
    locale: 'zh-CN',
    seenAt: '2026-03-28T12:00:00.000Z',
  });

  assert.match(statement.sql, /ON CONFLICT\(install_id\) DO UPDATE SET/);
  assert.deepEqual(statement.params, [
    'install-123',
    'machine-123',
    '2026-03-28T12:00:00.000Z',
    '2026-03-28T12:00:00.000Z',
    '1.9.0',
    'macos',
    '15',
    'arm64',
    'zh-CN',
  ]);
});

test('compareSemanticVersions still orders versions numerically', () => {
  assert.equal(compareSemanticVersions('1.10.0', '1.9.9') > 0, true);
  assert.equal(compareSemanticVersions('1.9.0', '1.9.0'), 0);
  assert.equal(compareSemanticVersions('1.8.9', '1.9.0') < 0, true);
});

test('isValidSemanticVersion accepts x.y.z versions and rejects invalid values', () => {
  assert.equal(isValidSemanticVersion('1.9.0'), true);
  assert.equal(isValidSemanticVersion('0.0.1'), true);
  assert.equal(isValidSemanticVersion('1.9'), false);
  assert.equal(isValidSemanticVersion('dev-build'), false);
  assert.equal(isValidSemanticVersion('1.9.0-beta'), false);
});

test('isValidReleaseConfig requires a semantic latestVersion and websiteUrl', () => {
  assert.equal(
    isValidReleaseConfig({
      latestVersion: '1.9.0',
      websiteUrl: 'https://bazaarplusplus.com',
    }),
    true,
  );
  assert.equal(
    isValidReleaseConfig({
      latestVersion: 'latest',
      websiteUrl: 'https://bazaarplusplus.com',
    }),
    false,
  );
  assert.equal(
    isValidReleaseConfig({
      latestVersion: '1.9.0',
      websiteUrl: '   ',
    }),
    false,
  );
});
