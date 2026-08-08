# Issue Tracker: GitHub

Issues live as GitHub issues. Use the `gh` CLI, which infers the repo from `git remote -v` when run inside a clone.

## Commands

- **Create**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read**: `gh issue view <number> --comments`.
- **List**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`, with `--label` and `--state` filters.
- **Comment**: `gh issue comment <number> --body "..."`
- **Label**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Issue titles follow the same Conventional Commits shape as commit messages.

## Labels

`gh label list` is the live vocabulary. Two labels carry meaning an agent must act on:

- `ready-for-agent` — fully specified; an agent may pick it up unprompted.
- `manual-validation` — cannot be concluded from code; needs a human or a real machine.

Pull requests are not a request surface here; external PRs are not triaged as issues.
