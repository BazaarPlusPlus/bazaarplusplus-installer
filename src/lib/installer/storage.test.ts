import test from 'node:test';
import assert from 'node:assert/strict';

import { loadPersistedCustomGamePath, persistCustomGamePath } from './storage.ts';

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

test('persistCustomGamePath stores and clears the selected game path', () => {
  const originalWindow = globalThis.window;
  const localStorage = createStorage();

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage }
  });

  try {
    assert.equal(loadPersistedCustomGamePath(), '');

    persistCustomGamePath('  /games/the-bazaar  ');
    assert.equal(loadPersistedCustomGamePath(), '/games/the-bazaar');

    persistCustomGamePath('   ');
    assert.equal(loadPersistedCustomGamePath(), '');
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow
    });
  }
});
