import { describe, expect, it } from 'vitest';
import { formatDateTime } from './format';

describe('History date formatting', () => {
  it('follows the selected locale', () => {
    const value = '2026-01-02T15:04:00';

    expect(formatDateTime(value, 'zh')).not.toBe(formatDateTime(value, 'en'));
    expect(formatDateTime(value, 'en')).toMatch(/AM|PM/);
  });
});
