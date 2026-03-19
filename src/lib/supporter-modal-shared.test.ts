import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const SHARED_MODAL_IMPORT = "$lib/components/supporters/SupporterListModal.svelte";

test('home page and about page both use the shared supporter list modal', async () => {
  const [supportBarSource, aboutPageSource] = await Promise.all([
    readFile(
      new URL('./components/installer/InstallerSupportBar.svelte', import.meta.url),
      'utf8'
    ),
    readFile(new URL('../routes/about/+page.svelte', import.meta.url), 'utf8')
  ]);

  assert.match(supportBarSource, new RegExp(SHARED_MODAL_IMPORT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(aboutPageSource, new RegExp(SHARED_MODAL_IMPORT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
