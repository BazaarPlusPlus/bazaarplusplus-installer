import test from 'node:test';
import assert from 'node:assert/strict';

import { createStreamPageState } from './state.ts';

test('createStreamPageState surfaces fallback-port guidance', () => {
  const state = createStreamPageState({
    running: true,
    host: '127.0.0.1',
    port: 17658,
    overlay_url: 'http://127.0.0.1:17658/overlay',
    using_fallback_port: true,
    last_error: null,
    manual_from: null,
    started_at: '2026-04-11T21:00:00+08:00',
    effective_from: '2026-04-11T21:00:00+08:00',
    max_records: 5
  });

  assert.equal(state.canCopyUrl, true);
  assert.match(state.portMessage, /17658/);
  assert.match(state.portMessage, /fallback/i);
});

test('createStreamPageState warns that closing the window will hide to tray while running', () => {
  const state = createStreamPageState({
    running: true,
    host: '127.0.0.1',
    port: 17654,
    overlay_url: 'http://127.0.0.1:17654/overlay',
    using_fallback_port: false,
    last_error: null,
    manual_from: null,
    started_at: '2026-04-11T21:00:00+08:00',
    effective_from: '2026-04-11T21:00:00+08:00',
    max_records: 5
  });

  assert.match(state.lifecycleMessage, /tray/i);
});

test('toDateTimeLocalValue converts RFC3339 timestamps into datetime-local values', async () => {
  const { toDateTimeLocalValue } = await import('./state.ts');

  assert.equal(
    toDateTimeLocalValue('2026-04-11T21:05:00+08:00'),
    '2026-04-11T21:05'
  );
});

test('fromDateTimeLocalValue converts datetime-local values back into RFC3339 timestamps', async () => {
  const { fromDateTimeLocalValue } = await import('./state.ts');

  assert.equal(
    fromDateTimeLocalValue('2026-04-11T21:05'),
    '2026-04-11T21:05:00+08:00'
  );
});
