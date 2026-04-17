import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isNonEmptyString,
  isRecord,
  normalizeAuthRecord,
  normalizePlayerObservation
} from './normalize.ts';

test('isRecord accepts plain objects and rejects arrays, null, and primitives', () => {
  assert.equal(isRecord({}), true);
  assert.equal(isRecord({ a: 1 }), true);
  assert.equal(isRecord([]), false);
  assert.equal(isRecord(null), false);
  assert.equal(isRecord('x'), false);
  assert.equal(isRecord(5), false);
  assert.equal(isRecord(undefined), false);
});

test('isNonEmptyString accepts non-empty trimmed strings only', () => {
  assert.equal(isNonEmptyString('a'), true);
  assert.equal(isNonEmptyString(''), false);
  assert.equal(isNonEmptyString('   '), false);
  assert.equal(isNonEmptyString(0), false);
  assert.equal(isNonEmptyString(null), false);
  assert.equal(isNonEmptyString(undefined), false);
});

test('normalizePlayerObservation accepts a well-formed observation', () => {
  const observation = {
    player_account_id: 'player-1',
    player_username: 'player-one',
    observed_at_utc: '2026-04-11T01:00:00.000Z'
  };

  assert.deepEqual(normalizePlayerObservation(observation), observation);
});

test('normalizePlayerObservation preserves optional installation_hint', () => {
  const observation = {
    player_account_id: 'player-1',
    player_username: 'player-one',
    observed_at_utc: '2026-04-11T01:00:00.000Z',
    installation_hint: 'hint-abc'
  };

  assert.deepEqual(normalizePlayerObservation(observation), observation);
});

test('normalizePlayerObservation rejects missing or blank required fields', () => {
  assert.equal(normalizePlayerObservation(null), null);
  assert.equal(normalizePlayerObservation({}), null);
  assert.equal(
    normalizePlayerObservation({
      player_account_id: '',
      player_username: 'u',
      observed_at_utc: 't'
    }),
    null
  );
  assert.equal(
    normalizePlayerObservation({
      player_account_id: 'p',
      player_username: 'u'
    }),
    null
  );
});

test('normalizeAuthRecord accepts a well-formed record', () => {
  const record = {
    token: 'token-1',
    player_account_id: 'player-1',
    player_username: 'player-one',
    issued_at_utc: '2026-04-11T01:00:00.000Z'
  };

  assert.deepEqual(normalizeAuthRecord(record), record);
});

test('normalizeAuthRecord rejects blank required fields', () => {
  const record = {
    token: '',
    player_account_id: 'player-1',
    player_username: 'player-one',
    issued_at_utc: '2026-04-11T01:00:00.000Z'
  };

  assert.equal(normalizeAuthRecord(record), null);
});
