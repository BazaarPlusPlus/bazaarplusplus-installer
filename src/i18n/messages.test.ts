import { describe, expect, it } from 'vitest';
import { formatMessage, messages } from './messages';

describe('messages catalog', () => {
  it('defines the same keys for every locale', () => {
    const zhKeys = Object.keys(messages.zh).sort();
    const enKeys = Object.keys(messages.en).sort();
    expect(enKeys).toEqual(zhKeys);
  });

  it('returns a different string per locale for the same key', () => {
    expect(formatMessage('zh', 'navInstall')).toBe('安装');
    expect(formatMessage('en', 'navInstall')).toBe('Install');
  });

  it('provides localized History empty-state guidance and actions', () => {
    expect(messages.zh.historyEmptyDescription).toContain('The Bazaar');
    expect(messages.en.historyEmptyDescription).toContain('The Bazaar');
    expect(messages.zh.historyEmptyRefresh).not.toBe(
      messages.en.historyEmptyRefresh
    );
    expect(messages.zh.historyEmptyInstall).not.toBe(
      messages.en.historyEmptyInstall
    );
  });
});

describe('formatMessage', () => {
  it('returns the raw message when no params are given', () => {
    expect(formatMessage('en', 'updateInstall')).toBe('Download & Install');
  });

  it('interpolates named placeholders', () => {
    expect(formatMessage('en', 'updateModalBody', { version: '4.1.0' })).toBe(
      'BazaarPlusPlus 4.1.0 is available.'
    );
    expect(formatMessage('zh', 'streamWindowOffset', { count: 3 })).toBe(
      '向前补 3 条记录'
    );
  });
});
