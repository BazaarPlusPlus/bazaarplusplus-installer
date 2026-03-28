import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getOrCreateInstallId,
  loadLastUpdateCheckAt,
  persistLastUpdateCheckAt
} from './storage.ts';

function createStorage() {
  const values = new Map<string, string>();

  return {
    getItem(key: string) {
      return values.has(key) ? values.get(key)! : null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    }
  };
}

test('getOrCreateInstallId persists and reuses the same id', () => {
  const originalWindow = globalThis.window;
  const localStorage = createStorage();
  const generatedIds = ['install-123', 'install-456'];

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage }
  });

  try {
    const firstId = getOrCreateInstallId(() => generatedIds.shift() ?? 'unexpected-id');
    const secondId = getOrCreateInstallId(() => generatedIds.shift() ?? 'unexpected-id');

    assert.equal(firstId, 'install-123');
    assert.equal(secondId, 'install-123');
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow
    });
  }
});

test('persistLastUpdateCheckAt stores and clears the timestamp', () => {
  const originalWindow = globalThis.window;
  const localStorage = createStorage();

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage }
  });

  try {
    assert.equal(loadLastUpdateCheckAt(), null);

    persistLastUpdateCheckAt(1700000000000);
    assert.equal(loadLastUpdateCheckAt(), 1700000000000);

    persistLastUpdateCheckAt(null);
    assert.equal(loadLastUpdateCheckAt(), null);
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow
    });
  }
});
