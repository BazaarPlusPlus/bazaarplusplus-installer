---
status: decision
topic: agent-skills-doc-layout
---

# Agent Skills Doc Layout

## Context

Commit 86e18d2 adopted the agent engineering skills and their per-repo configuration under `docs/agents/`. The skills' consumer convention (`docs/agents/domain.md`) expects a root `CONTEXT.md` plus ADRs in `docs/adr/`, and creates both lazily when missing. The layout from decision 001 kept decisions in `docs/decisions/` and the entry map in `docs/truth/overview.md`, so a skill run would have forked a second, parallel decision directory.

## Decision

Conform the repo to the skills' layout where it is mechanical, and keep the truth-doc system where it is load-bearing:

- Rename `docs/decisions/` to `docs/adr/`, preserving file names and numbering.
- Promote `docs/truth/overview.md` to a root `CONTEXT.md` that carries the system map, a domain glossary, and the doc-layout semantics.
- Keep `docs/truth/` topic slices, `docs/plans/`, and `docs/archive/` exactly as decided in 001; only the decision-directory path and the entry-doc location are amended.

## Rejected Alternatives

- Point `docs/agents/domain.md` at `docs/decisions/` instead of renaming. The skills also hardcode `docs/adr/` in their own instructions, so the drift and the lazy-creation fork risk would persist.
- Collapse `docs/truth/` into `CONTEXT.md`. One large truth document was already rejected in 001; `CONTEXT.md` is the vocabulary/map layer, truth docs are the code-cited behavior layer.

## Consequences

Agents read `CONTEXT.md` first, then the relevant `docs/truth/` topic, then ADRs in `docs/adr/` that touch the area. Decision 001 remains in force with its `docs/decisions/` path reading as `docs/adr/`. `docs/INDEX.md` was the manifest at the time of this decision; it was later removed, see [ADR-013](013-documentation-citation-protocol.md).
