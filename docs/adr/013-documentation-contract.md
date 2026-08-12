---
status: decision
topic: documentation-contract
---

# Documentation Contract

## Context

Current behavior, future work, historical material, and architectural rationale once shared the same document paths. Agents could not tell which claims were authoritative without reading each file, and a second agent-tooling convention could create a parallel entry map and decision directory.

The documentation index also duplicated each truth file's `last-verified` hash. That cache drifted independently. Line-range citations drifted too: unrelated insertions moved the referenced code while leaving the cited file and verification hash apparently valid.

## Decision

Use paths as truth boundaries:

- `CONTEXT.md` is the entry map and glossary; `CLAUDE.md` holds agent policy.
- `docs/truth/` contains current behavior, split by topic and verified against code.
- `docs/plans/` contains active future work.
- `docs/adr/` contains architectural or product choices that still constrain the repository.
- `docs/archive/` contains frozen historical material.

Keep each claim in one authoritative place. ADRs preserve rationale and consequences; current implementation belongs in truth docs or the environment. Remove a superseded or feature-removed ADR when it no longer constrains current work, first folding any still-relevant rationale into its successor. Git history remains the recovery path for discarded mechanics.

Cite code by file and symbol. Use a line citation only for a single-line literal fact. A truth file's `last-verified` value names the commit whose code every claim was re-derived against. Documentation-only changes stamp a commit already on the default branch; changes that stamp their own branch commit land with a merge commit so the hash remains reachable.

`npm run docs:check` provides mechanical checks for dangling hashes, paths, links, and line ranges. Frontmatter is the sole metadata source; no manifest duplicates it.

## Rejected Alternatives

- Annotate mixed documents in place. Search results would still present stale and current claims as peers.
- Put all current behavior in one document. Topic slices keep each verification pass bounded.
- Preserve a parallel layout for agent tooling. One entry map and one decision directory avoid competing sources of truth.
- Keep line ranges and rely on frequent refreshes. Insertions can silently retarget a still-valid range.
- Keep a manifest of hashes or statuses. It is a cache of frontmatter and directory contents.
- Retain every superseded ADR in the active decision set. Removed mechanics increase retrieval and maintenance cost without constraining current work.

## Consequences

Agents start with `CONTEXT.md`, load the relevant truth topic, and consult an ADR only when its decision affects the task. Historical mechanics are recovered from Git only when explicitly needed. Symbol renames fail visibly during review, while unrelated line movement does not invalidate citations; `docs:check` remains a secondary guard rather than proof that prose is true.
