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
    max_records: 5,
    excluded_record_ids: []
  }, 'en');

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
    max_records: 5,
    excluded_record_ids: []
  }, 'en');

  assert.match(state.lifecycleMessage, /tray/i);
});

test('createStreamPageState returns localized Chinese copy when requested', () => {
  const state = createStreamPageState(
    {
      running: false,
      host: '127.0.0.1',
      port: null,
      overlay_url: null,
      using_fallback_port: false,
      last_error: null,
      manual_from: null,
      started_at: null,
      effective_from: null,
      max_records: 5,
      excluded_record_ids: []
    },
    'zh'
  );

  assert.match(state.portMessage, /未启动/);
  assert.match(state.lifecycleMessage, /正常退出/);
  assert.match(state.maxRecordsMessage, /最多展示 5 条/);
  assert.equal(state.effectiveStartValue, '未设置');
  assert.equal(state.effectiveStartSource, '尚未确定');
  assert.equal(state.manualStartValue, '未手动设置');
});

test('createStreamPageState keeps Chinese running status copy concise', () => {
  const state = createStreamPageState(
    {
      running: true,
      host: '127.0.0.1',
      port: 17654,
      overlay_url: 'http://127.0.0.1:17654/overlay',
      using_fallback_port: false,
      last_error: null,
      manual_from: null,
      started_at: '2026-04-11T21:00:00+08:00',
      effective_from: '2026-04-11T21:00:00+08:00',
      max_records: 5,
      excluded_record_ids: []
    },
    'zh'
  );

  assert.match(state.portMessage, /监听地址：127\.0\.0\.1:17654/);
  assert.doesNotMatch(state.portMessage, /当前监听地址为/);
  assert.equal(state.effectiveStartValue, '2026/04/11 21:00');
  assert.equal(state.effectiveStartSource, '本次开播时间');
  assert.equal(state.manualStartValue, '未手动设置');
});

test('createStreamPageState prefers manual filter time for effective start summary', () => {
  const state = createStreamPageState(
    {
      running: true,
      host: '127.0.0.1',
      port: 17654,
      overlay_url: 'http://127.0.0.1:17654/overlay',
      using_fallback_port: false,
      last_error: null,
      manual_from: '2026-04-11T20:30:00+08:00',
      started_at: '2026-04-11T21:00:00+08:00',
      effective_from: '2026-04-11T20:30:00+08:00',
      max_records: 5,
      excluded_record_ids: []
    },
    'zh'
  );

  assert.equal(state.effectiveStartValue, '2026/04/11 20:30');
  assert.equal(state.effectiveStartSource, '手动设置');
  assert.equal(state.manualStartValue, '2026/04/11 20:30');
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
