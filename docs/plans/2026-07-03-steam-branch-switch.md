---
status: active-plan
topic: steam-branch-switch
last-verified: b0a815de69f8cf92760f82e10772b3b0262873f6
---

# External Steam Branch Switching (Approach A)

## Goal

Switch The Bazaar's Steam beta branch (e.g. `Default Public Version` ↔ `public_test_realm`)
from outside the Steam UI and then launch the game, while keeping the **client-integrated**
launch path the mod requires (Steam runtime / overlay / ownership check present). This is the
substrate for online-vs-PTR dual-version work on the mod side.

## Why Approach A (client-integrated), not steamcmd

- **A** only edits the Steam client's own state file and lets the client do the download +
  launch, so the launch stays `steam://rungameid/1617400` (`src-tauri/src/services/install/mod.rs:24`)
  with full Steam runtime. This matches the mod rule "launch through the Steam client so runtime
  state is present."
- **steamcmd** (`+app_update 1617400 -beta <branch> -betapassword <code> validate`) is a
  *separate* install/login context. Mixing it with the client library for the same appid is
  officially unsupported and can corrupt AppState, and a steamcmd-launched build bypasses the
  Steam client runtime. Rejected for the actively-tested install; only viable as a *second,
  isolated* resident copy, which is out of scope here.

## How Steam stores the branch (observed runtime facts, macOS)

Verified against the live dev machine on 2026-07-03. These are **Steam client runtime files**,
not our code; key casing has varied across Steam versions, so parse defensively.

- `~/Library/Application Support/Steam/steamapps/appmanifest_1617400.acf` (VDF):
  - `AppState.UserConfig.BetaKey` — the branch the user has **selected**.
  - `AppState.MountedConfig.BetaKey` — the branch actually **installed** on disk.
  - `AppState.StateFlags` — `4` = fully installed / up to date; a pending update sets an
    update-required bit. A switch is Steam noticing `MountedConfig ≠ UserConfig` and downloading.
  - `AppState.PrivateDepots.branches.<name>` lists each private branch with
    `"pwdrequired" "1"` for `staging` and `public_test_realm` — both are password-gated.
- `~/Library/Application Support/Steam/config/config.vdf` caches the beta credentials as
  `betahash_<branch>` (e.g. `betahash_public_test_realm`) under the app entry. **Once the access
  code has been entered in the UI, Steam remembers it**, so an external switch between
  already-authorized branches does not need the code again.

### Branch inventory (appid 1617400, observed 2026-07-03)

| Branch | Type | Code required | Authorized on the dev machine |
| --- | --- | --- | --- |
| `staging` | beta ("staging branch") | yes (`pwdrequired 1`) | yes — `betahash_staging` cached |
| `public_test_realm` | beta ("ptr") | yes (`pwdrequired 1`) | yes — `betahash_public_test_realm` cached |
| *(empty `BetaKey`)* = Default Public Version | public / online | no | n/a (public needs no auth) |

The public branch is the empty-`BetaKey` default and never appears under `PrivateDepots`, so it
has no `pwdrequired` entry. Both betas are password-gated but already authorized on the dev
machine, so all three (online / staging / ptr) switch there **without re-entering a code** — the
only remaining cost is the multi-GB re-download. The authorization column is machine-specific: a
fresh machine has no `betahash_*` until each beta's code is entered once in the Steam UI. At
capture time the selected and installed branch was `public_test_realm`.

**The real cost is content, not the API.** `Default Public Version` and PTR are *different depot
manifests* (in the ACF, branch `public_test_realm` depot gid `7555656216276884700` vs `staging`
`1720523943959837346`; each branch is a ~5.9 GB depot). The last observed switch staged 3.06 GB
and downloaded 1.53 GB (`BytesToStage 3065790990` / `BytesToDownload 1534104752`). **Every
online↔PTR switch is a multi-GB re-download.** No method removes this.

## Switch procedure

1. **Locate the appmanifest.** Derive it from the already-resolved **game path**, not the Steam
   client root. The game path is `<library>/steamapps/common/The Bazaar`, so the manifest is
   `<library>/steamapps/appmanifest_1617400.acf` — two levels up from `game_path`, then the ACF.
   **Deriving from `steam_path` is wrong on multi-library setups**: the game (and its appmanifest)
   can live in a *secondary* library folder that `detect/steam.rs` finds via `libraryfolders.vdf`
   (`get_game_path_from_steam_roots`, `src-tauri/src/services/detect/steam.rs:181-192`), which is
   not under the primary `steam_path`. Since the installer is now Steam-only (decision 006),
   `game_path` is guaranteed to sit under a `steamapps/common` path, so the two-levels-up
   derivation is always valid.
2. **Quit Steam.** Steam holds `AppState` in memory and will overwrite a live edit; the file must
   be rewritten while the client is not running.
3. **Rewrite `UserConfig.BetaKey`** to the target branch (leave `MountedConfig` alone — Steam
   updates it after the download completes). For the public branch, remove the key / set it empty.
4. **Start Steam, then force reconcile** with `steam://validate/1617400`. Validate re-checks the
   installed files against the *currently selected* branch manifest, so it detects the branch
   mismatch and pulls the differing depot content — this sidesteps the undocumented `StateFlags`
   handshake. `steam://*` is already allow-listed (`src-tauri/capabilities/default.json:12-18`).
5. **Wait for completion**: poll until `StateFlags` is `4` and `MountedConfig.BetaKey` equals the
   target. Only then is the branch actually swapped on disk.
6. **Launch** `steam://rungameid/1617400` (`src-tauri/src/services/install/mod.rs:24`).

## Preconditions & caveats

- **Beta must be pre-authorized.** The target branch needs its `betahash_<branch>` already in
  `config.vdf` (i.e. the access code was entered once in the UI). We do not automate entering the
  code, and password-gated branches (`pwdrequired 1`) will not download without it.
- **Multi-GB re-download per switch is unavoidable** (see cost note above). This makes A suitable
  for **low-frequency** switching (occasional dual-version verification), not rapid A/B toggling.
- **Cannot switch while Steam is running** — step 2 is mandatory.
- **A branch switch reverts the game bundle → the mod payload and macOS trampoline must be
  re-applied.** A branch download is a full game update; on macOS 27+ it undoes the trampoline's
  renamed Unity binary / stub / sealed bundle. The installer already treats "Steam verify or a game
  update reverts the bundle" as a reinstall/repair (`src-tauri/src/services/install/mod.rs:224-232`,
  trampoline reinstall `src-tauri/src/services/bepinex/trampoline.rs:384-467`). Any automated switch
  flow must run that repair after the download completes and before launch.
- **Account must own / have access to the branch**, independent of the cached hash.

## Implementation notes (reusable seams)

- **Steam / game path** is already resolved by parsing `steamapps/libraryfolders.vdf` in
  `src-tauri/src/services/detect/steam.rs` (read at `:268`), yielding
  `SteamInstallPaths { steam_path, game_path, ... }`. The appmanifest path derives from
  **`game_path`** (`game_path/../../appmanifest_1617400.acf`), so it follows the actual library
  folder that holds the game rather than assuming a single primary library under `steam_path`.
- **VDF reading** exists (`src-tauri/src/services/vdf/parse.rs`, plus the `keyvalues_parser`
  crate used in `detect/steam.rs`). **Writing VDF back does not** — a `BetaKey` rewrite needs
  either a minimal serializer or a targeted single-key line rewrite of the ACF; prefer the
  narrowest edit that preserves the rest of the file verbatim.
- **Launch + validate URLs** both go through the existing `steam://*` opener capability; no new
  permission is needed.
- **Branch detection (read side)** is the mod's job and is the safe half: read
  `MountedConfig.BetaKey` from the ACF, or use Steamworks `ISteamApps::GetCurrentBetaName()` in
  game. Channel detection already landed on the mod repo; this doc is only about the write/switch
  side that Steam gives no clean handle for.

## Open questions (verify on the main path, do not build standalone probes)

- Confirm `steam://validate/1617400` actually forces a **branch reconcile** (not just a same-branch
  integrity pass) after `UserConfig.BetaKey` is rewritten. If not, determine the exact `StateFlags`
  bit that requests an update.
- Confirm whether, with Steam closed during the edit, a plain `steam://rungameid/1617400` on next
  start triggers the switch on its own (validate may be unnecessary).
- Confirm the completion signal: is `StateFlags == 4 && MountedConfig.BetaKey == target` sufficient,
  or is there a transient window where both hold mid-download?
- Confirm the post-switch trampoline repair ordering on macOS 27+ end-to-end (switch → repair →
  launch) on a real machine.
