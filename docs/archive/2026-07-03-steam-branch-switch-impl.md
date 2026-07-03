---
status: archived
topic: steam-branch-switch-impl
last-verified: 14ed7fa9099db151cfba141c66c8fbd958031a68
archived: 2026-07-04
note: Feature was implemented and then fully removed; see ADR 007 "Removal (2026-07-04)". Plan retained for history only.
---

# Steam Branch Switch — Implementation Plan (online ↔ PTR)

Mechanism validated 2026-07-03 (both directions, end-to-end). Authoritative mechanism record:
[ADR 007](../decisions/007-steam-branch-switch.md). Forensics:
`../archive/2026-07-03-steam-branch-switch.md`.

## Goal

A user-facing installer control to switch The Bazaar between **online** (public) and **PTR**
(`public_test_realm`) from outside the Steam UI, then land on a modded, ready-to-launch install —
keeping the client-integrated launch path (Steam runtime preserved).

## Validated mechanism (recap)

1. Quit Steam. 2. In `appmanifest_1617400.acf` set `UserConfig.BetaKey` = target (empty = online) and
`StateFlags` = `6` (leave `MountedConfig` alone). 3. Start Steam, **no validate**. Steam reconciles
(`StateFlags` 6→1030, `BytesToDownload` = branch delta, downloads, then `StateFlags`→4 and
`MountedConfig`→target). Round-trip measured ~1.45 GB each way; both directions completed without
validate and flipped `MountedConfig` on their own.

## Design decisions (grill 2026-07-03)

- **Surface:** user-visible online↔PTR control in the installer, with progress + cancel (reuse the
  async-command + status-event + cancel pattern the removed Tempo flow used).
- **Post-switch mod repair is conditional, not macOS-hardcoded.** A branch download reverts only
  Steam-managed files. The payload (`services/bepinex/payload.rs:127-138`: `BepInEx/`,
  `run_bepinex.sh`/`libdoorstop.dylib`, `winhttp.dll`/`doorstop_config.ini`) is all **foreign** and
  survives. Only the **trampoline** (`services/bepinex/trampoline.rs`) modifies the Steam-managed
  Unity binary and is reverted. So after the download completes, re-run detection and re-install
  **only if** `build_install_state` reports the mod needs repair (`needs_trampoline_repair` /
  `!version_matches`, `services/install/mod.rs:167-186`). This triggers on macOS 27+ trampoline;
  Windows + macOS ≤26 the mod survives (foreign-file survival is standard Steam behavior; not yet
  empirically tested on Windows).
- **Cancel:** during download → kill Steam, restore the ACF to the original branch + `StateFlags=4`,
  remove `steamapps/downloading/1617400` (validated clean-heal path). Lock cancel once Steam passes
  its commit point (staging → game dir); then only a forward completion + re-switch is safe.
- **Precondition:** switching to a password-gated branch (PTR) requires `betahash_public_test_realm`
  in `config.vdf` (`config.vdf` app `1617400` block; observed at `:628`/`:631`). If missing, block
  and guide the user to enter the PTR access code once in the Steam UI. Online needs no auth.

## Flow / state machine

`Idle → PreCheck → QuitSteam → EditACF → Downloading(progress) → (RepairIfNeeded) → Ready → Launch`,
with `Cancel` from Downloading (pre-commit) → `Restore → Idle`.

- **PreCheck:** target authorized (betahash for PTR); game not running; resolve appmanifest from
  `game_path` (`.../steamapps/common/The Bazaar` → `../../appmanifest_1617400.acf`), never
  `steam_path` (multi-library safe).
- **QuitSteam:** reuse `close_steam_internal` / `is_steam_running` / `request_steam_quit`
  (`services/steam.rs:71-134`).
- **EditACF:** new targeted ACF writer — rewrite the **first** `BetaKey` (UserConfig) + `StateFlags`,
  preserve the rest byte-for-byte; never touch `MountedConfig`. Model: the localconfig line-rewrite
  in `services/vdf/parse.rs` (no general VDF writer exists).
- **Downloading:** start Steam via the existing `steam://*` opener (`capabilities/default.json:12-18`)
  or `open -a Steam`; poll the ACF (`StateFlags`, `BytesDownloaded/BytesToDownload`, `MountedConfig`)
  and emit progress events. Completion: `StateFlags==4 && MountedConfig.BetaKey==target &&
  BytesDownloaded==BytesToDownload && BytesStaged==BytesToStage` (NOT `BytesToDownload==0`).
- **RepairIfNeeded:** `build_install_state`; if repair needed, `run_install`
  (`services/install/mod.rs:35-110`).
- **Launch:** `launch_game_via_steam()` (`steam://rungameid/1617400`).

## Task breakdown

1. **ACF reader/writer** (`services/steam` or new `services/branch/`): parse `UserConfig.BetaKey`,
   `MountedConfig.BetaKey`, `StateFlags`, `Bytes*`; targeted writer for UserConfig.BetaKey +
   StateFlags. Unit-test the write preserves MountedConfig + rest.
2. **betahash precheck**: read `config.vdf` for `betahash_<target>`.
3. **Switch service** (async, `spawn_blocking` + cancel `AtomicBool`, status events): quit → edit →
   start → poll → repair-if-needed. Reuse `close_steam_internal`, `run_install`, detection.
4. **Cancel command** + restore (kill Steam, restore ACF, clear downloading scratch); commit-point
   lock.
5. **Commands + bindings**: `switch_branch`, `cancel_branch_switch`; register in `commands/registry.rs`
   (bump the count test), `tauri.ts`, regenerate bindings.
6. **Frontend**: branch control + progress/cancel + betahash-missing guidance; i18n (zh/en).
7. **Docs**: keep ADR 007 as mechanism; update this plan's `last-verified` on landing.

## Risks / open

- Windows branch-switch payload survival not empirically verified (macOS confirmed).
- Commit-point detection for the cancel lock needs a concrete signal (candidate: `StateFlags` bit
  transition / staging progress); verify on a real switch before enabling cancel late.
- Multi-GB per switch is unavoidable; UI must set expectations.
