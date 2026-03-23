# Supporters Tier Shuffle Design

**Goal:** Keep supporters grouped by tier, but randomize the order within each tier once per load so the list feels less static without jumping around during the same session.

## Context

The shared supporters loader currently normalizes and sorts entries by `tier desc -> amount desc -> name`.
Both the installer support bar and the about page reuse the same frontend loader, so any ordering change should live in shared code instead of only in one Svelte component.

## Requirements

- Tier order must remain stable: tier 4 entries first, then 3, then 2, then 1.
- Entries inside the same tier should be shuffled.
- The shuffled order should remain fixed after the first successful load and only change after the next reload.
- The behavior should apply consistently to bundled fallback data and Tauri-loaded data.

## Approach

Add a shared helper that:

1. Groups entries by tier.
2. Applies Fisher-Yates shuffle inside each tier group.
3. Reassembles the final list in descending tier order.

Then cache the loaded `SupportersResponse` in the frontend module after the first successful `loadSupportersData()` call. This makes repeated calls within the same page lifecycle return the same order.

## Non-Goals

- No changes to the raw supporter JSON file format.
- No backend or Rust-side randomization.
- No persistence of shuffle order across app restarts.

## Testing

- Unit test that tier order stays descending while same-tier order can change.
- Unit test that repeated `loadSupportersData()` calls reuse the same shuffled order after the first load.
- Keep existing normalization and bundled fallback tests passing.
