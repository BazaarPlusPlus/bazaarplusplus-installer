import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const workspaceRoot = resolve(import.meta.dirname, '../../../..');
const modalSource = readFileSync(
  resolve(workspaceRoot, 'src/lib/components/installer/InstallerInstallPreviewModal.svelte'),
  'utf8'
);

test('install preview modal uses a general readiness acknowledgement', () => {
  assert.equal(
    modalSource.includes('我已阅读说明，并准备继续安装'),
    true
  );
  assert.equal(
    modalSource.includes('I have read the notes and I am ready to continue with the installation.'),
    true
  );
});

test('install preview modal no longer mentions enabling options from the in-game menu', () => {
  assert.equal(modalSource.includes('游戏内选项菜单'), false);
  assert.equal(modalSource.includes('in-game options menu'), false);
});

test('install preview modal includes a lightweight uninstall disclaimer', () => {
  assert.equal(
    modalSource.includes('如需恢复原状，可稍后使用卸载功能'),
    true
  );
  assert.equal(
    modalSource.includes('you can later use the uninstall action to restore the original state'),
    true
  );
});
