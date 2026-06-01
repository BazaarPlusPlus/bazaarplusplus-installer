# Agent Instructions

## General

- Keep repo-level instructions short and operational. Put feature- or module-specific guidance near the relevant code.

## Verification

- Match verification to the risk and scope of the change.
- Docs-only or instruction-only changes do not require `npm run check` or a build.
- React or TypeScript UI changes should usually run `npm run check`; add targeted unit tests only when they verify real behavior.
- Changes under `scripts/` should run the smallest relevant `node --test` coverage when one exists; otherwise run the touched script directly when practical.
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
