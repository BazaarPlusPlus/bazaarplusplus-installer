# Installer Phase 2 — Identity Layer Restructure Implementation Plan

> Status: historical implementation record. The identity layer has already been split in the current codebase.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `src/lib/identity/api.ts` into focused transport / crypto / normalize / repository / use-case layers, move installation-record Tauri invokers out of `installer/api.ts`, and remove the reverse dependency from `identity/` → `installer/api.ts`.

**Architecture:** Current `identity/api.ts` (295 lines) mixes HTTP transport, WebCrypto, JWT export, JSON normalization concerns, and local file I/O (via `installer/api.ts`). We extract each concern into its own sibling file under `src/lib/identity/`, leave `api.ts` as the use-case layer composing them through the existing `IdentityApiDeps` DI surface, and move the five installation-record invokers from `installer/api.ts` into the new `identity/repository.ts`. `installer/api.ts` keeps shim re-exports (per spec) until Phase 5 removes them.

**Tech Stack:** TypeScript 5.9, SvelteKit 2.55, Svelte 5.55, `@tauri-apps/api` v2.10, `node --test --experimental-strip-types` for unit tests, `npm run check` (svelte-kit sync + svelte-check) for type validation.

---

## Parent Spec

`docs/superpowers/specs/2026-04-17-installer-cohesion-refactor-design.md` §"Phase 2 — Identity layer restructure".

## Baseline (pre-Phase-2 measurements on master `4f7fd9f`)

- `src/lib/identity/api.ts` — 295 lines
- `src/lib/identity/api.test.ts` — 115 lines
- `src/lib/installer/api.ts` — 114 lines
- `src/lib/identity/` directory contents: `api.test.ts`, `api.ts`, `codec.ts`, `state.test.ts`, `state.ts`, `types.ts`
- Full `npm test` passes: **84 tests**, 0 failures, 0 skipped
- `npm run check` expected clean (Phase 1 branches kept it clean)

## External consumers of the module surface (audit before starting)

| Symbol | Current location | External consumers | Post-Phase-2 location |
|---|---|---|---|
| `createIdentityApi` | `identity/api.ts` | `src/routes/install/+page.svelte:60`, `src/lib/identity/api.test.ts:5` | `identity/api.ts` (unchanged signature) |
| `IdentityApiDeps` | `identity/api.ts` | (structural only, used via `createIdentityApi(deps)`) | `identity/api.ts` (unchanged shape) |
| `IdentityTransportResponse` | `identity/api.ts` | (structural only, used via `IdentityApiDeps.postJsonImpl`) | `identity/transport.ts` (re-exported from `api.ts`) |
| `DEFAULT_V3_API_BASE_URL` | `identity/api.ts` | none outside this file | `identity/api.ts` (kept) |
| `generateInstallationKeyPair` | `identity/api.ts` | none outside this file | `identity/crypto.ts` |
| `readPlayerObservation` et al. (5 functions) | `installer/api.ts` | only internal DI defaults in `identity/api.ts` | `identity/repository.ts` (with shim re-exports in `installer/api.ts`) |
| `api.exportPrivateKeyToJwk` method | `identity/api.ts` returned object | **none** (dead in tree) | `identity/crypto.ts` as standalone export; removed from returned API object |

All other symbols (`IdentityHttpResponse`, `postIdentityJson`) stay in `installer/api.ts` — they are the **Tauri-side** identity HTTP bridge, unrelated to the fetch-based `postJsonWithFetch` in `identity/api.ts`.

---

## File Structure After Phase 2

- `src/lib/identity/transport.ts` — new: `IdentityTransportResponse`, `postJsonWithFetch`, `readJsonOrError<T>`
- `src/lib/identity/crypto.ts` — new: `generateInstallationKeyPair`, `exportPrivateKeyToJwk`
- `src/lib/identity/normalize.ts` — new: `isRecord`, `isNonEmptyString`, `normalizePlayerObservation`, `normalizeInstallationRecord`
- `src/lib/identity/normalize.test.ts` — new: tests for normalize helpers
- `src/lib/identity/repository.ts` — new: `readPlayerObservation`, `readInstallationRecord`, `readInstallationPrivateKey`, `writeInstallationRecord`, `writeInstallationPrivateKey` (moved from `installer/api.ts`)
- `src/lib/identity/api.ts` — shrunk to use-case layer: `createIdentityApi`, `IdentityApiDeps`, `DEFAULT_V3_API_BASE_URL`, re-export `IdentityTransportResponse`
- `src/lib/identity/api.test.ts` — minor import updates; behavioral assertions unchanged
- `src/lib/installer/api.ts` — shim `export { ... } from '$lib/identity/repository';` for the five moved functions; rest unchanged

## Invariants (all tasks must uphold)

1. `createIdentityApi(deps)`'s returned object must continue to expose `loadLocalIdentity`, `activateFirstAccount`, `loginAndCreateInstallation` with identical signatures. (`exportPrivateKeyToJwk` method may be dropped since it has no consumers — per spec.)
2. `IdentityApiDeps` field names and types must remain unchanged (they are structural; the signature exactly matches the old surface).
3. Full `npm test` must stay at **84 passing, 0 failing** throughout every intermediate commit.
4. `npm run check` must stay warning-/error-free at every commit.
5. No new runtime dependencies.
6. Never add `@ts-ignore`, `any`, or silently widen types to suppress errors.
7. Never rename, consolidate, or delete existing tests during a move. If test imports must update because a test's dependency moved, update only the import path.
8. Never add code whose only purpose is to suppress an unused-import warning (mirrors the Phase-1 hard rule).
9. Keep `installer/api.ts` shims for the five moved functions so downstream imports still resolve. The shim is a simple `export { ... } from '$lib/identity/repository';` line — no re-wrapping.

## Verification Command Recipe

- Type check: `npm run check` (must be clean)
- Full unit suite: `npm test` (must end with `tests 84`, `pass 84`, `fail 0`, or whatever count the task's own tests raise it to — never fewer)
- Focused identity tests (faster during iteration): `node --test --experimental-strip-types src/lib/identity/api.test.ts src/lib/identity/normalize.test.ts src/lib/identity/state.test.ts`

---

## Task 0 — Commit this plan

**Files:**
- Modify: `docs/superpowers/plans/2026-04-17-installer-phase-2-identity-restructure.md`

- [ ] **Step 1: Stage and commit the plan**

```bash
git add docs/superpowers/plans/2026-04-17-installer-phase-2-identity-restructure.md
git commit -m "$(cat <<'EOF'
Add Phase 2 identity layer restructure implementation plan

Covers extraction of transport, crypto, normalize, and repository layers
from src/lib/identity/api.ts, plus moving installation-record helpers from
installer/api.ts into identity/repository.ts to remove the reverse
dependency identified in the parent spec.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 1 — Extract `identity/repository.ts` (move from `installer/api.ts`)

**Why this first:** all later tasks need a stable import target for the DI defaults. Moving the repository module first means every subsequent task can import `readPlayerObservation` etc. from its final resting place without a second pass.

**Files:**
- Create: `src/lib/identity/repository.ts`
- Modify: `src/lib/installer/api.ts` (remove definitions, add shim re-exports)
- Modify: `src/lib/identity/api.ts` (update import path from `../installer/api.ts` to `./repository.ts`)
- Test: none new — behavior is a move, covered by existing `api.test.ts`

### Step-by-step

- [ ] **Step 1: Run baseline tests**

```bash
npm test 2>&1 | tail -5
npm run check 2>&1 | tail -10
```

Expected: `tests 84`, `pass 84`, `fail 0`; `npm run check` reports 0 errors and 0 warnings.

- [ ] **Step 2: Create `src/lib/identity/repository.ts`**

Contents (copied verbatim from `installer/api.ts` lines 76–96 except the top-level `invoke` import):

```ts
import { invoke } from '@tauri-apps/api/core';

export async function readPlayerObservation(gameRoot: string) {
  return invoke<string | null>('read_player_observation', { gameRoot });
}

export async function readInstallationRecord(gameRoot: string) {
  return invoke<string | null>('read_installation_record', { gameRoot });
}

export async function readInstallationPrivateKey(gameRoot: string) {
  return invoke<string | null>('read_installation_private_key', { gameRoot });
}

export async function writeInstallationRecord(gameRoot: string, payloadB64: string) {
  return invoke('write_installation_record', { gameRoot, payloadB64 });
}

export async function writeInstallationPrivateKey(
  gameRoot: string,
  privateKeyB64: string
) {
  return invoke('write_installation_private_key', { gameRoot, privateKeyB64 });
}
```

- [ ] **Step 3: Replace the definitions in `src/lib/installer/api.ts` with shim re-exports**

Delete lines 76–97 of `src/lib/installer/api.ts` (the five function definitions) and replace them with:

```ts
export {
  readPlayerObservation,
  readInstallationRecord,
  readInstallationPrivateKey,
  writeInstallationRecord,
  writeInstallationPrivateKey
} from '../identity/repository.ts';
```

Do **not** touch lines above 76 (other Tauri invokers, `postIdentityJson`, `IdentityHttpResponse` — these stay).

- [ ] **Step 4: Update `identity/api.ts` to import from its new sibling instead of the installer layer**

In `src/lib/identity/api.ts`, change:

```ts
import {
  readInstallationPrivateKey,
  readInstallationRecord,
  readPlayerObservation,
  writeInstallationPrivateKey,
  writeInstallationRecord
} from '../installer/api.ts';
```

to:

```ts
import {
  readInstallationPrivateKey,
  readInstallationRecord,
  readPlayerObservation,
  writeInstallationPrivateKey,
  writeInstallationRecord
} from './repository.ts';
```

- [ ] **Step 5: Run `npm run check`**

Run: `npm run check`
Expected: 0 errors, 0 warnings. If svelte-check complains about module resolution, double-check the relative paths used `./repository.ts` and `../identity/repository.ts` exactly.

- [ ] **Step 6: Run full tests**

Run: `npm test 2>&1 | tail -5`
Expected: `tests 84`, `pass 84`, `fail 0` (unchanged from baseline).

- [ ] **Step 7: Commit**

```bash
git add src/lib/identity/repository.ts src/lib/installer/api.ts src/lib/identity/api.ts
git commit -m "$(cat <<'EOF'
Move installation-record invokers to identity/repository.ts

Creates src/lib/identity/repository.ts holding readPlayerObservation,
readInstallationRecord, readInstallationPrivateKey,
writeInstallationRecord, and writeInstallationPrivateKey. installer/api.ts
keeps the five names available via a shim re-export so no downstream
import path changes in this commit; the shim will be removed in Phase 5
when the typed invoke bridge lands. identity/api.ts now imports the DI
defaults from its sibling repository module, removing the reverse
dependency from identity/ back into installer/api.ts.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — Extract `identity/transport.ts`

**Files:**
- Create: `src/lib/identity/transport.ts`
- Modify: `src/lib/identity/api.ts` (remove moved definitions, import from transport, re-export type)
- Test: none new — the moved code has no direct unit tests in the pre-refactor baseline; integration tests in `api.test.ts` cover it via `postJsonImpl` DI

### Step-by-step

- [ ] **Step 1: Create `src/lib/identity/transport.ts`**

Contents (copied verbatim from `identity/api.ts` lines 28–89):

```ts
export interface IdentityTransportResponse {
  status: number;
  body: string;
}

export async function readJsonOrError<T>(
  response: IdentityTransportResponse
): Promise<T> {
  const body = ((): { error?: string } | T | null => {
    try {
      return (JSON.parse(response.body || 'null') as { error?: string } | T | null) ?? null;
    } catch {
      return null;
    }
  })();

  if (response.status < 200 || response.status >= 300) {
    const errorCode =
      body && typeof body === 'object' && 'error' in body
        ? String(body.error ?? 'identity_request_failed')
        : 'identity_request_failed';
    throw new Error(errorCode);
  }

  return body as T;
}

export async function postJsonWithFetch(input: {
  url: string;
  body: string;
  authorization?: string;
}): Promise<IdentityTransportResponse> {
  const response = await fetch(input.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(input.authorization
        ? { authorization: `Bearer ${input.authorization}` }
        : {})
    },
    body: input.body
  });

  return {
    status: response.status,
    body: await response.text()
  };
}
```

Note: `readJsonOrError` and `postJsonWithFetch` become `export` (they were `async function` with no modifier before; internal-only). Exporting them is the minimum change that lets `api.ts` import them. They will be re-imported only by `api.ts`; no new external surface is created beyond the already-exported `IdentityTransportResponse` type.

- [ ] **Step 2: Remove the moved definitions from `identity/api.ts` and import them back**

In `src/lib/identity/api.ts`:

1. Delete lines 28–31 (`IdentityTransportResponse` interface).
2. Delete lines 47–67 (`async function readJsonOrError<T>...`).
3. Delete lines 69–89 (`async function postJsonWithFetch...`).
4. Add a new import directly below the existing `./codec.ts` import block:

```ts
import {
  postJsonWithFetch,
  readJsonOrError,
  type IdentityTransportResponse
} from './transport.ts';
```

5. Add a re-export immediately after the `import` block so external consumers that referenced `IdentityTransportResponse` via `IdentityApiDeps.postJsonImpl`'s return type see the same name exported from `api.ts`:

```ts
export type { IdentityTransportResponse } from './transport.ts';
```

- [ ] **Step 3: Run type check**

Run: `npm run check`
Expected: 0 errors, 0 warnings.

- [ ] **Step 4: Run full tests**

Run: `npm test 2>&1 | tail -5`
Expected: `tests 84`, `pass 84`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/identity/transport.ts src/lib/identity/api.ts
git commit -m "$(cat <<'EOF'
Extract identity/transport.ts for HTTP primitives

Moves IdentityTransportResponse, readJsonOrError, and postJsonWithFetch
out of identity/api.ts into identity/transport.ts. api.ts re-exports
IdentityTransportResponse so the IdentityApiDeps.postJsonImpl signature
remains unchanged for external consumers.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — Extract `identity/crypto.ts`

**Files:**
- Create: `src/lib/identity/crypto.ts`
- Modify: `src/lib/identity/api.ts` (remove `generateInstallationKeyPair`, remove `exportPrivateKeyToJwk` method on returned API, import from crypto)
- Test: none new — existing `api.test.ts` stubs `generateInstallationKeyPairImpl` and never calls `exportPrivateKeyToJwk`

### Step-by-step

- [ ] **Step 1: Create `src/lib/identity/crypto.ts`**

```ts
import { base64ToBase64Url, base64UrlToBase64, bytesToBase64 } from './codec.ts';
import type { InstallationKeyPair } from './types.ts';

export async function generateInstallationKeyPair(): Promise<InstallationKeyPair> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('webcrypto_unavailable');
  }

  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1])
    },
    true,
    ['sign', 'verify']
  );

  const jwk = (await crypto.subtle.exportKey(
    'jwk',
    keyPair.publicKey
  )) as JsonWebKey;
  const pkcs8 = new Uint8Array(
    await crypto.subtle.exportKey('pkcs8', keyPair.privateKey)
  );

  if (!jwk.n || !jwk.e) {
    throw new Error('installation_key_export_failed');
  }

  return {
    publicKey: {
      modulus_b64: base64UrlToBase64(jwk.n),
      exponent_b64: base64UrlToBase64(jwk.e)
    },
    privateKeyPkcs8B64: bytesToBase64(pkcs8)
  };
}

export function exportPrivateKeyToJwk(privateKeyPkcs8B64: string) {
  return {
    pkcs8_b64: privateKeyPkcs8B64,
    pkcs8_b64url: base64ToBase64Url(privateKeyPkcs8B64)
  };
}
```

- [ ] **Step 2: Remove the moved code from `identity/api.ts`**

In `src/lib/identity/api.ts`:

1. Delete lines 91–126 (`export async function generateInstallationKeyPair...`).
2. Inside the returned object of `createIdentityApi` (currently lines 288–293), delete the `exportPrivateKeyToJwk(privateKeyPkcs8B64: string) { ... }` method and the comma preceding it if any.
3. Drop `base64ToBase64Url` from the `./codec.ts` named-import list (it is no longer referenced in `api.ts`).
4. Add a new import for `generateInstallationKeyPair`:

```ts
import { generateInstallationKeyPair } from './crypto.ts';
```

- [ ] **Step 3: Run type check**

Run: `npm run check`
Expected: 0 errors, 0 warnings. If svelte-check complains about an unused import, recheck that `base64ToBase64Url` was removed from `./codec.ts` imports.

- [ ] **Step 4: Run full tests**

Run: `npm test 2>&1 | tail -5`
Expected: `tests 84`, `pass 84`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/identity/crypto.ts src/lib/identity/api.ts
git commit -m "$(cat <<'EOF'
Extract identity/crypto.ts for WebCrypto primitives

Moves generateInstallationKeyPair and exportPrivateKeyToJwk out of
identity/api.ts into identity/crypto.ts. The createIdentityApi returned
object no longer exposes exportPrivateKeyToJwk as a method; the symbol
had no external consumer in the tree and the Phase 2 spec lists only
loadLocalIdentity, activateFirstAccount, and loginAndCreateInstallation
as the use-case surface. Direct callers (none in the audited tree) can import
exportPrivateKeyToJwk from identity/crypto.ts.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — Create `identity/normalize.ts` with tests

**Why wire this in:** spec lists these names explicitly as Phase 2 deliverables and a module with no consumers is dead code. Wiring is limited to `loadLocalIdentity`: decoded envelopes pass through the normalizers and malformed payloads turn into `null` instead of a structurally-broken cast. No baseline test exercises malformed payloads, so no behavioral test breaks; new tests cover the normalizers and a regression case for `loadLocalIdentity`.

**Files:**
- Create: `src/lib/identity/normalize.ts`
- Create: `src/lib/identity/normalize.test.ts`
- Modify: `src/lib/identity/api.ts` (wire `normalizePlayerObservation` / `normalizeInstallationRecord` into `loadLocalIdentity`)
- Modify: `src/lib/identity/api.test.ts` (add one test for corrupted-payload → null snapshot field)

### Step-by-step

- [ ] **Step 1: Write failing tests for `normalize.ts`**

Create `src/lib/identity/normalize.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isNonEmptyString,
  isRecord,
  normalizeInstallationRecord,
  normalizePlayerObservation
} from './normalize.ts';

test('isRecord accepts plain objects and rejects arrays, null, and primitives', () => {
  assert.equal(isRecord({}), true);
  assert.equal(isRecord({ a: 1 }), true);
  assert.equal(isRecord([]), false);
  assert.equal(isRecord(null), false);
  assert.equal(isRecord('x'), false);
  assert.equal(isRecord(5), false);
  assert.equal(isRecord(undefined), false);
});

test('isNonEmptyString accepts non-empty trimmed strings only', () => {
  assert.equal(isNonEmptyString('a'), true);
  assert.equal(isNonEmptyString(''), false);
  assert.equal(isNonEmptyString('   '), false);
  assert.equal(isNonEmptyString(0), false);
  assert.equal(isNonEmptyString(null), false);
  assert.equal(isNonEmptyString(undefined), false);
});

test('normalizePlayerObservation accepts a well-formed observation', () => {
  const observation = {
    player_account_id: 'player-1',
    player_username: 'player-one',
    observed_at_utc: '2026-04-11T01:00:00.000Z'
  };

  assert.deepEqual(normalizePlayerObservation(observation), observation);
});

test('normalizePlayerObservation preserves optional installation_hint', () => {
  const observation = {
    player_account_id: 'player-1',
    player_username: 'player-one',
    observed_at_utc: '2026-04-11T01:00:00.000Z',
    installation_hint: 'hint-abc'
  };

  assert.deepEqual(normalizePlayerObservation(observation), observation);
});

test('normalizePlayerObservation rejects missing or blank required fields', () => {
  assert.equal(normalizePlayerObservation(null), null);
  assert.equal(normalizePlayerObservation({}), null);
  assert.equal(
    normalizePlayerObservation({
      player_account_id: '',
      player_username: 'u',
      observed_at_utc: 't'
    }),
    null
  );
  assert.equal(
    normalizePlayerObservation({
      player_account_id: 'p',
      player_username: 'u'
    }),
    null
  );
});

test('normalizeInstallationRecord accepts a well-formed record', () => {
  const record = {
    installation_id: 'inst-1',
    player_account_id: 'player-1',
    api_base_url: 'https://example',
    public_key: { modulus_b64: 'm', exponent_b64: 'e' },
    status: 'active',
    created_at_utc: '2026-04-11T01:00:00.000Z'
  };

  assert.deepEqual(normalizeInstallationRecord(record), record);
});

test('normalizeInstallationRecord rejects unknown status values', () => {
  const record = {
    installation_id: 'inst-1',
    player_account_id: 'player-1',
    api_base_url: 'https://example',
    public_key: { modulus_b64: 'm', exponent_b64: 'e' },
    status: 'pending',
    created_at_utc: '2026-04-11T01:00:00.000Z'
  };

  assert.equal(normalizeInstallationRecord(record), null);
});

test('normalizeInstallationRecord rejects malformed public_key', () => {
  const record = {
    installation_id: 'inst-1',
    player_account_id: 'player-1',
    api_base_url: 'https://example',
    public_key: { modulus_b64: '', exponent_b64: 'e' },
    status: 'active',
    created_at_utc: '2026-04-11T01:00:00.000Z'
  };

  assert.equal(normalizeInstallationRecord(record), null);
});
```

- [ ] **Step 2: Verify tests fail (module does not exist yet)**

Run: `node --test --experimental-strip-types src/lib/identity/normalize.test.ts`
Expected: fails with a module-not-found error pointing at `./normalize.ts`.

- [ ] **Step 3: Implement `src/lib/identity/normalize.ts`**

```ts
import type {
  InstallationPublicKey,
  InstallationRecordPayload,
  PlayerObservationPayload
} from './types.ts';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizePublicKey(value: unknown): InstallationPublicKey | null {
  if (!isRecord(value)) {
    return null;
  }

  const { modulus_b64, exponent_b64 } = value;
  if (!isNonEmptyString(modulus_b64) || !isNonEmptyString(exponent_b64)) {
    return null;
  }

  return { modulus_b64, exponent_b64 };
}

export function normalizePlayerObservation(
  value: unknown
): PlayerObservationPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  const { player_account_id, player_username, observed_at_utc, installation_hint } =
    value;
  if (
    !isNonEmptyString(player_account_id) ||
    !isNonEmptyString(player_username) ||
    !isNonEmptyString(observed_at_utc)
  ) {
    return null;
  }

  const normalized: PlayerObservationPayload = {
    player_account_id,
    player_username,
    observed_at_utc
  };

  if (typeof installation_hint === 'string') {
    normalized.installation_hint = installation_hint;
  } else if (installation_hint === null) {
    normalized.installation_hint = null;
  }

  return normalized;
}

export function normalizeInstallationRecord(
  value: unknown
): InstallationRecordPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  const {
    installation_id,
    player_account_id,
    api_base_url,
    public_key,
    status,
    created_at_utc
  } = value;
  if (
    !isNonEmptyString(installation_id) ||
    !isNonEmptyString(player_account_id) ||
    !isNonEmptyString(api_base_url) ||
    !isNonEmptyString(created_at_utc)
  ) {
    return null;
  }

  if (status !== 'active' && status !== 'revoked' && status !== 'stale') {
    return null;
  }

  const normalizedPublicKey = normalizePublicKey(public_key);
  if (normalizedPublicKey === null) {
    return null;
  }

  return {
    installation_id,
    player_account_id,
    api_base_url,
    public_key: normalizedPublicKey,
    status,
    created_at_utc
  };
}
```

- [ ] **Step 4: Verify normalize tests pass**

Run: `node --test --experimental-strip-types src/lib/identity/normalize.test.ts`
Expected: all 8 tests pass.

- [ ] **Step 5: Wire normalize into `loadLocalIdentity`**

In `src/lib/identity/api.ts`:

1. Add the import:

```ts
import {
  normalizeInstallationRecord,
  normalizePlayerObservation
} from './normalize.ts';
```

2. Inside `loadLocalIdentity` (currently lines 172–200 of the original file, post-Task-3 line numbers will differ), change the envelope-decoding block from:

```ts
      const observation = observationEnvelopeB64
        ? await decodePayloadEnvelope<PlayerObservationPayload>(
            base64ToBytes(observationEnvelopeB64)
          )
        : null;
      const installation = installationEnvelopeB64
        ? await decodePayloadEnvelope<InstallationRecordPayload>(
            base64ToBytes(installationEnvelopeB64)
          )
        : null;
```

to:

```ts
      const observation = observationEnvelopeB64
        ? normalizePlayerObservation(
            await decodePayloadEnvelope<unknown>(base64ToBytes(observationEnvelopeB64))
          )
        : null;
      const installation = installationEnvelopeB64
        ? normalizeInstallationRecord(
            await decodePayloadEnvelope<unknown>(
              base64ToBytes(installationEnvelopeB64)
            )
          )
        : null;
```

3. If the `PlayerObservationPayload` or `InstallationRecordPayload` named imports from `./types.ts` become unused after this edit, remove them from the import list. Leave the ones still referenced by `activateFirstAccount` / `loginAndCreateInstallation` / `buildInstallationRecord`.

- [ ] **Step 6: Add a `loadLocalIdentity` regression test for corrupted payloads**

Open `src/lib/identity/api.test.ts` and append (do not modify existing tests):

```ts
test('loadLocalIdentity returns null observation when envelope payload is malformed', async () => {
  const malformedBytes = await encodePayloadEnvelope({ unexpected: 'shape' });
  const malformedB64 = Buffer.from(malformedBytes).toString('base64');

  const api = createIdentityApi({
    readPlayerObservationImpl: async () => malformedB64,
    readInstallationRecordImpl: async () => null,
    readInstallationPrivateKeyImpl: async () => null
  });

  const snapshot = await api.loadLocalIdentity('/games/The Bazaar');

  assert.equal(snapshot.observation, null);
  assert.equal(snapshot.installation, null);
  assert.equal(snapshot.installationPrivateKeyPkcs8B64, null);
});
```

Note: `encodePayloadEnvelope` and `createIdentityApi` are already imported at the top of the file; no new imports required.

- [ ] **Step 7: Run type check and full tests**

```bash
npm run check
npm test 2>&1 | tail -5
```

Expected: `npm run check` clean; `npm test` shows 84 → 93 tests (84 baseline + 8 normalize + 1 new api.test.ts), all passing.

- [ ] **Step 8: Commit**

```bash
git add src/lib/identity/normalize.ts src/lib/identity/normalize.test.ts src/lib/identity/api.ts src/lib/identity/api.test.ts
git commit -m "$(cat <<'EOF'
Add identity/normalize.ts with loadLocalIdentity hardening

Introduces isRecord, isNonEmptyString, normalizePlayerObservation, and
normalizeInstallationRecord as pure type guards and shape validators.
loadLocalIdentity now decodes envelopes as unknown and runs the result
through the normalizers so structurally invalid persisted payloads
resolve to null instead of silently flowing through as broken casts. All
existing tests continue to pass; adds 8 unit tests for the normalizers
and a regression test for loadLocalIdentity handling a malformed
observation payload.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 — Final audit of `identity/api.ts` + open PR

**Goal:** confirm `api.ts` is now a thin use-case layer, no residual dead imports, returned object exposes only the three methods named by the spec, and open a single PR for all Phase 2 commits.

**Files:**
- Modify (if needed): `src/lib/identity/api.ts`
- No source changes if audit finds nothing.

### Step-by-step

- [ ] **Step 1: Diff the module against baseline**

```bash
git log --oneline master..HEAD
git diff master -- src/lib/identity/api.ts | head -200
```

Expected commits on the branch (post-Tasks 0–4): plan + 4 extraction commits.

- [ ] **Step 2: Read `src/lib/identity/api.ts` top-to-bottom**

Confirm the following and fix in place if any are violated:

- Only these `export`s remain: `DEFAULT_V3_API_BASE_URL`, `IdentityApiDeps`, `createIdentityApi`, and the `type { IdentityTransportResponse }` re-export.
- The returned object of `createIdentityApi` exposes exactly `loadLocalIdentity`, `activateFirstAccount`, `loginAndCreateInstallation`. No `exportPrivateKeyToJwk` method.
- No named import from `./codec.ts` is unreferenced in the file body (ripgrep: `grep -n "base64\|decodePayloadEnvelope\|encodePayloadEnvelope\|bytesToBase64" src/lib/identity/api.ts` — every listed name must appear in at least two places).
- No named import from `./types.ts` is unreferenced (same ripgrep approach).
- No residual `readJsonOrError`, `postJsonWithFetch`, `generateInstallationKeyPair` definitions.

- [ ] **Step 3: Run the complete verification recipe**

```bash
npm run check
npm test 2>&1 | tail -10
```

Expected: both clean. `npm test` shows the new test total (baseline 84 + 8 normalize + 1 regression = 93) with `fail 0`.

- [ ] **Step 4: Sanity-check the shim in `installer/api.ts`**

```bash
grep -n "readPlayerObservation\|readInstallationRecord\|readInstallationPrivateKey\|writeInstallationRecord\|writeInstallationPrivateKey\|postIdentityJson\|IdentityHttpResponse" src/lib/installer/api.ts
```

Expected: the five moved names appear only inside a single `export { ... } from '../identity/repository.ts';` block; `postIdentityJson` and `IdentityHttpResponse` are still defined here.

- [ ] **Step 5: Re-run full test suite one more time**

Run: `npm test`
Expected: `fail 0`.

- [ ] **Step 6: Push branch and open PR**

```bash
git push -u origin phase-2-identity-restructure
gh pr create --title "Identity layer restructure (Phase 2)" --body "$(cat <<'EOF'
## Summary

Implements Phase 2 of the installer cohesion refactor (`docs/superpowers/specs/2026-04-17-installer-cohesion-refactor-design.md`).

- Splits `src/lib/identity/api.ts` into focused sibling modules: `transport.ts` (HTTP), `crypto.ts` (WebCrypto / JWT export), `normalize.ts` (pure shape validators), and a slim `api.ts` that keeps only the use-case layer (`createIdentityApi` with `loadLocalIdentity`, `activateFirstAccount`, `loginAndCreateInstallation`).
- Moves the five installation-record Tauri invokers (`readPlayerObservation`, `readInstallationRecord`, `readInstallationPrivateKey`, `writeInstallationRecord`, `writeInstallationPrivateKey`) from `installer/api.ts` into a new `identity/repository.ts`. `installer/api.ts` retains shim re-exports so downstream imports continue to resolve; the shims will be removed in Phase 5 once the typed invoke bridge lands.
- Removes the reverse dependency from `identity/` back into `installer/api.ts`.
- `loadLocalIdentity` now runs decoded envelope payloads through the new normalizers so structurally invalid persisted payloads resolve to `null` instead of flowing through as broken type casts.

## Test plan

- [x] `npm run check` passes with 0 errors and 0 warnings
- [x] `npm test` passes (84 baseline + 8 normalize + 1 regression = 93 tests)
- [x] No change to `createIdentityApi` external signature or `IdentityApiDeps` shape
- [x] No change to the five moved functions' names, signatures, or Tauri command names

Release Notes:

- N/A
EOF
)"
```

Report the PR URL when done.

---

## Self-Review Checklist

Before dispatching the first implementer subagent, confirm:

1. **Spec coverage** — every Phase 2 bullet in the parent spec maps to a task:
   - transport.ts → Task 2 ✓
   - crypto.ts → Task 3 ✓
   - normalize.ts → Task 4 ✓
   - repository.ts (move from installer/api.ts) → Task 1 ✓
   - api.ts (use-case slim) → emerges across Tasks 2/3/4, audited in Task 5 ✓
   - Remove reverse dependency → achieved by Task 1 + Task 4 final import lines (`api.ts` imports only from sibling identity modules) ✓
   - Shim re-exports in `installer/api.ts` → Task 1 ✓
   - `api.test.ts` import updates — not needed; the test imports only `./api.ts`, `./codec.ts`, `./types.ts`, all of which keep the same paths ✓
2. **Placeholder scan** — no `TODO`, `TBD`, `implement later`, or "add error handling" in any task step. All code blocks are complete. ✓
3. **Type consistency** — names used across tasks:
   - `IdentityTransportResponse` — declared in transport.ts (Task 2), re-exported from api.ts (Task 2)
   - `normalizePlayerObservation` / `normalizeInstallationRecord` — declared in normalize.ts (Task 4), consumed in api.ts (Task 4)
   - `generateInstallationKeyPair` — moved to crypto.ts (Task 3), consumed via DI default in api.ts (Task 3)
   - `readPlayerObservation` et al. — moved to repository.ts (Task 1), consumed via DI default in api.ts (Task 1, already done before later tasks touch them)
4. **Invariants** — all 9 invariants listed above are respected by every task's commit.
5. **No behavior drift** — the only observable behavior change is: `loadLocalIdentity` now returns `null` for a malformed persisted payload instead of a cast-shaped broken object. No production code path in the audited baseline produces malformed payloads, and no existing test exercises that path.

---
