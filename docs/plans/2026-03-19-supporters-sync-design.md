# Supporters Sync Design

**Date:** 2026-03-19

**Goal:** Keep the shipped supporter list usable offline while refreshing it from R2 no more than once every 24 hours.

## Current State

- The installer support bar and the about page each load `/support/supportorlist.json` separately.
- The bundled JSON is the only source of truth today.
- Frontend components own payload validation, sorting, and error handling.

## Desired Behavior

- The release package still ships a bundled supporter list JSON.
- On startup, the app should show locally available data immediately.
- Local data priority:
  1. Cached JSON on disk
  2. Bundled JSON shipped with the app
- After local data is loaded, the app should decide whether to refresh from R2.
- Remote refresh should happen only when the last successful fetch is older than 24 hours.
- A successful remote fetch must replace the on-disk cache and update in-memory data.
- A failed or invalid remote fetch must not clear the current list.

## Architecture

- Move supporter loading into a dedicated Tauri command.
- Keep payload validation in one place on the Rust side.
- Return a normalized response to the frontend:
  - `entries`
  - `source`
  - `fetchedAt`
  - `stale`
- Add a small frontend loader so both Svelte entry points reuse the same behavior.
- Keep a web fallback that still reads the bundled JSON directly when Tauri is unavailable.

## Data Model

Each supporter entry remains:

- `name: string`
- `tier: 1 | 2 | 3 | 4`
- `amount: number`

Cached payload on disk should include metadata:

- `entries`
- `fetchedAt`

## Cache Policy

- Refresh interval: 24 hours.
- No cached file:
  - return bundled data
  - try remote fetch in the background
- Cached file younger than 24 hours:
  - return cached data
  - skip remote fetch
- Cached file older than 24 hours:
  - return cached data first
  - try remote fetch

## Error Handling

- Invalid bundled JSON is a hard app bug and should surface as an error in development.
- Invalid cache data should be ignored and treated as cache miss.
- Invalid remote data should be ignored and should not overwrite cache.
- Network failures should keep current data untouched.

## UI Expectations

- The supporter list should never disappear just because refresh failed.
- Both installer and about page should render the same sorted list.
- The UI does not need a loading blocker for remote refresh.

## Testing

- Rust unit tests:
  - payload validation
  - cache freshness calculation
  - source selection and fallback behavior
- Frontend tests:
  - shared loader fallback behavior when Tauri is unavailable
  - consistent sorting and error handling where applicable
