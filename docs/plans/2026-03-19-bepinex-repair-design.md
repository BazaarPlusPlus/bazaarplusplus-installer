# Windows BepInEx Repair Design

**Problem**

Some Windows users end up with a dirty Bazaar installation after trying different BepInEx or mod setups. The current installer can reinstall or uninstall BazaarPlusPlus, but it does not expose a stronger cleanup action that removes leftover custom files from the game root.

**Goal**

Add a Windows-only "Repair BepInEx Environment" action to the installer UI. The action should remove custom mod-related content from the selected Bazaar installation, keep only the minimum official top-level runtime set, and require an explicit danger confirmation before running.

**Non-goals**

- Do not automatically reinstall BazaarPlusPlus after repair.
- Do not recursively clean inside official game directories such as `TheBazaar_Data`.
- Do not expose this action on macOS.

**User Experience**

- The action lives in the existing `...` action menu next to `Uninstall`.
- It is only visible on Windows.
- Clicking it opens a dedicated danger confirmation modal.
- The modal explicitly states that all custom configs, mods, injected DLLs, and extra files outside the whitelist will be deleted.
- After repair completes, the installer re-runs environment detection so the UI returns to the normal "not installed / ready to install" state.

**Backend Design**

Add a new Tauri command for Windows-only repair. The command validates the selected game path, enumerates the Bazaar root directory, and deletes every top-level file or directory that is not in the whitelist.

Recommended behavior:

- Validate the path with the existing `is_valid_game_path` check.
- Build a Windows whitelist of required top-level official items.
- Enumerate only the root entries directly under the selected game folder.
- Preserve whitelist entries.
- Delete every other top-level entry, including `BepInEx`, `doorstop_config.ini`, `winhttp.dll`, extra DLLs, scripts, configs, and third-party folders.
- Return an error if any deletion fails.

**Whitelist Boundary**

Use a conservative top-level whitelist. The repair command should preserve official runtime items such as:

- `TheBazaar.exe`
- `TheBazaar_Data`
- Official Unity or platform runtime DLLs and directories that ship beside the executable

The whitelist should be implemented as an explicit Rust constant so it is readable, testable, and easy to update when the official Windows package changes.

The repair command must not descend into whitelist directories. This keeps the blast radius limited to root-level custom content and avoids deleting official data inside `TheBazaar_Data` or other runtime folders.

**Frontend Design**

Frontend changes stay within the existing installer page and action menu flow:

- Add a new API wrapper for the repair Tauri command.
- Extend page state to represent the repair action busy state.
- Add a Windows capability helper so the UI can hide the action on non-Windows platforms.
- Add a danger confirmation modal with localized copy.
- Wire the menu action to the new repair handler.
- Reuse the current Steam-running confirmation flow before destructive file operations.

**Error Handling**

- Invalid game path: fail fast and do nothing.
- Steam/file-lock issue: fail with a clear backend error.
- Partial cleanup is not treated as success; any delete failure returns an error so the user can retry after closing interfering processes.

The current frontend mostly logs failures to the console. That is acceptable for this feature's first version.

**Testing**

Rust tests:

- Whitelist entries are preserved.
- Non-whitelist top-level files and folders are removed.
- Official directories are preserved without recursive cleanup.
- Invalid game paths are rejected.

TypeScript/Svelte tests:

- The repair action is only exposed on Windows.
- Busy state disables the repair action.
- The repair state does not regress install / uninstall button behavior.

**Risks**

- The whitelist can drift if The Bazaar changes its official Windows root layout.
- Root-level cleanup is intentionally aggressive and can remove user-created files that are not mods.

These risks are mitigated by the explicit danger modal and by limiting cleanup to top-level non-whitelist items.
