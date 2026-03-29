import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('home page runs the update check on mount and renders the update banner copy', async () => {
  const [pageSource, i18nSource, headerSource] = await Promise.all([
    readFile(new URL('../../routes/+page.svelte', import.meta.url), 'utf8'),
    readFile(new URL('../i18n.ts', import.meta.url), 'utf8'),
    readFile(new URL('../components/installer/InstallerHeader.svelte', import.meta.url), 'utf8')
  ]);

  assert.match(pageSource, /void loadInstallerUpdate\(\);/);
  assert.match(pageSource, /updateBanner/);
  assert.match(pageSource, /\{updateCheckState\}/);
  assert.match(pageSource, /onUpdateStatusClick=/);
  assert.match(pageSource, /loadInstallerUpdate\(true\)/);
  assert.match(pageSource, /openUpdateWebsite\(\)/);
  assert.match(headerSource, /update-status-toggle/);
  assert.match(i18nSource, /updateStatusChecking/);
  assert.match(i18nSource, /updateStatusLatest/);
  assert.match(i18nSource, /updateStatusAvailable/);
  assert.match(i18nSource, /updateStatusFailed/);
});
