# macOS Universal Build Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make macOS production builds default to a universal Tauri target without breaking the Rosetta-based plugin runtime.

**Architecture:** Keep `build.sh` as the entrypoint, but make its production plan explicit per platform. macOS will append `--target universal-apple-darwin` to both the binary build and bundle steps, while Windows keeps the current default target behavior.

**Tech Stack:** Bash, Node.js test runner, Tauri CLI

---

### Task 1: Lock the desired shell behavior with tests

**Files:**
- Create: `scripts/build.test.mjs`
- Modify: `build.sh`

**Step 1: Write the failing test**

Create shell-level regression tests that source `build.sh`, stub `invoke_step`, and assert:
- macOS build commands include `--target universal-apple-darwin`
- macOS output paths point at `src-tauri/target/universal-apple-darwin/release/...`
- Windows commands do not add an explicit target

**Step 2: Run test to verify it fails**

Run: `node --test scripts/build.test.mjs`
Expected: FAIL because `build.sh` currently has no source-safe entrypoint and no universal target handling.

**Step 3: Write minimal implementation**

Refactor `build.sh` so it can be sourced in tests, then update the macOS production branch to append the universal target to both Tauri commands and to report the universal output directories.

**Step 4: Run test to verify it passes**

Run: `node --test scripts/build.test.mjs`
Expected: PASS

### Task 2: Verify the broader script suite still passes

**Files:**
- Modify: `build.sh`

**Step 1: Run the full scripted test suite**

Run: `node --test`
Expected: PASS

**Step 2: Run a production build smoke test on macOS**

Run: `./build.sh --prod`
Expected: Tauri build and bundle commands target `universal-apple-darwin` and complete successfully if the local signing/build environment is healthy.
