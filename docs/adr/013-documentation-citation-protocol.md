---
status: decision
topic: documentation-citation-protocol
---

# Documentation Citation Protocol

## Context

`docs/INDEX.md` kept a manifest table duplicating every `last-verified` hash already present in each file's own frontmatter. Commit `5494a7e` refreshed the frontmatter of five truth topics and left the manifest table untouched; five of the table's eight hash rows had already drifted from the frontmatter they claimed to mirror.

Citation decay is real, and a fresh stamp did not catch it. `docs/truth/architecture.md` cited `lib.rs:93-105` for tray setup and stream warm-up; that range is now a Windows DWM `Focused` handler. `docs/truth/verification.md` cited `build.sh:637` for trampoline signing; that line is `platform_list="$(release_platforms_cli list)"`. Both files carried a `last-verified` stamp two commits old, and neither `lib.rs` nor `build.sh` had changed since that stamp — the mechanism in both cases was that the cited symbol never moved or was renamed, an unrelated commit (`9b06a89` for `lib.rs`, `7550e4d` for `build.sh`) inserted lines above it, and the old range silently landed on different code.

The ADR layer was worse, sitting in no refresh loop at all: ADR-002 through ADR-005 carried 23 `file:line` citations between them, four of them already past their target file's end-of-file.

## Decision

Cite code by symbol — file plus function, constant, type, or config key — everywhere except a single-line literal fact (a port number, a URL, a version constant), where `file:line` stays the right form.

`last-verified` means the commit whose code every claim in the file was last re-derived against, not the last commit that happened to touch the file. It only advances after a genuine re-derivation pass over every claim, never as a side effect of an unrelated edit.

Documentation-only PRs stamp a commit already on `master` (squash-safe). PRs that also change code stamp their own branch commit and must land with a merge commit, not a squash, or the stamped hash dangles once history is rewritten.

`npm run docs:check` is a mechanical second line of defence — it catches out-of-bounds ranges, dangling hashes, ghost paths, and dead links. The per-file manifest in `docs/INDEX.md` is deleted: frontmatter plus `ls` already carries everything it duplicated.

## Rejected Alternatives

- Keep line citations and enforce stricter refresh discipline. The architecture/verification decay happened with a fresh stamp; discipline was not the part that failed, so tightening it would not have helped.
- Add CI that forces a truth-doc review whenever a cited source file changes. Every `lib.rs` edit becomes a documentation review; symbol citations remove the drift at its source instead of taxing every unrelated change to police it downstream.
- Delete the truth layer and read code directly. The corpus holds knowledge code cannot state on its own: a read-only SQLite connection cannot recover a dirty WAL left by an unclean game exit, a capture crossing local midnight into yesterday's directory is an accepted sub-second race, and the macOS Team ID gate is a release decision no source file states as an invariant.
- Keep `docs/INDEX.md` with only the status column. Status already lives in each file's frontmatter, so the table would be a cache whose lookup cost is one `ls` or `grep`.

## Consequences

Symbol citations survive insertions above them but break loudly on rename — that tradeoff is deliberate. `docs:check` catches out-of-bounds ranges, dangling hashes, ghost paths, and dead links, but it cannot catch an in-bounds range that points at the wrong content, which is exactly why symbol citation is the primary defense and the script is only secondary.
