# Agent Instructions

## Verification

- Match effort to the risk and scope of the change.
- Docs-only or instruction-only changes do not require `npm run check` or a build; run `npm run docs:check` instead.
- React or TypeScript UI changes should usually run `npm run check`.
- Changes under `scripts/` should run the smallest relevant vitest coverage when one exists (e.g. `npx vitest run scripts/<file>.test.mjs`, or `npm run test:unit`); otherwise run the touched script directly when practical.
- Changes affecting versioning, bundled resources, Tauri config, or release packaging should run `npm run prebuild-check` before broader validation.
- Run `./build.sh --prod` only for packaging, platform bundling, or release-oriented changes.
- Add a unit test only when it verifies a real behavior seam — not coverage decoration, mock call sequencing, or assertions on exact source text; otherwise say so and ship without one.

## Local Workflow

- Write paths relative to the project root.
- For frontend debugging and browser/Tauri smoke checks, run `npm run dev -- --host 127.0.0.1 --port 14207` and use `http://127.0.0.1:14207/`.
- Keep agent-authored docs minimal; add or rewrite README-style files only when explicitly requested.

## Commits And Pull Requests

- Write every Git commit message in Conventional Commits format: `<type>(<scope>): <description>`.
- End every PR body with a `Release Notes:` section holding one blank line then the notes; use `- N/A` for non-user-facing changes.
- Merge with a merge commit, never a squash, when the PR stamps a `last-verified` hash taken from its own branch — squashing rewrites that commit and the stamp dangles.

## Documentation Structure

- `docs/truth/` is the only current-behavior location: topic-sliced, code-cited, hash-stamped. Prefer one focused file over a broad chronological document. `CONTEXT.md` is the entry map and glossary.
- Cite code by symbol — file plus function, constant, or config key. Use a `file:line` range only for a single-line literal fact.
- When a change invalidates a truth doc, update the doc and its `last-verified` hash in the same change. Stamp the commit whose code the claims were re-derived against.
- Put immutable architecture or product choices in `docs/adr/` using Context, Decision, Rejected alternatives, and Consequences.
- Put only active future work in `docs/plans/`. Move implemented, superseded, or abandoned material to `docs/archive/` with `status`, `topic`, and `superseded-by` frontmatter, and preserve the archived body.
- Keep generated audit reports and review artifacts under gitignored `tmp/`, not under `docs/`.

## Instruction Maintenance

- Add repo-level instructions here only when they are non-obvious, specific enough to act on, and repeatedly useful — not for one-off observations during normal feature or fix work. Put feature- or module-specific guidance near the relevant code instead.
- When proposing a new instruction in a PR, use a `Suggested CLAUDE.md additions` heading and let reviewers decide what becomes permanent.

## Issue Tracker

- Issues are GitHub Issues, reached with the `gh` CLI, which infers the repo from `git remote -v`. `ready-for-agent` marks an issue an agent may pick up unprompted. See `docs/agents/issue-tracker.md` for the create/list/comment/label/close commands.
