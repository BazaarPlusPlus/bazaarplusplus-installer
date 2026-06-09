# macOS 27+ BepInEx launch via in-bundle Mach-O trampoline — implementation plan

Status: **PLAN — mechanism PROVEN on macOS 27 + Steam (2026-06-09); awaiting confirmation to implement**
Scope: `bazaarplusplus-installer` only. Mod DLLs and the ≤26 launch path are unchanged.

---

## 1. Background / root cause (proven)

After macOS updated to 27.0 and the Steam client self-updated to `macos-signed-2` (2026-06-09 ~17:32), The Bazaar stopped
launching with BepInEx. Live-reproduced root cause (Steam `logs/console_log.txt` + `logs/gameprocess_log.txt`):

| LaunchOptions first token | Steam result |
| --- | --- |
| `TheBazaar.app` (empty options) | `Game process added` → `Completed` ✅ |
| `run_bepinex.sh` **or** `/bin/sh` (prefix) | `Failed to spawn process` → `AppError_46 "OS Error 0"` ❌ |
| `DYLD_…=… %command%` (env prefix) | `OS Error 260` ❌ |

The new Steam client **no longer spawns a prefix executable before `%command%`** on macOS 27 — even `/bin/sh` fails. The failure is
pre-plugin (the mod DLLs never load). BepInEx-on-macOS depends entirely on the prefix-script (`launch_options.rs:23-28` sets
`LaunchOptions = "…/run_bepinex.sh" %command%`), so that mechanism is dead on this client. **The only launch path that still works is
launching the `.app` directly**, so injection must move inside the `.app`.

## 2. Decision — two launch modes, selected by version OR user opt-in

The installer supports two launch modes; a single boolean selects between them:

```
use_trampoline = (macos_major() >= 27) || compat_opt_in
```

- **Prefix mode (default on macOS ≤ 26)** — today's path, byte-for-byte: extract payload, `chmod +x run_bepinex.sh`, set
  `LaunchOptions = "…/run_bepinex.sh" %command%`. The `.app` is never modified. **Zero regression risk** for users who don't opt in.
- **Trampoline mode (forced on macOS ≥ 27; opt-in on ≤ 26)** — **clear LaunchOptions** (empty = vanilla launch), install a tiny arm64
  Mach-O stub as the bundle's `CFBundleExecutable`, rename the real binary, and adhoc-re-sign the real binary with the JIT entitlements
  at install time.

Trampoline mode does not depend on Steam's (fragile) prefix-spawn behavior, so it is the **more robust / forward-compatible** mode. We
therefore expose it to ≤ 26 users as an explicit, **default-off "兼容模式 / Compatibility mode"** checkbox: on macOS 27+ it is forced on
(checkbox shown checked + locked); on ≤ 26 the user may opt in.

**LaunchOptions are driven by the MODE, not the OS version**: trampoline mode ⇒ LaunchOptions cleared; prefix mode ⇒ prefix set. The
clear/set must key off `use_trampoline`, NOT `macos_major >= 27`, so a ≤ 26 opt-in user gets the empty LaunchOptions the stub needs.

We only support Apple Silicon (macOS 27 is Apple-Silicon-only), so the stub is **arm64-only** (no universal/lipo, no Intel risk).

> Caveat: trampoline mode is empirically proven on macOS 27 (§3) but NOT yet tested on ≤ 26 here. The injection/signing axis is
> mechanism-invariant and ≤ 26 is strictly more permissive, so it is expected to work; still, ship the ≤ 26 opt-in labeled
> **experimental**, and note it carries the same verify-integrity / game-update fragility (§7) as 27+. Opting in on ≤ 26 also clears the
> user's currently-working prefix LaunchOptions and switches to the locally-untested trampoline — fully reversible (toggle off → prefix
> restored), but that is exactly why it is opt-in + experimental, never a silent default. Default stays prefix mode on ≤ 26.

## 3. Validation status — PROVEN end-to-end (2026-06-09)

The exact design below was hand-applied to the live game and validated via Steam:

- Bundle: `Contents/MacOS/The Bazaar` → 34 KB arm64 stub; real Unity bootstrap → `The Bazaar.orig` signed with the 3 JIT entitlements;
  bundle re-sealed; `codesign --verify --deep --strict TheBazaar.app` → exit 0; LaunchOptions cleared.
- Launch: `open steam://run/1617400` → Steam `Game process added … ProcID 23024` → **`Completed`** (no spawn failure).
- Injection: `BepInEx/LogOutput.log` freshly rewritten → BepInEx 5.4.23.3 → **`Loading [BazaarPlusPlus 4.1.0]`** → `Harmony patches applied`;
  `vmmap 23024` shows `libdoorstop.dylib` `__TEXT/__DATA/__LINKEDIT` mapped; Steam overlay (`gameoverlayui`) started for the same PID.

Every risk axis (script-vs-Mach-O, entitlements-on-real-binary, overlay-append, same-PID-exec PID tracking) was exercised and passed.
The one log line `[Error: BepInEx] Unable to start Unity log writer` is the known benign macOS BepInEx cosmetic; the mod loads fully.

## 4. Why the trampoline must be a compiled Mach-O (not a script)

A shell script at `Contents/MacOS/<CFBundleExecutable>` fails two hard requirements:
1. `codesign` rejects a script as a bundle's main executable → defeats the required JIT re-sign.
2. LaunchServices rejects script-mains (`-54` / "does not have permission to open (null)", confirmed on macOS 26.4.1, Ryubing #422),
   and a `#!` interpreter (SIP-protected `/bin/sh`) strips `DYLD_*` before our logic runs.

⇒ arm64 Mach-O stub. (Validated above.)

## 5. The trampoline mechanism

### 5.1 Bundle layout (install time)

```
TheBazaar.app/Contents/MacOS/
  The Bazaar          ← arm64 stub (CFBundleExecutable stays "The Bazaar"; Info.plist UNCHANGED)
  The Bazaar.orig     ← real Unity bootstrap, renamed, signed with the 3 JIT entitlements
```

`libdoorstop.dylib` continues to ship in `BepInEx.zip` and is extracted to the game dir as today — the stub references it by absolute
path. `run_bepinex.sh` is still extracted (harmless, unused on 27+).

### 5.2 Stub source (validated `bpp_launcher.c`)

Ships as a committed C file, compiled arm64 at build time. Behavior: resolve own path → derive game dir → set `DOORSTOP_*` env
(mirroring `run_bepinex.sh:295-304`) → **prepend** `<gamedir>/libdoorstop.dylib` to the existing `DYLD_INSERT_LIBRARIES` (preserving
Steam's overlay; works standalone if absent) → `execv("…/MacOS/The Bazaar.orig", argv)`. Launched as native arm64 by LaunchServices, so
the child inherits arm64 (no `arch -arm64` wrapper needed).

```c
// src-tauri/resources/SourceForBuild/macos/bpp_launcher.c  (validated 2026-06-09)
#include <stdlib.h>
#include <unistd.h>
#include <string.h>
#include <stdio.h>
#include <errno.h>
#include <limits.h>
#include <libgen.h>
#include <mach-o/dyld.h>

int main(int argc, char **argv) {
    char raw[PATH_MAX]; uint32_t sz = sizeof(raw);
    if (_NSGetExecutablePath(raw, &sz) != 0) { fprintf(stderr, "bpp: exe path too long\n"); return 70; }
    char exe[PATH_MAX];
    if (!realpath(raw, exe)) { strncpy(exe, raw, sizeof(exe)); exe[sizeof(exe)-1]=0; }
    char exe_copy[PATH_MAX]; strncpy(exe_copy, exe, sizeof(exe_copy)); exe_copy[sizeof(exe_copy)-1]=0;
    char macos_dir[PATH_MAX]; strncpy(macos_dir, dirname(exe_copy), sizeof(macos_dir)); macos_dir[sizeof(macos_dir)-1]=0;
    char gd_raw[PATH_MAX]; snprintf(gd_raw, sizeof(gd_raw), "%s/../../..", macos_dir);
    char game_dir[PATH_MAX];
    if (!realpath(gd_raw, game_dir)) { fprintf(stderr, "bpp: cannot resolve game dir from %s\n", gd_raw); return 71; }

    char buf[PATH_MAX*2];
    setenv("DOORSTOP_ENABLED", "1", 1);
    snprintf(buf, sizeof(buf), "%s/BepInEx/core/BepInEx.Preloader.dll", game_dir);
    setenv("DOORSTOP_TARGET_ASSEMBLY", buf, 1);
    setenv("DOORSTOP_BOOT_CONFIG_OVERRIDE", "", 1);
    setenv("DOORSTOP_IGNORE_DISABLED_ENV", "0", 1);
    setenv("DOORSTOP_MONO_DLL_SEARCH_PATH_OVERRIDE", "", 1);
    setenv("DOORSTOP_MONO_DEBUG_ENABLED", "0", 1);
    setenv("DOORSTOP_MONO_DEBUG_ADDRESS", "127.0.0.1:10000", 1);
    setenv("DOORSTOP_MONO_DEBUG_SUSPEND", "0", 1);
    setenv("DOORSTOP_CLR_RUNTIME_CORECLR_PATH", ".dylib", 1);
    setenv("DOORSTOP_CLR_CORLIB_DIR", "", 1);
    { const char *cur = getenv("DYLD_LIBRARY_PATH");
      if (cur && cur[0]) snprintf(buf, sizeof(buf), "%s:%s", game_dir, cur); else snprintf(buf, sizeof(buf), "%s", game_dir);
      setenv("DYLD_LIBRARY_PATH", buf, 1); }
    { char dylib[PATH_MAX]; snprintf(dylib, sizeof(dylib), "%s/libdoorstop.dylib", game_dir);
      const char *cur = getenv("DYLD_INSERT_LIBRARIES");
      if (cur && cur[0]) snprintf(buf, sizeof(buf), "%s:%s", dylib, cur); else snprintf(buf, sizeof(buf), "%s", dylib);
      setenv("DYLD_INSERT_LIBRARIES", buf, 1); }

    // Real binary sits beside us as "<our own basename>.orig" — derived from the launched
    // name (= current CFBundleExecutable), so no game-specific name is baked into the stub.
    char base_copy[PATH_MAX]; strncpy(base_copy, exe, sizeof(base_copy)); base_copy[sizeof(base_copy)-1]=0;
    char real[PATH_MAX]; snprintf(real, sizeof(real), "%s/%s.orig", macos_dir, basename(base_copy));
    execv(real, argv);
    fprintf(stderr, "bpp: execv(%s) failed: %s (run installer Repair)\n", real, strerror(errno));
    return 127;
}
```

> Note: the stub derives the real binary name from its OWN basename (= the current `CFBundleExecutable`) and appends `.orig`, so no
> game-specific name is baked in — a future game-side rename of the executable tracks automatically, as long as the installer installs
> the stub under the current `CFBundleExecutable` name and renames the real binary to `<that>.orig` (§6.3). (Red-team M: removes the
> hardcoded-name coupling.)

### 5.3 Re-signing — the correctness detail (validated)

The JIT/library-validation entitlements must be on **the real binary** (`The Bazaar.orig`, the process that runs Harmony / mprotect
W+X), **not** the stub. The ≤26 path gets this for free (the real binary *is* the main executable it re-signs, `run_bepinex.sh:334-357`).
The trampoline must do it explicitly. Validated sequence:

```sh
# entitlements written to a temp file (embedded Rust const, same 3 keys as run_bepinex.sh:343-352)
codesign --force --sign - --entitlements <ents.plist>  "TheBazaar.app/Contents/MacOS/The Bazaar.orig"
codesign --force --sign -                              "TheBazaar.app"   # seals bundle; main=stub; NO --deep (keeps .orig's ents)
```

`--deep` must NOT be used on the second call (it would re-sign `.orig` and strip its entitlements). `codesign` ships in stock macOS;
if it is missing the install must **fail loudly** (a modified-but-unsigned bundle is AMFI-killed on Apple Silicon).

### 5.4 LaunchOptions

**In trampoline mode (27+ forced, or ≤26 opt-in)**, LaunchOptions is **cleared** via the existing `clear_launch_options_for_steam`
(`launch_options.rs:197`) — empty = vanilla `.app` launch, the path the stub needs. Keyed off the MODE, not the OS version, so a ≤26
opt-in also clears it. Steam must be closed for the edit to stick (mirror uninstall: `prepare_steam_for_launch_option_update(steam, false)`).

## 6. Installer changes (file-by-file, code-grounded)

### 6.1 New: macOS version probe + launch-mode decision

`services/macos_version.rs`: run `sw_vers -productVersion` (or sysctl `kern.osproductversion`), parse the major `u32`; cache the major in
the startup context. Derived:
- `macos_trampoline_forced() -> bool { major() >= 27 }` — 27+ has no choice.
- `use_trampoline(compat_opt_in: bool) -> bool { macos_trampoline_forced() || compat_opt_in }` — the install-time decision.

`compat_opt_in` comes from the UI "兼容模式" checkbox (§6.6), plumbed through `run_install` into the install closure. The **chosen mode is
persisted** so detection survives a verify-integrity / game-update revert: write a marker `"<gamedir>/.bpp-launch-mode"` (= `trampoline` |
`prefix`) at install — a game-dir sibling, OUTSIDE the `.app`, so verify/updates don't touch it; removed on uninstall. On non-macOS,
`use_trampoline` is always `false`.

### 6.2 New: stub resource + build/validation

- Commit `src-tauri/resources/SourceForBuild/macos/bpp_launcher.c`.
- `build.sh`: compile arm64 + adhoc-sign before bundling →
  `clang -arch arm64 -O2 -o src-tauri/resources/Trampoline/macos/bpp_launcher src-tauri/resources/SourceForBuild/macos/bpp_launcher.c`
  (linker ad-hoc signs by default; explicit `codesign -s - ` optional).
- `src-tauri/tauri.macos.conf.json:6-7`: add a resource entry
  `"resources/Trampoline/macos/bpp_launcher": "Trampoline/bpp_launcher"` so it lands in `resource_dir()` (accessed exactly like
  `bundled_zip_relative_path()` does at `zip_archive.rs:11-15`).
- `scripts/prebuild-check.mjs:75-88`: assert the compiled stub exists and `file` reports `Mach-O 64-bit executable arm64`; fail the build
  otherwise so a missing/wrong-arch stub never ships.
- Output the compiled stub under `src-tauri/resources/Trampoline/` (a *resources* path, NOT under `src-tauri/target/`) so
  `before-bundle-cleanup.mjs` — which only cleans `target/.../bundle` — cannot delete it. Add `/src-tauri/resources/Trampoline/` to
  `.gitignore` (commit only `bpp_launcher.c`, never the compiled binary).
- Keep `TRAMPOLINE_ENTITLEMENTS` (the Rust const) byte-identical to `run_bepinex.sh:343-352`; add a test comparing the key sets so they
  cannot silently diverge.

### 6.3 New: `services/bepinex/trampoline.rs`

```rust
// All fns are #[cfg(target_os = "macos")]; no-op stubs on other OSes.
const TRAMPOLINE_ENTITLEMENTS: &str = /* the 3-key plist, run_bepinex.sh:343-352 */;
const ORIG_SUFFIX: &str = ".orig";

// Reads CFBundleExecutable from Info.plist; returns (app_path, macos_dir, exe_name).
fn bundle_paths(game_path: &Path) -> Result<BundleLayout, String>;

// True iff Contents/MacOS/<exe> is our stub and <exe>.orig exists (the working state).
pub fn is_trampolined(game_path: &Path) -> Result<bool, String>;

// Idempotent and tolerant of partial prior state. Steps:
//   0. ensure codesign present (ABSOLUTE first step, before ANY fs mutation; else hard error) and game not running
//   1. if fully trampolined already (is_trampolined) -> re-seal/verify only, return Ok
//   2. recover partial state: if <exe>.orig already exists (a prior interrupted run), treat <exe> as a possibly-unsigned
//      stub and jump to (4); else guard that <exe> is the real Unity binary (links UnityPlayer.dylib) before renaming
//   3. rename real <exe> -> <exe>.orig
//   4. copy stub resource -> <exe>; chmod 0755; best-effort strip com.apple.quarantine on the copied stub
//   5. disable the vestigial prefix launcher: chmod -x (or remove) run_bepinex.sh so its --deep re-sign can never run
//   6. codesign <exe>.orig WITH entitlements; then codesign+seal bundle (NO --deep, so .orig keeps its entitlements)
//   7. verify: codesign --verify --deep --strict <app>  (else roll back)
// Rollback (any failure after step 3): rename <exe>.orig back over <exe>, delete the stub copy. A crash mid-step leaves a
// RECOVERABLE state: re-running install_trampoline detects the partial state (step 2) and completes; Steam "Verify integrity"
// also restores vanilla. The bundle is never left both-modified-and-unsigned without a documented recovery path.
pub fn install_trampoline(app: &AppHandle, game_path: &Path) -> Result<(), String>;

// Restore vanilla. If <exe>.orig exists: move it back over <exe>. If .orig missing but <exe> is the
// real binary already (Steam verify reverted) -> Ok (nothing to do). If <exe> is our stub and .orig
// missing -> error asking the user to "Verify integrity of game files" (broken; only Steam can re-supply).
pub fn uninstall_trampoline(game_path: &Path) -> Result<(), String>;
```

Detecting "real Unity binary" (step 2 guard, and is_trampolined): the real binary is a Mach-O that links
`@executable_path/../Frameworks/UnityPlayer.dylib`; our stub does not and is tiny. A size+`otool`/Mach-O-load-command check
distinguishes them, preventing double-rename / clobber.

### 6.4 Integration: install orchestrator (`services/install/mod.rs:45-54`)

`run_install` takes a `compat_opt_in: bool` (from the UI checkbox), resolves `use_trampoline`, and reconciles the bundle to the chosen
mode — switching either direction is clean because each branch un-applies the other mode first:

```rust
let use_trampoline = use_trampoline(compat_opt_in);          // version-forced OR ≤26 opt-in; cached in snapshot
let was_trampolined = bepinex::is_trampolined(&game).unwrap_or(false);
if use_trampoline {
    // Trampoline mode MUTATES the .app and needs a reliable localconfig clear -> Steam MUST be closed.
    steam::prepare_steam_for_launch_option_update(&steam, false)?;       // close Steam
    install_bepinex(app, steam.clone(), game.clone())?;                  // extract siblings (uninstall_payload never touches the bundle/.orig)
    bepinex::install_trampoline(&app, &game)?;                           // idempotent; chmod -x run_bepinex.sh
    vdf::clear_launch_options_for_steam(&steam)?;                        // MODE-driven empty options (the stub needs this)
    write_launch_mode_marker(&game, "trampoline")?;
} else {
    // Prefix mode. Close Steam ONLY to un-apply a previous trampoline (mode switch); a plain ≤26 prefix
    // install keeps today's behavior EXACTLY (Steam stays up; patch_launch_options does its own prepare(.., true)).
    if was_trampolined { steam::prepare_steam_for_launch_option_update(&steam, false)?; }
    install_bepinex(app, steam.clone(), game.clone())?;                  // re-extracts run_bepinex.sh (+x)
    if was_trampolined { bepinex::uninstall_trampoline(&game)?; }        // restore vanilla bundle on switch-back
    if patch_launch_options_supported { let _ = patch_launch_options(app, steam, game, /*use_trampoline=*/ false)?; }
    write_launch_mode_marker(&game, "prefix")?;
}
```

**≤26 default is preserved byte-for-byte:** a plain prefix install (not switching from trampoline) takes the `else` branch with
`was_trampolined == false`, so Steam is NOT closed and the flow is exactly today's `install_bepinex` + `patch_launch_options`.
`uninstall_payload` (`payload.rs:230-246`) only removes the *siblings* (`BepInEx/`, `run_bepinex.sh`, `libdoorstop.dylib`) — it never
touches `Contents/MacOS/*`, so the renamed `.orig` is never deleted by a re-install/rollback (the round-2 "install_bepinex deletes .orig"
finding was based on a false premise). In trampoline mode `install_trampoline` disables the vestigial `run_bepinex.sh` (chmod -x) so its
`--deep` re-sign (`run_bepinex.sh:354`) can never run and strip `.orig`'s entitlements; switching back to prefix re-enables it implicitly
because `install_bepinex` re-extracts the script and calls `ensure_launcher_executable` (`bepinex/mod.rs:97`) on every install.

**Defense-in-depth (needs a signature change — `launch_options_args(game_path)` has no mode today):** thread the mode through —
`launch_options_args(game_path, use_trampoline)` returns `""` when `use_trampoline`, and `patch_launch_options(app, steam, game,
use_trampoline)` clears-on-empty — so even a mis-wired call site cannot write the dead prefix in trampoline mode. Cache the resolved
`use_trampoline` into `InstallEnvironmentSnapshot` so it's available in the `spawn_blocking` closure (`install/mod.rs:45`) without a worker
syscall. (Belt-and-suspenders, not load-bearing — the orchestrator already never calls `patch_launch_options` in trampoline mode; skip it
and rely on the branch if you'd rather not touch the command signature.)

### 6.5 Integration: uninstall (`bepinex/mod.rs:129-152`)

Whenever the bundle is trampolined (either mode trigger), call `uninstall_trampoline(game_path)` BEFORE `uninstall_payload` removes
siblings, then remove the `.bpp-launch-mode` marker and `clear_launch_options_for_steam`. If `uninstall_trampoline` fails, abort (do not
remove siblings / clear options). `uninstall_bpp` already closes Steam (`prepare_steam_for_launch_option_update(steam, false)` at mod.rs:138).

### 6.6 Integration: detection + repair surface

- `InstallEnvironmentSnapshot` (`detect/mod.rs:21-31`): add `compat_mode_available: bool` (macOS && !forced — i.e. ≤26: offer the
  checkbox), `trampoline_forced: bool` (= `macos_trampoline_forced()`), `trampoline_desired: bool` (forced OR `.bpp-launch-mode` marker ==
  `trampoline`), and `trampoline_applied: bool`. Compute `trampoline_applied` via `is_trampolined()` **per `detect_for_install` call** (like
  `bepinex_installed`/`bpp_version`), **NOT** cached in startup — otherwise it goes stale right after an install/Repair/uninstall.
  (Red-team suggested caching it in startup; that is wrong for correctness — recompute.) `is_trampolined() -> Result<bool>` is cheap (read
  `Info.plist` + one Mach-O's load commands); `detect_for_install` maps `Err` → `false` (fail safe) if the bundle is mid-update/unreadable.
  `trampoline_desired = trampoline_forced || marker == "trampoline"`; a MISSING marker ⇒ `prefix` on ≤26, so a lost marker on a still-
  trampolined ≤26 bundle is caught by the `desired != applied` mismatch below and offered as Repair. Adding these snapshot/`InstallState`
  fields requires regenerating the TS bindings (the project's `generate-bindings` step).
- UI checkbox "兼容模式 / Compatibility mode": shown on ≤26 (default = current `trampoline_desired`, so it reflects the existing install);
  on 27+ shown **checked + locked** (forced). Its value is the `compat_opt_in` passed into `run_install`.
- `install_state_from_snapshot` (`install/mod.rs:98-158`): on macOS define `effective_installed = bepinex_installed &&
  (trampoline_desired == trampoline_applied)` — the bundle's actual state must MATCH the desired mode. Drive `installed`, `version_matches`,
  and the action gates (`can_install = !effective_installed`, `can_reinstall = effective_installed`) off THAT, not raw `bepinex_installed`
  (today `version_matches` at `install/mod.rs:104-108` keys only off the plugin DLL version, which still passes after a bundle revert). The
  equality check closes BOTH holes at once: `trampoline_desired && !trampoline_applied` (Steam-Verify/update reverted the trampoline) AND
  `!trampoline_desired && trampoline_applied` (bundle trampolined but prefix desired — a failed/partial switch or a lost marker). When
  `bepinex_installed && trampoline_desired != trampoline_applied`: push warning `code: "trampoline_reverted"` and set `can_reinstall = true`
  (Repair). Prefix mode (`trampoline_desired = false`) reduces to today's behavior: `effective_installed == bepinex_installed`. Frontend
  (`useInstallPage.ts`) maps the warning to a localized "需要修复" prompt and routes the existing Reinstall button to `run_install`
  (preserving the checkbox state).
- `is_bepinex_installed` (`detect/game.rs:3`) is unchanged; the trampoline checks are additive.

## 7. Edge cases & how the plan handles them

| Case | Handling |
| --- | --- |
| Game running during install | `install_trampoline` step 0 calls `game_process::is_bazaar_running_best_effort`, which is **best-effort and currently a no-op on macOS** (returns `false`; a reliable macOS probe is not wired because `pgrep -f` self-matches concurrent invocations). Real protection comes from the orchestrator closing Steam first (`prepare_steam_for_launch_option_update(steam, false)`), which takes down a Steam-launched Bazaar; re-signing/renaming a still-running Mach-O via its open inode is benign. |
| `codesign` unavailable | Hard error before any rename (never leave a modified-unsigned bundle). |
| Re-install / already trampolined | Idempotent: step 1 detects `is_trampolined` and returns Ok. |
| Steam "Verify integrity" / game update reverted the swap | Detection surfaces `trampoline_reverted` (desired-from-marker vs applied) → Repair re-applies. Expected in trampoline mode (either trigger). |
| `.orig` missing on uninstall | If `<exe>` is already the real binary → no-op Ok; if `<exe>` is the stub → error → user runs Steam Verify. |
| macOS upgraded 26 → 27 after a ≤26 prefix install | On installer open, `trampoline_forced() && !trampoline_applied` → offer migrate (= Repair: close Steam, install trampoline, clear LaunchOptions, marker=trampoline). |
| User toggles 兼容模式 and reinstalls (≤26) | `run_install` reconciles: enabling → install trampoline + clear LaunchOptions; disabling → `uninstall_trampoline` (restore vanilla) + set prefix LaunchOptions. Marker updated. Clean either direction. |
| Partial failure / crash mid-install | `install_trampoline` self-rolls-back, AND is idempotent over partial prior state (re-running completes it), so a crash mid-`codesign` is recoverable via Repair or Steam Verify. The outer `InstallTargetBackup` (payload.rs:21-54) covers only the sibling payload; bundle recovery is by re-apply, not snapshot. Do NOT add `Contents/MacOS/*` to `payload_root_relative_paths` — `uninstall_payload` would then delete the game binary. |
| `uninstall_trampoline` fails | Abort uninstall immediately — do NOT then remove siblings or clear options — and return the error so the user Repairs first. Order: close Steam → `uninstall_trampoline` → `uninstall_payload` → clear LaunchOptions. |
| libdoorstop.dylib signature (DevID vs adhoc) | Injection works with either, because the re-signed `.orig` carries `disable-library-validation`. `codesign --deep <app>` on ≤26 does NOT touch `libdoorstop.dylib` (it lives in the game dir, OUTSIDE the `.app`), so its signature is preserved. |
| Quarantine on the copied stub | The installer is notarized; defensively `xattr -d com.apple.quarantine` the copied stub (best-effort) before signing, since an AMFI-relevant quarantine on the bundle main could block launch on 27. |
| Steam cloud-syncs the cleared localconfig | Desired in trampoline mode; benign. |

## 8. Tests

Rust unit tests (`#[cfg(target_os = "macos")]`, fixture `.app` with a fake `Contents/MacOS/The Bazaar`):
- `install_trampoline` renames real→`.orig`, drops the stub, and is idempotent on second call.
- `uninstall_trampoline` restores exactly (and is a no-op when already vanilla / `.orig` missing-but-real).
- `is_trampolined` true only in the applied state.
- The branch selector is gated on an injectable `uses_trampoline` flag so tests force either path without a real `sw_vers`.
- Mode switch: trampoline→prefix restores the vanilla bundle (and would set prefix); prefix→trampoline applies the stub; the
  `.bpp-launch-mode` marker and `trampoline_desired`/`trampoline_applied` track the current mode; `trampoline_reverted` surfaces when
  marker=`trampoline` but `is_trampolined()`=false.
- No codesign in unit tests (fixture binaries are fake) — signing is covered by the on-device verification, not unit tests.
Follow the repo rule: no coverage-theater / mock-sequence tests.

## 9. Verification (post-implementation, on macOS 27 Apple Silicon)

Mechanism already proven (§3). After wiring the installer, re-run on the main path (build + reload):
1. Fresh install in trampoline mode (27+ forced, or ≤26 with 兼容模式 ON) → bundle trampolined, `.orig` carries the 3 entitlements,
   `codesign --verify --deep --strict` exit 0, LaunchOptions empty, `.bpp-launch-mode` = `trampoline`.
2. `open steam://run/1617400` → Steam `Completed`; fresh `BepInEx/LogOutput.log` with `BazaarPlusPlus 4.1.0`; `vmmap` shows libdoorstop; overlay present.
3. Uninstall → bundle byte-restored to vanilla; game launches clean.
4. Steam "Verify integrity" → detection flags `trampoline_reverted` → Repair re-applies cleanly.
5. ≤26 default smoke test (no 27 hardware needed): compat OFF → prefix-script path installs unchanged (LaunchOptions = prefix, bundle untouched).
6. ≤26 opt-in (experimental): compat ON installs the trampoline + clears LaunchOptions + marker; toggling compat OFF and reinstalling
   restores the vanilla bundle + prefix LaunchOptions. (Injection on ≤26 itself can only be confirmed on real ≤26 hardware — a pre-GA gate
   before advertising the option as stable.)

## 10. Out of scope / not done

- No change to mod DLLs, `run_bepinex.sh` contents, or the ≤26 DEFAULT (prefix) path.
- No `Info.plist` edit (CFBundleExecutable stays "The Bazaar").
- No universal/Intel stub (arm64-only by support policy).
- Not making trampoline the DEFAULT on ≤26 — it ships as an opt-in 兼容模式 (experimental); prefix stays the ≤26 default. (Forcing
  trampoline on everyone would worsen verify-integrity / game-update durability for users who don't need it.)

## 11. Open decisions for confirmation

1. **Repair UX**: detect-on-open and show a "needs repair" banner, but require an **explicit user tap** to run Repair. Repair closes Steam
   (`prepare_steam_for_launch_option_update(false)`), so it must NEVER auto-run while the user may be mid-session. (Recommended over both
   silent auto-repair and a hidden manual-only button — covers the 26→27 upgrade case without yanking Steam out from under an active game.)
2. **macOS-upgrade migration (26→27)**: lazy — on the next installer open, detection sees `trampoline_forced() && !trampoline_applied`
   and surfaces the same user-tap Repair banner (no eager on-upgrade hook, no auto Steam close).
3. **Version threshold**: gate purely on `major >= 27` (recommended) vs. also key off a Steam-client signal. (Pure version is simpler and
   matches the proven cause; a future Steam fix that restores prefix-launch would be handled by leaving ≤26 logic intact and revisiting.)
4. **兼容模式 label**: ship the ≤26 opt-in as "实验性 (Experimental)" until injection is confirmed on real ≤26 hardware (§9 step 6)?
```
