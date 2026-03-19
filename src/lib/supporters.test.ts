import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import { loadSupportersData, normalizeSupporterPayload, sortSupporters } from './supporters.ts';

test('normalizeSupporterPayload drops invalid supporter entries', () => {
  const payload = normalizeSupporterPayload([
    { name: '  Alice  ', tier: 4, amount: 1.499 },
    { name: '', tier: 3, amount: 0.5 },
    { name: 'Bob', tier: 7, amount: 0.2 },
    { name: 'Carol', tier: 2, amount: 0.145 }
  ]);

  assert.deepEqual(payload, [
    { name: 'Alice', tier: 4, amount: 1.5 },
    { name: 'Carol', tier: 2, amount: 0.15 }
  ]);
});

test('sortSupporters sorts by tier, amount, then name', () => {
  const payload = sortSupporters([
    { name: 'Zed', tier: 3, amount: 0.3 },
    { name: 'Amy', tier: 4, amount: 0.2 },
    { name: 'Bob', tier: 4, amount: 0.2 },
    { name: 'Cara', tier: 4, amount: 0.5 }
  ]);

  assert.deepEqual(payload.map((entry) => entry.name), ['Cara', 'Amy', 'Bob', 'Zed']);
});

test('loadSupportersData falls back to bundled JSON when Tauri runtime is unavailable', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = mock.fn(async () => {
    return new Response(JSON.stringify([{ name: 'Remote', tier: 4, amount: 1.2 }]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  });

  globalThis.fetch = fetchMock as typeof fetch;

  try {
    const payload = await loadSupportersData({
      hasTauriRuntime: false
    });

    assert.deepEqual(payload.entries, [{ name: 'Remote', tier: 4, amount: 1.2 }]);
    assert.equal(payload.source, 'bundled');
    assert.equal(fetchMock.mock.callCount(), 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
