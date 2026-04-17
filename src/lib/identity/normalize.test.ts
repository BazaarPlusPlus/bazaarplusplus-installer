import { test, expect } from 'vitest';

import {
  isNonEmptyString,
  isRecord,
  normalizeAuthRecord,
  normalizePlayerObservation
} from './normalize.ts';

test('isRecord accepts plain objects and rejects arrays, null, and primitives', () => {
  expect(isRecord({})).toBe(true);
  expect(isRecord({ a: 1 })).toBe(true);
  expect(isRecord([])).toBe(false);
  expect(isRecord(null)).toBe(false);
  expect(isRecord('x')).toBe(false);
  expect(isRecord(5)).toBe(false);
  expect(isRecord(undefined)).toBe(false);
});

test('isNonEmptyString accepts non-empty trimmed strings only', () => {
  expect(isNonEmptyString('a')).toBe(true);
  expect(isNonEmptyString('')).toBe(false);
  expect(isNonEmptyString('   ')).toBe(false);
  expect(isNonEmptyString(0)).toBe(false);
  expect(isNonEmptyString(null)).toBe(false);
  expect(isNonEmptyString(undefined)).toBe(false);
});

test('normalizePlayerObservation accepts a well-formed observation', () => {
  const observation = {
    player_account_id: 'player-1',
    player_username: 'player-one',
    observed_at_utc: '2026-04-11T01:00:00.000Z'
  };

  expect(normalizePlayerObservation(observation)).toEqual(observation);
});

test('normalizePlayerObservation preserves optional installation_hint', () => {
  const observation = {
    player_account_id: 'player-1',
    player_username: 'player-one',
    observed_at_utc: '2026-04-11T01:00:00.000Z',
    installation_hint: 'hint-abc'
  };

  expect(normalizePlayerObservation(observation)).toEqual(observation);
});

test('normalizePlayerObservation rejects missing or blank required fields', () => {
  expect(normalizePlayerObservation(null)).toBe(null);
  expect(normalizePlayerObservation({})).toBe(null);
  expect(
    normalizePlayerObservation({
      player_account_id: '',
      player_username: 'u',
      observed_at_utc: 't'
    })
  ).toBe(null);
  expect(
    normalizePlayerObservation({
      player_account_id: 'p',
      player_username: 'u'
    })
  ).toBe(null);
});

test('normalizeAuthRecord accepts a well-formed record', () => {
  const record = {
    token: 'token-1',
    player_account_id: 'player-1',
    player_username: 'player-one',
    issued_at_utc: '2026-04-11T01:00:00.000Z'
  };

  expect(normalizeAuthRecord(record)).toEqual(record);
});

test('normalizeAuthRecord rejects blank required fields', () => {
  const record = {
    token: '',
    player_account_id: 'player-1',
    player_username: 'player-one',
    issued_at_utc: '2026-04-11T01:00:00.000Z'
  };

  expect(normalizeAuthRecord(record)).toBe(null);
});
