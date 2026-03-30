import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const workspaceRoot = resolve(import.meta.dirname, '../../../..');
const headerSource = readFileSync(
  resolve(workspaceRoot, 'src/lib/components/installer/InstallerHeader.svelte'),
  'utf8'
);
const statusStepsSource = readFileSync(
  resolve(
    workspaceRoot,
    'src/lib/components/installer/InstallerStatusSteps.svelte'
  ),
  'utf8'
);

test('installer header no longer renders the featured whats new card', () => {
  assert.equal(headerSource.includes('header-link-featured'), false);
  assert.equal(headerSource.includes('查看 WhatsNew'), false);
  assert.equal(headerSource.includes("Open What's New"), false);
});

test('step I uses a fixed right-side action rail for whats new', () => {
  assert.equal(statusStepsSource.includes('step-bpp-action'), true);
  assert.equal(statusStepsSource.includes('step-bpp-content'), true);
  assert.equal(statusStepsSource.includes('mismatch-action-rail'), false);
  assert.equal(statusStepsSource.includes('mismatch-main'), false);
  assert.equal(statusStepsSource.includes('mismatch-link-button'), true);
});

test('version mismatch section removes the old inline link copy', () => {
  assert.equal(statusStepsSource.includes('查看更新内容'), false);
  assert.equal(statusStepsSource.includes("View what's new"), false);
});

test('version mismatch pills are stacked vertically', () => {
  assert.match(
    statusStepsSource,
    /\.mismatch-versions\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/
  );
});

test('latest-version state removes the green status frame and uses the latest-state copy', () => {
  assert.equal(
    statusStepsSource.includes(
      `<span class="tag tag-ok">{t('statusInstalled')}{env?.bpp_version ? \` · v\${env?.bpp_version}\` : ''}</span>`
    ),
    false
  );
  assert.equal(statusStepsSource.includes('modInstalledHint'), false);
  assert.equal(
    statusStepsSource.includes('BazaarPlusPlus 当前已处于最新状态。'),
    false
  );
  assert.equal(
    statusStepsSource.includes('BazaarPlusPlus 当前已处于最新状态'),
    true
  );
  assert.equal(statusStepsSource.includes('{:else if modInstalled}'), true);
});

test('bazaar found UI requires a non-empty effective path', () => {
  assert.equal(
    statusStepsSource.includes(
      'class:step-found={bazaarFound && Boolean(effectiveGamePath)}'
    ),
    true
  );
  assert.equal(
    statusStepsSource.includes('{#if bazaarFound && effectiveGamePath}'),
    true
  );
});
