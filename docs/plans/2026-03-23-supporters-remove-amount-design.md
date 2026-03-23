# Supporters Remove Amount Design

**Goal:** Remove `amount` from the supporter data model entirely while keeping the loader tolerant of older payloads that still include the field.

## Problems

- The supporter modal no longer renders `amount`, so the field only adds schema and maintenance cost.
- Frontend and Rust loaders still require `amount`, which means future payloads cannot drop it cleanly.
- Tier-internal shuffle currently depends on a pre-shuffle sort that uses `amount`, so removing the field needs a deterministic replacement ordering.

## Desired Behavior

- `SupporterEntry` should only contain `name` and `tier`.
- Bundled JSON, cached JSON, and remote JSON should all load correctly when `amount` is absent.
- Older payloads that still include `amount` should continue to parse; the extra field is ignored.
- Tier ordering stays descending.
- Tier-internal shuffle uses a deterministic pre-shuffle order based on supporter name.

## Approach

### Rust

- Remove `amount` from `SupporterEntry`.
- Update `normalize_supporter_entries()` to validate only `name` and `tier`.
- Keep parsing via `serde_json::Value` so extra fields such as legacy `amount` are ignored naturally.
- Sort normalized entries by `tier desc`, then `name asc`.

### Frontend

- Remove `amount` from the TypeScript `SupporterEntry` type and normalization logic.
- Accept entries that only contain `name` and `tier`.
- Ignore any legacy `amount` field when present in bundled payloads.
- Update snapshot-key generation and pre-shuffle sorting to use only `name` and `tier`.

## Testing

- Rust test proving payloads without `amount` normalize successfully.
- Rust test proving payloads with legacy `amount` still normalize and the field is ignored.
- Frontend test proving payload normalization accepts amount-free entries and strips legacy `amount`.
- Frontend test proving sorting is `tier desc`, then `name asc`.
