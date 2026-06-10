---
status: truth
topic: launch-modes
last-verified: 7b18f73d4718d3e1406de9f526d1fbba09ac567f
---

# Launch Modes

## Steam Versus Tempo

- Launch flow is selected by both Steam detection and game path. Steam flow is used only when a Steam client is detected and the resolved game path contains a `steamapps` path component; otherwise Tempo native flow is selected in `src-tauri/src/services/install/mod.rs:177-191`.
- The public launch action re-detects environment state, then dispatches to Steam URL launch or Tempo capture/replay in `src-tauri/src/services/install/mod.rs:199-210`.
- Steam launch opens `steam://rungameid/1617400` in `src-tauri/src/services/install/mod.rs:24-24` and `src-tauri/src/services/install/mod.rs:167-169`; the capability allows `steam://*` URLs in `src-tauri/capabilities/default.json:12-18`.

## Tempo Native Flow

- Tempo launches are guarded by a process-wide in-flight flag and a cancel flag in `src-tauri/src/services/tempo.rs:22-24` and `src-tauri/src/services/tempo.rs:115-127`.
- Before Tempo launch, the service resolves the game directory, launcher target, and game executable; if a game process is already running it returns `tempo_game_already_running` in `src-tauri/src/services/tempo.rs:129-141`.
- The flow backs up and removes mod payload files, starts Tempo Launcher, waits for a native game process, captures arguments, terminates the captured process, restores the payload, and launches the modded game with captured arguments in `src-tauri/src/services/tempo.rs:173-223`.
- If the Tempo flow errors, it attempts backup restore, reinstalls the macOS trampoline when it had temporarily removed it, emits an error status, and returns the error in `src-tauri/src/services/tempo.rs:226-237`.
- The install page listens for `tempo-launch-status`, updates busy state, maps known phases to localized messages, and exposes a cancel action in `src/features/install/useInstallPage.ts:135-152` and `src/features/install/useInstallPage.ts:226-248`.
- The launch button shows a Tempo hint and cancel button while a Tempo launch is in progress in `src/features/install/InstallActionsPanel.tsx:152-165`.

## macOS Prefix And Trampoline Modes

- macOS trampoline mode is forced at macOS major version 27 or later, and can be opted into on macOS versions below 27; it is always false off macOS in `src-tauri/src/services/macos_version.rs:15-80`.
- `InstallCompatState` exposes whether compatibility mode is available, forced, desired, and applied in `src-tauri/src/services/install/types.rs:26-38`.
- The trampoline implementation persists the chosen launch mode in `.bpp-launch-mode` next to the game directory in `src-tauri/src/services/bepinex/trampoline.rs:21-33` and `src-tauri/src/services/bepinex/trampoline.rs:56-80`.
- Trampoline install renames the real Unity executable to `.orig`, swaps in a build-time stub, disables the prefix launcher, signs the real binary, seals the app bundle, verifies it, and rolls back on failure in `src-tauri/src/services/bepinex/trampoline.rs:384-467`.
- Trampoline uninstall restores `.orig`, re-seals the bundle, treats already-vanilla bundles as no-op, and errors if the backup is missing while the stub remains in `src-tauri/src/services/bepinex/trampoline.rs:469-494`.
- Non-macOS trampoline APIs are explicit no-ops or `false` in `src-tauri/src/services/bepinex/trampoline.rs:512-525`.
