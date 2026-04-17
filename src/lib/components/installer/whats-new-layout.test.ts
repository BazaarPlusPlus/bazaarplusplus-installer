import { test, expect } from 'vitest';
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
  expect(headerSource.includes('header-link-featured')).toBe(false);
  expect(headerSource.includes('查看 WhatsNew')).toBe(false);
  expect(headerSource.includes("Open What's New")).toBe(false);
});

test('step I no longer renders a whats new action rail', () => {
  expect(statusStepsSource.includes('step-body step-body-bpp')).toBe(false);
  expect(statusStepsSource.includes('step-bpp-action')).toBe(false);
  expect(statusStepsSource.includes('step-bpp-content')).toBe(false);
  expect(statusStepsSource.includes('mismatch-link-button')).toBe(false);
  expect(statusStepsSource.includes("What's New")).toBe(false);
});

test('version mismatch section removes the old inline link copy', () => {
  expect(statusStepsSource.includes('查看更新内容')).toBe(false);
  expect(statusStepsSource.includes("View what's new")).toBe(false);
});

test('version mismatch pills are stacked vertically', () => {
  expect(statusStepsSource).toMatch(
    /\.mismatch-versions\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/
  );
});

test('latest-version state removes the green status frame and uses the latest-state copy', () => {
  expect(
    statusStepsSource.includes(
      `<span class="tag tag-ok">{t('statusInstalled')}{env?.bpp_version ? \` · v\${env?.bpp_version}\` : ''}</span>`
    )
  ).toBe(false);
  expect(statusStepsSource.includes('modInstalledHint')).toBe(false);
  expect(
    statusStepsSource.includes('BazaarPlusPlus 当前已处于最新状态。')
  ).toBe(false);
  expect(statusStepsSource.includes('BazaarPlusPlus 当前已处于最新状态')).toBe(
    true
  );
  expect(statusStepsSource.includes('{:else if modInstalled}')).toBe(true);
});

test('bazaar found UI requires a non-empty effective path', () => {
  expect(
    statusStepsSource.includes(
      'class:step-found={bazaarFound && Boolean(effectiveGamePath)}'
    )
  ).toBe(true);
  expect(
    statusStepsSource.includes('{#if bazaarFound && effectiveGamePath}')
  ).toBe(true);
});
