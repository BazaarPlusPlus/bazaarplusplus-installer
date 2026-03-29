import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import {
  checkForInstallerUpdate,
  compareSemanticVersions,
  runInstallerUpdateCheck,
  shouldCheckForInstallerUpdate
} from './update.ts';

test('compareSemanticVersions compares numeric version segments', () => {
  assert.equal(compareSemanticVersions('1.10.0', '1.9.9') > 0, true);
  assert.equal(compareSemanticVersions('1.9.0', '1.9.0'), 0);
  assert.equal(compareSemanticVersions('1.8.9', '1.9.0') < 0, true);
});

test('shouldCheckForInstallerUpdate skips requests inside the throttle window', () => {
  assert.equal(
    shouldCheckForInstallerUpdate({
      now: 1_700_000_000_000,
      lastCheckedAt: 1_699_999_000_000,
      minIntervalMs: 3_600_000
    }),
    false
  );

  assert.equal(
    shouldCheckForInstallerUpdate({
      now: 1_700_000_000_000,
      lastCheckedAt: 1_699_000_000_000,
      minIntervalMs: 3_600_000
    }),
    true
  );
});

test('checkForInstallerUpdate returns update metadata when the server reports a newer version', async () => {
  const fetchMock = mock.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    return new Response(
      JSON.stringify({
        latestVersion: '1.10.0',
        websiteUrl: 'https://example.com/download',
        title: 'Update available',
        message: 'Please visit the website.'
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  });

  const result = await checkForInstallerUpdate({
    endpoint: 'https://updates.example.com/check',
    appVersion: '1.9.0',
    installId: 'install-123',
    machineId: 'machine-123',
    platform: 'macos',
    osVersion: '15.0',
    arch: 'aarch64',
    locale: 'zh-CN',
    fetchImpl: fetchMock as typeof fetch,
    timeoutMs: 500
  });

  assert.deepEqual(result, {
    latestVersion: '1.10.0',
    websiteUrl: 'https://example.com/download',
    title: 'Update available',
    message: 'Please visit the website.'
  });

  const firstCall = fetchMock.mock.calls[0] as { arguments: unknown[] } | undefined;
  assert.equal(firstCall?.arguments[0], 'https://updates.example.com/check');
  assert.equal((firstCall?.arguments[1] as RequestInit | undefined)?.method, 'POST');

  const body = JSON.parse(String((firstCall?.arguments[1] as RequestInit | undefined)?.body ?? '{}'));
  assert.equal(body.installId, 'install-123');
  assert.equal(body.machineId, 'machine-123');
  assert.equal(body.appVersion, '1.9.0');
  assert.equal(body.locale, 'zh-CN');
});

test('checkForInstallerUpdate returns null when the server version is not newer', async () => {
  const fetchMock = mock.fn(async () => {
    return new Response(
      JSON.stringify({
        latestVersion: '1.9.0',
        websiteUrl: 'https://example.com/download'
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  });

  const result = await checkForInstallerUpdate({
    endpoint: 'https://updates.example.com/check',
    appVersion: '1.9.0',
    installId: 'install-123',
    machineId: 'machine-123',
    platform: 'windows',
    osVersion: '11',
    arch: 'x64',
    locale: 'en-US',
    fetchImpl: fetchMock as typeof fetch,
    timeoutMs: 500
  });

  assert.equal(result, null);
});

test('runInstallerUpdateCheck only persists the timestamp after a successful request', async () => {
  const persistedTimestamps: Array<number | null> = [];
  const fetchMock = mock.fn(async () => {
    return new Response(
      JSON.stringify({
        latestVersion: '1.10.0',
        websiteUrl: 'https://example.com/download'
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  });

  const result = await runInstallerUpdateCheck({
    endpoint: 'https://updates.example.com/check',
    now: 1_700_000_000_000,
    getLastCheckedAt: () => null,
    persistLastCheckedAt: (timestamp) => persistedTimestamps.push(timestamp),
    getAppVersion: async () => '1.9.0',
    getInstallId: () => 'install-123',
    getMachineId: async () => 'machine-123',
    getClientMetadata: () => ({
      platform: 'windows',
      osVersion: '11',
      arch: 'x64',
      locale: 'zh-CN'
    }),
    fetchImpl: fetchMock as typeof fetch
  });

  assert.deepEqual(result, {
    latestVersion: '1.10.0',
    websiteUrl: 'https://example.com/download',
    title: null,
    message: null
  });
  assert.deepEqual(persistedTimestamps, [1_700_000_000_000]);
});

test('runInstallerUpdateCheck does not persist the timestamp when the request fails', async () => {
  const persistedTimestamps: Array<number | null> = [];
  const fetchMock = mock.fn(async () => {
    throw new Error('network down');
  });

  const result = await runInstallerUpdateCheck({
    endpoint: 'https://updates.example.com/check',
    now: 1_700_000_000_000,
    getLastCheckedAt: () => null,
    persistLastCheckedAt: (timestamp) => persistedTimestamps.push(timestamp),
    getAppVersion: async () => '1.9.0',
    getInstallId: () => 'install-123',
    getMachineId: async () => 'machine-123',
    getClientMetadata: () => ({
      platform: 'windows',
      osVersion: '11',
      arch: 'x64',
      locale: 'zh-CN'
    }),
    fetchImpl: fetchMock as typeof fetch
  });

  assert.equal(result, null);
  assert.deepEqual(persistedTimestamps, []);
});

test('runInstallerUpdateCheck persists the timestamp when the request succeeds without an update', async () => {
  const persistedTimestamps: Array<number | null> = [];
  const fetchMock = mock.fn(async () => {
    return new Response(
      JSON.stringify({
        latestVersion: '1.9.0',
        websiteUrl: 'https://example.com/download'
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  });

  const result = await runInstallerUpdateCheck({
    endpoint: 'https://updates.example.com/check',
    now: 1_700_000_000_000,
    getLastCheckedAt: () => null,
    persistLastCheckedAt: (timestamp) => persistedTimestamps.push(timestamp),
    getAppVersion: async () => '1.9.0',
    getInstallId: () => 'install-123',
    getMachineId: async () => 'machine-123',
    getClientMetadata: () => ({
      platform: 'windows',
      osVersion: '11',
      arch: 'x64',
      locale: 'zh-CN'
    }),
    fetchImpl: fetchMock as typeof fetch
  });

  assert.equal(result, null);
  assert.deepEqual(persistedTimestamps, [1_700_000_000_000]);
});

test('runInstallerUpdateCheck can bypass the throttle window for a user-triggered refresh', async () => {
  const persistedTimestamps: Array<number | null> = [];
  const fetchMock = mock.fn(async () => {
    return new Response(
      JSON.stringify({
        latestVersion: '1.9.0',
        websiteUrl: 'https://example.com/download'
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  });

  await runInstallerUpdateCheck({
    endpoint: 'https://updates.example.com/check',
    now: 1_700_000_000_000,
    getLastCheckedAt: () => 1_699_999_990_000,
    persistLastCheckedAt: (timestamp) => persistedTimestamps.push(timestamp),
    getAppVersion: async () => '1.9.0',
    getInstallId: () => 'install-123',
    getMachineId: async () => 'machine-123',
    getClientMetadata: () => ({
      platform: 'windows',
      osVersion: '11',
      arch: 'x64',
      locale: 'zh-CN'
    }),
    fetchImpl: fetchMock as typeof fetch,
    force: true
  });

  assert.equal(fetchMock.mock.calls.length, 1);
  assert.deepEqual(persistedTimestamps, [1_700_000_000_000]);
});
