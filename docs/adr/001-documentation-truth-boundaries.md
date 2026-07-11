---
status: decision
topic: documentation-truth-boundaries
---

# Documentation Truth Boundaries

## Context

The repository had multiple historical specs, plans, audits, and current-ish documents mixed under `docs/` and `docs/superpowers/`. Several historical files already warned that they were point-in-time snapshots, but those warnings were embedded in body text rather than enforced by path.

## Decision

Separate current claims from historical context by path. Current state lives in `docs/truth/`, active future work in `docs/plans/`, immutable choices in `docs/decisions/`, and frozen historical files in `docs/archive/`. `docs/INDEX.md` is the manifest and consolidation map.

## Rejected Alternatives

- Keep all documents in place and annotate their headings. This keeps grep results ambiguous and allows stale files to be read as current.
- Create one large truth document. That increases retrieval cost for agents and makes topic-level freshness harder to track.
- Delete obsolete documents. This would remove rationale and make the consolidation less reversible.

## Consequences

Agents should read `docs/INDEX.md` first, then the relevant `docs/truth/` topic. Historical files remain available for rationale but must be re-verified against code before reuse.
