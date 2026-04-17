import test from 'node:test';
import assert from 'node:assert/strict';

import { selectUpdaterButton } from './updater-button.ts';
import type { TranslateText } from './types.ts';

const t: TranslateText = (key, params) => {
  switch (key) {
    case 'updaterReady':
      return `Ready ${params?.version ?? ''}`.trim();
    case 'updaterDownloading':
      return `Downloading ${params?.progress ?? ''}`.trim();
    case 'updaterInstallReady':
      return `Install ${params?.version ?? ''}`.trim();
    default:
      return String(key);
  }
};

test('selectUpdaterButton handles available updates', () => {
  const selection = selectUpdaterButton({
    snapshot: {
      status: 'available',
      currentVersion: '3.0.0',
      availableVersion: '3.1.0',
      errorMessage: null,
      progress: { downloadedBytes: 0, totalBytes: null }
    },
    hasPendingUpdate: true,
    t
  });

  assert.equal(selection.label, 'Ready 3.1.0');
  assert.equal(selection.title, 'updaterReadyTitle');
  assert.equal(selection.disabled, false);
  assert.equal(selection.highlighted, true);
  assert.equal(selection.progressLabel, null);
});

test('selectUpdaterButton handles downloading updates', () => {
  const selection = selectUpdaterButton({
    snapshot: {
      status: 'downloading',
      currentVersion: '3.0.0',
      availableVersion: '3.1.0',
      errorMessage: null,
      progress: { downloadedBytes: 1536, totalBytes: 2048 }
    },
    hasPendingUpdate: true,
    t
  });

  assert.equal(selection.label, 'Downloading 75% · 1.5 KB / 2.0 KB');
  assert.equal(selection.title, 'updaterInstalling');
  assert.equal(selection.disabled, true);
  assert.equal(selection.highlighted, false);
  assert.equal(selection.progressLabel, '75% · 1.5 KB / 2.0 KB');
});

test('selectUpdaterButton handles error states with and without pending updates', () => {
  const retry = selectUpdaterButton({
    snapshot: {
      status: 'error',
      currentVersion: '3.0.0',
      availableVersion: null,
      errorMessage: 'boom',
      progress: { downloadedBytes: 0, totalBytes: null }
    },
    hasPendingUpdate: true,
    t
  });
  const error = selectUpdaterButton({
    snapshot: {
      status: 'error',
      currentVersion: '3.0.0',
      availableVersion: null,
      errorMessage: 'boom',
      progress: { downloadedBytes: 0, totalBytes: null }
    },
    hasPendingUpdate: false,
    t
  });

  assert.equal(retry.label, 'updaterRetry');
  assert.equal(error.label, 'updaterErrorState');
  assert.equal(retry.title, 'updaterErrorTitle');
  assert.equal(error.title, 'updaterErrorTitle');
});
