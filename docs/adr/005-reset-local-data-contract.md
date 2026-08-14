---
status: decision
topic: reset-local-data
---

# Reset Local Data Contract

## Context

Resetting BazaarPlusPlus data is destructive but distinct from uninstalling the mod. The product needs an explicit target, honest action availability, and a result that distinguishes deletion from an already-empty target.

## Decision

Keep deletion in the native backend. Expose reset availability through install state, require an acknowledged confirmation, block dismissal while native work is running, and return a typed result with the refreshed install state. Current behavior is specified in [Install And Reset](../install-reset.md).

## Rejected Alternatives

- Keep reset always enabled. Availability must reflect the detected target and current operation gates.
- Delete from the frontend. Native code owns service exclusion, running-game refusal, filesystem effects, and error classification.
- Return generic success text. Callers need structured removed-versus-empty state and stable failure semantics.

## Consequences

Future reset work must preserve backend-owned deletion and keep empty, blocked, partial-failure, and successful removal states distinct. Uninstall continues to preserve user data.
