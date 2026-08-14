---
status: decision
topic: documentation-contract
---

# Documentation Contract

## Context

Current behavior, future work, historical material, and architectural rationale once appeared as peers. Agents had to read documents before knowing whether their claims were authoritative. A separate index also cached status and verification hashes already owned by document frontmatter.

The first topic layout solved that ambiguity but placed every current document under an extra `truth/` namespace. With a small topic set, that directory added navigation without adding a lifecycle distinction: current topics can be the default at `docs/*.md`, while decisions, plans, and history remain explicit subdirectories.

## Decision

Use one entry map and path-based lifecycle boundaries: `CONTEXT.md` is the task-triggered topic map, current behavior is the default at `docs/*.md`, and decisions, plans, and archived history are explicit subdirectories. ADRs own rationale and consequences rather than mirroring the current implementation.

The operational rules — claim ownership, symbol-level citation form, `last-verified` semantics, and lifecycle frontmatter — are owned by `CLAUDE.md`, the always-loaded policy file. This record does not restate them.

`npm run docs:check` checks current-document metadata, unique topics, entry-map coverage, reachable hashes, paths, links, and line bounds. It is a mechanical guard, not evidence that prose is true.

## Rejected Alternatives

- Keep `docs/truth/`. The current root already has an unambiguous meaning because every other lifecycle has a named subdirectory.
- Add `docs/INDEX.md`. It would compete with `CONTEXT.md` and cache metadata owned elsewhere.
- Put all current behavior in `CONTEXT.md`. Always-loaded detail raises context cost and weakens topic triggers.
- Duplicate the operational rules here. Two authoritative statements of one rule drift; `CLAUDE.md` is the single always-loaded owner.
- Archive pruned current documentation. Git retains deleted mechanics without presenting stale claims as current search results.
- Replace symbols with line ranges. Unrelated insertions can silently retarget an otherwise valid range.

## Consequences

Agents start with `CONTEXT.md`, open only the topic whose trigger matches the task, and consult an ADR only when its decision is in question. Current documents remain small enough to re-verify as a unit. Historical mechanics are recovered from Git when explicitly needed.
