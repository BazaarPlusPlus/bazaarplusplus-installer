import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearPendingWhatsNewLaunch,
  loadPendingWhatsNewLaunch,
  markPendingWhatsNewLaunch
} from './post-update.ts';

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

test('pending whats-new launch is stored, normalized, and cleared', () => {
  const originalWindow = globalThis.window;
  const localStorage = createStorage();

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage }
  });

  try {
    assert.equal(loadPendingWhatsNewLaunch(), null);

    markPendingWhatsNewLaunch({
      reason: 'auto-update',
      fromVersion: ' 2.3.5 ',
      toVersion: ' 2.3.6 '
    });

    assert.deepEqual(loadPendingWhatsNewLaunch(), {
      reason: 'auto-update',
      fromVersion: '2.3.5',
      toVersion: '2.3.6'
    });

    clearPendingWhatsNewLaunch();
    assert.equal(loadPendingWhatsNewLaunch(), null);
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow
    });
  }
});

test('invalid pending whats-new payloads are ignored', () => {
  const originalWindow = globalThis.window;
  const localStorage = createStorage();

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage }
  });

  try {
    localStorage.setItem('bppinstaller:pending-whats-new-launch', 'not json');
    assert.equal(loadPendingWhatsNewLaunch(), null);

    localStorage.setItem(
      'bppinstaller:pending-whats-new-launch',
      JSON.stringify({ reason: 'manual', toVersion: '2.3.6' })
    );
    assert.equal(loadPendingWhatsNewLaunch(), null);
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow
    });
  }
});
