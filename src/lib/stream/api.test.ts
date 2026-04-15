import test from 'node:test';
import assert from 'node:assert/strict';

import { buildStreamCommandArgs } from './command-args.ts';

test('buildStreamCommandArgs includes trimmed custom game path', () => {
  assert.deepEqual(
    buildStreamCommandArgs('  D:\\Games\\The Bazaar  ', { limit: 5 }),
    {
      gamePath: 'D:\\Games\\The Bazaar',
      limit: 5
    }
  );
});

test('buildStreamCommandArgs omits blank custom game path', () => {
  assert.deepEqual(buildStreamCommandArgs('   ', { limit: 5 }), {
    limit: 5
  });
});
