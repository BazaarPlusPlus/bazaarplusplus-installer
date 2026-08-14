---
status: decision
topic: v5-data-root-v4-orphan-policy
---

# V5 Data Root And V4 Orphan Policy

## Context

BazaarPlusPlus V5 writes a new data contract under `BazaarPlusPlusV5/`. Existing `BazaarPlusPlusV4/` data may contain history, screenshots, or other user artifacts from earlier mod releases. V5 also introduces `BundleOutbox/` and the `bundle_outbox` table as the mod's durable upload queue.

## Decision

Legacy `BazaarPlusPlusV4/` data remains owned by the user. The installer does not read, delete, migrate, or prompt about it. Installer Reset targets only the current V5 data root.

`BundleOutbox/` and `bundle_outbox` remain exclusively mod-managed. The installer does not delete outbox files or rows and does not include their bytes in cleanup estimates.

Current reset and cleanup behavior is specified in [Install And Reset](../install-reset.md) and [History And Storage](../history-storage.md).

## Rejected Alternatives

- Extend Reset to clean `BazaarPlusPlusV4/`. This would silently broaden a current-data reset into deletion of user-owned legacy artifacts.
- Let installer cleanup reclaim the bundle outbox. That would duplicate the mod's queue lifecycle and could remove upload inputs while the mod still owns their retry or retention state.

## Consequences

V4 data can remain on disk until the user removes it independently. The installer does not advertise or automate that removal.

Outbox retention and reclamation changes must be implemented by the mod. Installer cleanup may use outbox row status to decide whether run-owned source data is still needed, but it never mutates the outbox itself.
