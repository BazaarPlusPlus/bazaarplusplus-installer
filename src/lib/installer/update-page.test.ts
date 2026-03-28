import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('home page runs the update check on mount and renders the update banner copy', async () => {
  const [pageSource, i18nSource] = await Promise.all([
    readFile(new URL('../../routes/+page.svelte', import.meta.url), 'utf8'),
    readFile(new URL('../i18n.ts', import.meta.url), 'utf8')
  ]);

  assert.match(pageSource, /void loadInstallerUpdate\(\);/);
  assert.match(pageSource, /updateBanner/);
  assert.match(i18nSource, /updateAvailableTitle/);
  assert.match(i18nSource, /updateAvailableAction/);
});
