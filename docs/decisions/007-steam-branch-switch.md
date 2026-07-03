---
status: decision
topic: steam-branch-switch
---

# External Steam Branch Switching Via appmanifest (BetaKey + StateFlags)

## Context

We want to switch The Bazaar's Steam beta branch (online ↔ `public_test_realm`) from outside the
Steam UI and then launch, keeping the **client-integrated** launch path the mod requires (Steam
runtime / overlay / ownership present). A first test suggested this was infeasible; a follow-up test
on 2026-07-03 **proved it works** with the correct recipe. This ADR records the validated mechanism.

## Mechanism (validated 2026-07-03, macOS, live install)

External branch switching **is feasible and client-integrated**. Recipe:

1. **Quit Steam** (it holds `AppState` in memory and re-syncs on beta ops).
2. In `<library>/steamapps/appmanifest_1617400.acf`, rewrite **`UserConfig.BetaKey`** to the target
   branch (empty string `""` for the public/online branch); leave `MountedConfig.BetaKey` alone.
3. **Also set `StateFlags` to `6`** (`FullyInstalled|UpdateRequired`). This is the missing trigger —
   editing `BetaKey` alone is *not* acted upon.
4. Start Steam normally (`open -a Steam` / `steam://rungameid/1617400`). **Do NOT run
   `steam://validate`** — validate re-syncs state from Steam's authoritative selection and *reverts*
   the edit (that is what the earlier "infeasible" test hit).

Observed: Steam picks up the edit, transitions `StateFlags` `6 → 1030` (update running), recomputes
`BytesToDownload` to the target-branch delta (~1.45 GB for PTR→online), populates
`steamapps/downloading/1617400`, and reconciles to the target branch — all through the Steam client,
so the runtime is preserved.

Derive the appmanifest from the resolved **`game_path`** (`.../steamapps/common/The Bazaar` →
`.../steamapps/appmanifest_1617400.acf`), not the primary `steam_path` (multi-library safe).

## Proven vs still open

- ✅ **Proven end-to-end, both directions.** A full round-trip PTR→online→PTR completed with **no
  validate**: each direction went `StateFlags` 6→1030 (downloading the branch delta) → `4`, with
  `MountedConfig.BetaKey` flipping to the target and `buildid` updating (online `24001960` ↔ PTR
  `23993765`). The completion predicate below held at 100%. An earlier abort (kill Steam, restore
  ACF, clear `downloading/1617400`) also reverted cleanly without flipping the account/cloud
  selection — so mid-download cancel is safe.
- Completion predicate: `StateFlags==4 && MountedConfig.BetaKey==target &&
  BytesDownloaded==BytesToDownload && BytesStaged==BytesToStage` — **not** `BytesToDownload==0`
  (those fields retain the last operation's totals when idle).
- Cost is unavoidable: every online↔PTR switch is a multi-GB delta re-download (~1.45 GB observed).
- Password-gated branches (`staging`/`public_test_realm`) need `betahash_<branch>` already cached in
  `config.vdf` (code entered once in the UI). Online/public needs no auth.

## Corrected history

An earlier test (edit `BetaKey` + `steam://validate`, no `StateFlags` change) failed and was
mistakenly recorded as "infeasible" (this ADR's prior version). The failure was the **missing
`StateFlags` trigger** plus **running validate** (which reverted the edit). That conclusion is
withdrawn. Full forensics of both tests: `docs/archive/2026-07-03-steam-branch-switch.md`.

## Rejected alternatives

- **steamcmd** (`+app_update -beta …`) — separate login/install context, bypasses the Steam client
  runtime the mod needs. Not required now that the client-integrated ACF path works.
- **UI automation** of the Steam beta dropdown — brittle. Not required.

## Consequences

- The installer *can* offer automated online↔PTR switching: quit Steam → edit the ACF
  (`BetaKey`+`StateFlags`) → start Steam → poll to completion → **re-apply the mod payload / macOS
  trampoline** (a branch download reverts the game bundle, handled like a Steam-verify revert today)
  → launch.
- Needs a targeted **ACF writer** (line rewrite of `UserConfig.BetaKey` + `StateFlags`); the existing
  localconfig line-rewrite pattern (`services/vdf/parse.rs`) is a model, but the ACF needs its own
  editor. Must edit only the first (`UserConfig`) `BetaKey`, never `MountedConfig`.
- Whether to build this now is a separate product decision.
