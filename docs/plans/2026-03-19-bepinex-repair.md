# BepInEx Repair Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Windows-only repair action that removes non-whitelisted top-level files from a Bazaar installation after an explicit danger confirmation.

**Architecture:** Extend the existing Tauri command set with a Windows repair command that performs root-level whitelist cleanup. Surface the action inside the existing installer action menu, gate it behind Windows detection and a dedicated confirmation modal, and reuse the current action refresh flow after the command completes.

**Tech Stack:** Tauri, Rust, SvelteKit, TypeScript, node:test

---

### Task 1: Add page state coverage for a repair action

**Files:**
- Modify: `src/lib/installer/state.ts`
- Modify: `src/lib/installer/state.test.ts`

**Step 1: Write the failing test**

Add a state test that passes `actionBusy: 'repair'` and asserts:

- `isBusy` is `true`
- `canInstall` is `false`
- `canLaunchGame` is `false`

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/installer/state.test.ts`
Expected: FAIL because `ActionBusy` does not include `repair`.

**Step 3: Write minimal implementation**

Update `ActionBusy` to include `'repair'` and keep `createPageState` driven by the shared `isBusy` check.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/installer/state.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/installer/state.ts src/lib/installer/state.test.ts
git commit -m "test: cover repair busy state"
```

### Task 2: Add runtime and API plumbing for Windows-only repair

**Files:**
- Modify: `src/lib/installer/runtime.ts`
- Modify: `src/lib/installer/runtime.test.ts`
- Modify: `src/lib/installer/api.ts`

**Step 1: Write the failing test**

Add runtime tests for a helper such as `supportsBepinexRepair(platform)`:

- returns `true` for `'windows'`
- returns `false` for `'macos'`
- returns `false` for unknown values

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/installer/runtime.test.ts`
Expected: FAIL because the helper does not exist.

**Step 3: Write minimal implementation**

- Add the runtime helper.
- Add a frontend API wrapper for the new Tauri command.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/installer/runtime.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/installer/runtime.ts src/lib/installer/runtime.test.ts src/lib/installer/api.ts
git commit -m "feat: add repair capability plumbing"
```

### Task 3: Add backend whitelist cleanup command and tests

**Files:**
- Modify: `src-tauri/src/commands/bepinex.rs`
- Modify: `src-tauri/src/lib.rs`

**Step 1: Write the failing test**

Add Rust tests that:

- create a valid Windows-style game directory
- add whitelist files such as `TheBazaar.exe` and `TheBazaar_Data`
- add removable entries such as `BepInEx`, `doorstop_config.ini`, `winhttp.dll`, `mods`, and `custom.dll`
- call the repair helper
- assert whitelist entries remain and custom top-level entries are removed

Add a second test that places a nested file inside `TheBazaar_Data` and asserts it is still present after repair.

**Step 2: Run test to verify it fails**

Run: `cd src-tauri && cargo test repair`
Expected: FAIL because the repair helper and command do not exist.

**Step 3: Write minimal implementation**

- Define a Windows top-level whitelist constant.
- Add a helper that validates the game path and removes non-whitelisted root entries.
- Expose a new `repair_bepinex_environment` Tauri command.
- Register the command in `src-tauri/src/lib.rs`.

**Step 4: Run test to verify it passes**

Run: `cd src-tauri && cargo test repair`
Expected: PASS

**Step 5: Commit**

```bash
git add src-tauri/src/commands/bepinex.rs src-tauri/src/lib.rs
git commit -m "feat: add Windows BepInEx repair command"
```

### Task 4: Add localized repair modal and action menu wiring

**Files:**
- Modify: `src/lib/i18n.ts`
- Modify: `src/routes/+page.svelte`
- Modify: `src/lib/components/installer/InstallerStatusSteps.svelte`

**Step 1: Write the failing test**

If there is no current component test harness, add a targeted unit-level regression through the page/runtime/state layer first:

- assert the repair action is hidden when the platform is not Windows
- assert it is disabled while another action is running

If that is not practical, write the smallest new testable helper and cover the visibility/disabled logic there before touching the UI.

**Step 2: Run test to verify it fails**

Run the relevant frontend test command used for the new helper or state coverage.
Expected: FAIL because repair visibility / copy / busy handling is not implemented.

**Step 3: Write minimal implementation**

- Add localized strings for the repair action and confirmation modal.
- Track `showRepairModal`.
- Add a repair handler in `+page.svelte`.
- Reuse Steam-running confirmation before repair.
- Add the menu item under `Uninstall`.
- Show it only on Windows.

**Step 4: Run test to verify it passes**

Run the same frontend test command.
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/i18n.ts src/routes/+page.svelte src/lib/components/installer/InstallerStatusSteps.svelte
git commit -m "feat: add repair action to installer UI"
```

### Task 5: Run end-to-end verification and clean up

**Files:**
- Modify: any touched files if verification exposes issues

**Step 1: Run focused frontend tests**

Run: `npm test -- src/lib/installer/state.test.ts src/lib/installer/runtime.test.ts`
Expected: PASS

**Step 2: Run focused Rust tests**

Run: `cd src-tauri && cargo test bepinex`
Expected: PASS

**Step 3: Run full app quality checks that are already standard in this repo**

Run the smallest existing project verification commands that cover TypeScript and Rust compile health.

Suggested commands:

```bash
npm test
cd src-tauri && cargo test
```

Expected: PASS

**Step 4: Inspect the changed installer UI manually**

Run the local app and verify:

- repair action is only shown on Windows builds
- the danger modal copy is clear
- repair returns the page to an uninstalled state

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Windows repair flow for dirty BepInEx installs"
```
