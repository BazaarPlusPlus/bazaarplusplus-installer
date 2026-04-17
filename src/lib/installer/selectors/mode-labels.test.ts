import test from 'node:test';
import assert from 'node:assert/strict';

import { selectModeLabels } from './mode-labels.ts';
import type { LocalizedText, TranslateText } from './types.ts';

const localized: LocalizedText = (zh, en) => en || zh;
const t: TranslateText = (key) => String(key);

test('selectModeLabels returns install-mode labels for English locale', () => {
  const selection = selectModeLabels({
    showStreamMode: false,
    locale: 'en',
    localized,
    t
  });

  assert.equal(selection.modeTitle, 'subtitle');
  assert.equal(selection.modeToggleLabel, 'Stream Mode');
  assert.equal(selection.dotnetDownloadUrl, 'https://dotnet.microsoft.com/en-us/download');
  assert.equal(selection.localeBadge, 'EN');
  assert.equal(selection.localeButtonLabel, '切换到中文');
});

test('selectModeLabels returns stream-mode labels for Chinese locale', () => {
  const zhLocalized: LocalizedText = (zh) => zh;
  const selection = selectModeLabels({
    showStreamMode: true,
    locale: 'zh',
    localized: zhLocalized,
    t
  });

  assert.equal(selection.modeTitle, 'streamTitle');
  assert.equal(selection.modeToggleLabel, '安装模式');
  assert.equal(selection.dotnetDownloadUrl, 'https://dotnet.microsoft.com/zh-cn/download');
  assert.equal(selection.localeBadge, '中');
  assert.equal(selection.localeButtonLabel, 'Switch to English');
});
