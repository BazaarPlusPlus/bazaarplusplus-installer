# Agent Instructions

## General

- Keep repo-level instructions short and operational. Put feature- or module-specific guidance near the relevant code.

## Verification

- Match verification to the risk and scope of the change.
- Docs-only or instruction-only changes do not require `npm run check` or a build.
- React or TypeScript UI changes should usually run `npm run check`; add targeted unit tests only when they verify real behavior.
- Changes under `scripts/` should run the smallest relevant vitest coverage when one exists (e.g. `npx vitest run scripts/<file>.test.mjs`, or `npm run test:unit`); otherwise run the touched script directly when practical.
- Changes affecting versioning, bundled resources, Tauri config, or release packaging should run `npm run prebuild-check` before broader validation.
- Run `./build.sh --prod` only for packaging, platform bundling, or release-oriented changes.
- Do not add tests whose main value is coverage decoration, mock call sequencing, or asserting exact source text.
- If there is no meaningful automated test seam, say so and ship without adding a low-value test.

## Local Workflow

- Write paths relative to the project root.
- For frontend debugging, run `npm run dev -- --host 127.0.0.1 --port 14207` and use `http://127.0.0.1:14207/`.
- Keep port `14207` for browser and Tauri smoke checks.
- Keep agent-authored docs minimal. Do not add or rewrite README-style files unless explicitly requested.

## Pull Requests

- Use a clear title that describes the change.
- End the PR body with a `Release Notes:` section:

```text
Release Notes:

- N/A
```

- Use `- N/A` for non-user-facing changes.

## Instruction Maintenance

- Do not edit `CLAUDE.md` during normal feature or fix work just because a one-off observation appeared.
- New repo-level instructions must be non-obvious, repeatedly useful, and specific enough to act on.
- When proposing future instruction changes in a PR, use a `Suggested CLAUDE.md additions` heading and let reviewers decide what becomes permanent.

## Documentation Structure

- Current truth lives only in root `CONTEXT.md` (entry map + glossary) and `docs/truth/` (see `docs/INDEX.md`). Never treat `docs/archive/` as current; read it only for historical context when explicitly needed. When code changes invalidate a truth doc, update the doc and its `last-verified` hash in the same change.
- Keep truth docs topic-sliced and code-cited. Prefer one focused file under `docs/truth/` over a broad chronological document.
- Put immutable architecture or product choices in `docs/adr/` using Context, Decision, Rejected alternatives, and Consequences.
- Put only active future work in `docs/plans/`. Move implemented, superseded, abandoned, or unverified historical material to `docs/archive/` with frontmatter and preserve the archived body.
- Keep generated audit reports and review artifacts under gitignored `tmp/`, not under `docs/`.

## Agent skills

### Issue tracker

Issues are tracked as GitHub Issues on cauyxy/bazaarplusplus-installer via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` at the repo root plus ADRs in `docs/adr/`. See `docs/agents/domain.md`.
