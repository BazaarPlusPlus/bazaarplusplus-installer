import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveWhatsNewRelease, whatsNewReleases } from './whats-new.ts';

test('resolveWhatsNewRelease matches the requested version exactly', () => {
  const release = resolveWhatsNewRelease('2.3.6');

  assert.equal(release.version, '2.3.6');
  assert.equal(release.sections[0]?.title.en, 'Ghost Battle Replay');
});

test('resolveWhatsNewRelease falls back to the latest known release', () => {
  const release = resolveWhatsNewRelease('9.9.9');

  assert.equal(release.version, whatsNewReleases[0]?.version);
});
