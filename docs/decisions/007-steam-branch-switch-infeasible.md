---
status: decision
topic: steam-branch-switch-infeasible
---

# External Steam Branch Switching Is Infeasible — Manual Switch + Read-Side Detection

## Context

We wanted to switch The Bazaar's Steam beta branch (online ↔ `public_test_realm`) from outside the
Steam UI and then launch, to support online-vs-PTR dual-version work — while keeping the
**client-integrated** launch path the mod requires (Steam runtime / overlay / ownership present).
The mod's dependency on the Steam client runtime is a **hard** requirement.

## Decision

Do not build automated external branch switching in the installer. Branch selection stays a
**manual action in the Steam UI**. The only automated half is the mod's **read-side branch
detection** (which branch is currently mounted). The installer builds no switch feature.

## Evidence (2026-07-03 live test, macOS, on PTR)

Approach A — edit `appmanifest_1617400.acf` `UserConfig.BetaKey` then `steam://validate/1617400` —
was tested and **refuted**:

- `validate` runs a **same-branch integrity pass**; it does not reconcile to a changed selection
  (`StateFlags` stayed `4`, `MountedConfig.BetaKey` stayed `public_test_realm`, and
  `BytesToDownload` never recomputed toward the ~1.4 GB online delta — only ~83 KB was touched).
- Steam **reverts** the external `UserConfig.BetaKey` edit back to its own value; the appmanifest
  key is a downstream mirror, not the source of truth.
- The authoritative selected branch is Steam **account/cloud** state — it lives in no local
  plaintext file (only `betahash_*` / `betadesc_*` authorization caches in `config.vdf`;
  `localconfig.vdf` has no selection either).

Full forensics: `docs/archive/2026-07-03-steam-branch-switch.md`.

## Rejected Alternatives

- **Approach A (edit local state + validate)** — empirically refuted (above).
- **steamcmd** (`+app_update 1617400 -beta <branch> -betapassword <code> validate`) — can automate
  the download, but it is a separate install/login context whose build does **not** run through the
  Steam client runtime, violating the mod's hard requirement; also officially unsupported against
  the client library for the same appid (AppState corruption risk).
- **UI automation** of the Steam beta dropdown — preserves the runtime but is brittle (breaks on any
  Steam UI change) and unfit for a shipped installer.

## Consequences

- Online↔PTR dual-version verification is **semi-manual**: the user flips the branch in the Steam UI
  (a multi-GB re-download, inherent to Steam and unavoidable by any method), and the mod detects the
  active branch and adapts.
- The installer stays Steam-launch-only with no branch awareness. If surfacing the current branch is
  later wanted, it can be a **read-only** display of `MountedConfig.BetaKey` from the appmanifest —
  never a write.
- Anyone tempted to "just edit the appmanifest to switch branches" should read this first: it does
  not work, and Steam reverts the edit.
