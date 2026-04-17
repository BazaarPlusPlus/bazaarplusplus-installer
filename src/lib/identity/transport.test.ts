import test from 'node:test';
import assert from 'node:assert/strict';

import { readJsonOrError } from './transport.ts';

test('readJsonOrError preserves explicit API error codes', async () => {
  await assert.rejects(
    readJsonOrError({
      status: 400,
      body: JSON.stringify({ error: 'invalid_request' })
    }),
    /invalid_request/
  );
});

test('readJsonOrError includes status and response length for non-json failures', async () => {
  await assert.rejects(
    readJsonOrError({
      status: 404,
      body: '<html><body>not found</body></html>'
    }),
    /identity_request_failed:404:len=35/
  );
});
