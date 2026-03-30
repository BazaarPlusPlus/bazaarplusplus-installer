import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import * as supportersModule from './supporters.ts';
import type { SupportersResponse } from './types.ts';

const { loadSupportersData, normalizeSupporterPayload, sortSupporters } =
  supportersModule;

test('normalizeSupporterPayload drops invalid supporter entries', () => {
  const payload = normalizeSupporterPayload([
    { name: '  Alice  ', tier: 4 },
    { name: '', tier: 3 },
    { name: 'Bob', tier: 7, amount: 0.2 },
    { name: 'Carol', tier: 2, amount: 0.145 }
  ]);

  assert.deepEqual(payload, [
    { name: 'Alice', tier: 4 },
    { name: 'Carol', tier: 2 }
  ]);
  assert.equal(
    payload.every((entry) => !('amount' in entry)),
    true
  );
});

test('sortSupporters sorts by tier, then name', () => {
  const payload = sortSupporters([
    { name: 'Zed', tier: 3, amount: 0.3 },
    { name: 'Amy', tier: 4, amount: 0.2 },
    { name: 'Bob', tier: 4, amount: 0.9 },
    { name: 'Cara', tier: 4, amount: 0.5 }
  ] as unknown as Parameters<typeof sortSupporters>[0]);

  assert.deepEqual(
    payload.map((entry) => entry.name),
    ['Amy', 'Bob', 'Cara', 'Zed']
  );
});

test('shuffleSupportersWithinTier keeps tier order and shuffles within each tier', () => {
  assert.equal(typeof supportersModule.shuffleSupportersWithinTier, 'function');

  const randomValues = [0, 0.99, 0];
  const payload = supportersModule.shuffleSupportersWithinTier?.(
    [
      { name: 'Amy', tier: 4 },
      { name: 'Bob', tier: 4 },
      { name: 'Cara', tier: 4 },
      { name: 'Dan', tier: 3 },
      { name: 'Eve', tier: 3 },
      { name: 'Finn', tier: 2 }
    ],
    () => randomValues.shift() ?? 0.5
  );

  assert.deepEqual(
    payload?.map((entry) => entry.tier),
    [4, 4, 4, 3, 3, 2]
  );
  assert.deepEqual(
    payload?.map((entry) => entry.name),
    ['Bob', 'Amy', 'Cara', 'Eve', 'Dan', 'Finn']
  );
});

test('loadSupportersData reuses the same shuffle for repeated bundled snapshots', async () => {
  assert.equal(typeof supportersModule.resetSupportersDataCache, 'function');

  const fetchMock = mock.fn(async () => {
    return new Response(
      JSON.stringify([
        { name: 'Amy', tier: 4 },
        { name: 'Bob', tier: 4 },
        { name: 'Dan', tier: 3 },
        { name: 'Eve', tier: 3 }
      ]),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  });

  const randomValues = [0, 0];

  try {
    supportersModule.resetSupportersDataCache?.();

    const firstPayload = await loadSupportersData({
      hasTauriRuntime: false,
      fetchImpl: fetchMock as typeof fetch,
      randomFn: () => randomValues.shift() ?? 0.75
    });
    const secondPayload = await loadSupportersData({
      hasTauriRuntime: false,
      fetchImpl: fetchMock as typeof fetch,
      randomFn: () => 0.25
    });

    assert.deepEqual(
      firstPayload.entries.map((entry) => entry.name),
      ['Bob', 'Amy', 'Eve', 'Dan']
    );
    assert.deepEqual(secondPayload.entries, firstPayload.entries);
    assert.equal(fetchMock.mock.callCount(), 2);
  } finally {
    supportersModule.resetSupportersDataCache?.();
  }
});

test('loadSupportersData revalidates tauri data while preserving shuffle for the same snapshot', async () => {
  const tauriPayload: SupportersResponse = {
    entries: [
      { name: 'Amy', tier: 4 },
      { name: 'Bob', tier: 4 },
      { name: 'Dan', tier: 3 },
      { name: 'Eve', tier: 3 }
    ],
    source: 'cache',
    fetchedAt: 100,
    stale: false
  };
  const loadFromTauri = mock.fn(
    async (): Promise<SupportersResponse> => tauriPayload
  );

  try {
    supportersModule.resetSupportersDataCache?.();

    const firstPayload = await loadSupportersData({
      hasTauriRuntime: true,
      loadFromTauri,
      randomFn: () => 0
    });
    const secondPayload = await loadSupportersData({
      hasTauriRuntime: true,
      loadFromTauri,
      randomFn: () => 0.99
    });

    assert.equal(loadFromTauri.mock.callCount(), 2);
    assert.deepEqual(secondPayload.entries, firstPayload.entries);
  } finally {
    supportersModule.resetSupportersDataCache?.();
  }
});

test('loadSupportersData picks up a newer tauri snapshot on a later load', async () => {
  const firstSnapshot: SupportersResponse = {
    entries: [
      { name: 'Amy', tier: 4 },
      { name: 'Bob', tier: 4 }
    ],
    source: 'cache',
    fetchedAt: 100,
    stale: false
  };
  const secondSnapshot: SupportersResponse = {
    entries: [
      { name: 'Cara', tier: 4 },
      { name: 'Dan', tier: 3 }
    ],
    source: 'remote',
    fetchedAt: 200,
    stale: false
  };
  let callIndex = 0;
  const loadFromTauri = mock.fn(async (): Promise<SupportersResponse> => {
    callIndex += 1;

    if (callIndex === 1) {
      return firstSnapshot;
    }

    return secondSnapshot;
  });

  try {
    supportersModule.resetSupportersDataCache?.();

    const firstPayload = await loadSupportersData({
      hasTauriRuntime: true,
      loadFromTauri,
      randomFn: () => 0
    });
    const secondPayload = await loadSupportersData({
      hasTauriRuntime: true,
      loadFromTauri,
      randomFn: () => 0
    });

    assert.equal(loadFromTauri.mock.callCount(), 2);
    assert.deepEqual(
      firstPayload.entries.map((entry) => entry.name),
      ['Bob', 'Amy']
    );
    assert.deepEqual(
      secondPayload.entries.map((entry) => entry.name),
      ['Cara', 'Dan']
    );
    assert.equal(secondPayload.fetchedAt, 200);
  } finally {
    supportersModule.resetSupportersDataCache?.();
  }
});

test('loadSupportersData falls back to bundled JSON when Tauri runtime is unavailable', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = mock.fn(async () => {
    return new Response(JSON.stringify([{ name: 'Remote', tier: 4 }]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  });

  globalThis.fetch = fetchMock as typeof fetch;

  try {
    supportersModule.resetSupportersDataCache?.();

    const payload = await loadSupportersData({
      hasTauriRuntime: false
    });

    assert.deepEqual(payload.entries, [{ name: 'Remote', tier: 4 }]);
    assert.equal(payload.source, 'bundled');
    assert.equal(fetchMock.mock.callCount(), 1);
    const firstCall = fetchMock.mock.calls[0] as
      | { arguments: unknown[] }
      | undefined;
    assert.equal(firstCall?.arguments[0], '/support/supporter-list.json');
  } finally {
    supportersModule.resetSupportersDataCache?.();
    globalThis.fetch = originalFetch;
  }
});
