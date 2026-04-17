import { test, expect } from 'vitest';

import { readJsonOrError } from './transport.ts';

test('readJsonOrError preserves explicit API error codes', async () => {
  await expect(
    readJsonOrError({
      status: 400,
      body: JSON.stringify({ error: 'invalid_request' })
    })
  ).rejects.toThrow(/invalid_request/);
});

test('readJsonOrError includes status and response length for non-json failures', async () => {
  await expect(
    readJsonOrError({
      status: 404,
      body: '<html><body>not found</body></html>'
    })
  ).rejects.toThrow(/identity_request_failed:404:len=35/);
});
