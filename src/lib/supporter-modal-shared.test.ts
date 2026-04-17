import { test, expect } from 'vitest';
import { readFile } from 'node:fs/promises';

const SHARED_MODAL_IMPORT =
  '$lib/components/supporters/SupporterListModal.svelte';

test('home page and about page both use the shared supporter list modal', async () => {
  const [supportBarSource, aboutPageSource] = await Promise.all([
    readFile(
      new URL(
        './components/installer/InstallerSupportBar.svelte',
        import.meta.url
      ),
      'utf8'
    ),
    readFile(new URL('../routes/about/+page.svelte', import.meta.url), 'utf8')
  ]);

  expect(supportBarSource).toMatch(
    new RegExp(SHARED_MODAL_IMPORT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  );
  expect(aboutPageSource).toMatch(
    new RegExp(SHARED_MODAL_IMPORT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  );
});

test('supporter modal reloads data on each open instead of permanently caching the first load', async () => {
  const modalSource = await readFile(
    new URL(
      './components/supporters/SupporterListModal.svelte',
      import.meta.url
    ),
    'utf8'
  );

  expect(modalSource.includes('let supportersLoaded = false;')).toBe(false);
  expect(modalSource.includes('if (supportersLoaded) return;')).toBe(false);
});
