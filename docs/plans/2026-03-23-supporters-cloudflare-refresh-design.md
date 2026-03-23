# Supporters Cloudflare Refresh Design

**Goal:** Return local supporter data immediately while refreshing the Cloudflare-backed payload in the background, and let the next modal reopen pick up that refreshed data without reshuffling unchanged snapshots.

## Problems

- The Rust Tauri command blocks on the remote `bpp-static` fetch whenever local data is stale or missing.
- The frontend shared loader caches the first response forever in the renderer session, so later modal opens do not re-check the refreshed local cache.
- The modal itself only loads once per component lifetime, which also prevents later opens from seeing updated data.

## Desired Behavior

- The Tauri command should always return local data immediately:
  - cached payload if present
  - otherwise bundled payload
- When the local payload is stale or missing, the app should start a background refresh from Cloudflare.
- A successful background refresh should update the on-disk cache.
- The current modal open does not need to update live.
- The next modal reopen or page reload should see the refreshed cache.
- Shuffled order should stay stable for the same payload snapshot and only change when the underlying data snapshot changes.

## Approach

### Rust

- Keep local payload selection synchronous.
- Replace the blocking stale-path remote fetch with a detached background refresh worker.
- Guard background refresh with a process-level in-flight flag so repeated openings do not spawn multiple simultaneous remote fetches.
- Extract the remote fetch + cache write flow into a reusable helper so it can be unit-tested directly.

### Frontend

- Remove the unconditional short-circuit cache for Tauri loads.
- Call the shared loader each time the modal opens.
- Keep a snapshot-aware shuffle cache keyed by the returned data version:
  - if the returned payload matches the prior snapshot, reuse the prior shuffled order
  - if the payload changed, reshuffle within each tier and store the new shuffled order

## Snapshot Identity

The frontend cache key should include enough data to detect remote updates reliably. A practical key is:

- `source`
- `fetchedAt`
- normalized supporter entry tuples (`name`, `tier`)

This avoids depending on unstable object identity while keeping unchanged cache reads stable.

## Testing

- Rust test proving stale local payload is returned immediately while a refresh task is scheduled.
- Rust test proving a successful refresh helper writes the latest remote payload to cache.
- Frontend test proving the same snapshot keeps the same shuffled order across multiple Tauri loads.
- Frontend test proving a changed snapshot gets reshuffled and returned on the next reopen-time load.
