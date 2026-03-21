import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const workspaceRoot = resolve(import.meta.dirname, '../../../..');
const modalSource = readFileSync(
  resolve(workspaceRoot, 'src/lib/components/installer/InstallerInstallPreviewModal.svelte'),
  'utf8'
);

test('install preview modal uses the new installation summary copy', () => {
  assert.equal(
    modalSource.includes(
      'BazaarPlusPlus 包含几项最常用的功能：战绩记录、战斗回放、野怪预览、升级预览和附魔预览。'
    ),
    true
  );
  assert.equal(
    modalSource.includes(
      "This installation enables several of BazaarPlusPlus's most useful enhancements, including match history, battle replay, monster preview, level-up preview, and enchantment preview."
    ),
    true
  );
});

test('install preview modal uses an install-content acknowledgement', () => {
  assert.equal(modalSource.includes('我已了解本次安装会启用哪些内容，并准备继续'), true);
  assert.equal(
    modalSource.includes('I understand what this installation enables and I am ready to continue.'),
    true
  );
});

test('install preview modal keeps the lightweight uninstall disclaimer', () => {
  assert.equal(
    modalSource.includes('如需恢复原状，之后可随时卸载'),
    true
  );
  assert.equal(
    modalSource.includes('you can uninstall later at any time'),
    true
  );
});

test('install preview modal no longer uses feature-card headings', () => {
  assert.equal(modalSource.includes('怪物预览增强'), false);
  assert.equal(modalSource.includes('Enhanced Monster Preview'), false);
});
