import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const workspaceRoot = resolve(import.meta.dirname, '../../../..');
const modalSource = readFileSync(
  resolve(
    workspaceRoot,
    'src/lib/components/installer/InstallerInstallPreviewModal.svelte'
  ),
  'utf8'
);

test('install preview modal points users to the latest tutorial video', () => {
  assert.equal(
    modalSource.includes('查看 B 站 BazaarPlusPlus 最新视频获取使用教程。'),
    true
  );
  assert.equal(
    modalSource.includes(
      'Check the latest BazaarPlusPlus video on Bilibili for the usage tutorial.'
    ),
    true
  );
  assert.equal(modalSource.includes('查看最新视频'), true);
  assert.equal(modalSource.includes('Watch Latest Video'), true);
  assert.equal(modalSource.includes('href={bilibiliUrl}'), true);
  assert.equal(modalSource.includes('onclick={onOpenBilibili}'), true);
});

test('install preview modal shows an installation risk disclaimer', () => {
  assert.equal(
    modalSource.includes('我确认安装插件存在风险，并愿意自行承担相关责任'),
    true
  );
  assert.equal(
    modalSource.includes(
      'I understand that installing this plugin involves risk, and I accept responsibility for proceeding.'
    ),
    true
  );
});

test('install preview modal no longer shows the old installation summary', () => {
  assert.equal(
    modalSource.includes(
      'BazaarPlusPlus 包含几项最常用的功能：战绩记录、战斗回放、野怪预览、升级预览和附魔预览。'
    ),
    false
  );
  assert.equal(
    modalSource.includes(
      "This installation enables several of BazaarPlusPlus's most useful enhancements, including match history, battle replay, monster preview, level-up preview, and enchantment preview."
    ),
    false
  );
});

test('install preview modal no longer uses feature-card headings', () => {
  assert.equal(modalSource.includes('怪物预览增强'), false);
  assert.equal(modalSource.includes('Enhanced Monster Preview'), false);
});
