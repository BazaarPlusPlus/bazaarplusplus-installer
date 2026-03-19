# Supporters Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add bundled-plus-cache supporter loading with a 24-hour R2 refresh policy and reuse it across the installer and about page.

**Architecture:** A new Tauri command will own bundled parsing, cache reads, cache freshness checks, remote refresh, and normalized response shaping. The Svelte app will call a shared frontend loader that uses the Tauri command when available and falls back to bundled JSON in browser-only contexts.

**Tech Stack:** Rust, Tauri 2 commands, serde/serde_json, reqwest, Svelte 5, TypeScript, Node test runner, cargo test

---

### Task 1: Add failing Rust tests for supporter sync rules

**Files:**
- Modify: `src-tauri/src/commands/supporters.rs`

**Step 1: Write the failing tests**

- Add unit tests for:
  - valid supporter entry parsing
  - invalid supporter entry rejection
  - stale cache detection at 24 hours
  - cache preferred over bundled data when valid
  - bundled preferred when cache is missing or invalid

**Step 2: Run test to verify it fails**

Run: `cargo test supporters`
Expected: FAIL because the new module and helper functions do not exist yet.

**Step 3: Write minimal implementation**

- Create `supporters.rs`
- Add pure helpers for payload normalization and cache freshness decisions

**Step 4: Run test to verify it passes**

Run: `cargo test supporters`
Expected: PASS

### Task 2: Implement the Tauri supporter sync command

**Files:**
- Create: `src-tauri/src/commands/supporters.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/Cargo.toml`

**Step 1: Write the failing test**

- Add a test covering remote payload acceptance and cache write shape.

**Step 2: Run test to verify it fails**

Run: `cargo test supporters`
Expected: FAIL because remote refresh and cache metadata are not implemented.

**Step 3: Write minimal implementation**

- Add the command to:
  - read bundled JSON
  - read cache JSON
  - decide whether refresh is needed
  - fetch remote JSON when stale
  - write updated cache with `fetchedAt`
  - return normalized response

**Step 4: Run test to verify it passes**

Run: `cargo test supporters`
Expected: PASS

### Task 3: Add shared frontend supporter loader

**Files:**
- Create: `src/lib/supporters.ts`
- Modify: `src/lib/installer/api.ts`
- Modify: `src/lib/types.ts`
- Test: `src/lib/supporters.test.ts`

**Step 1: Write the failing test**

- Add tests for browser fallback to bundled JSON and sorting behavior.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/supporters.test.ts`
Expected: FAIL because the shared loader does not exist.

**Step 3: Write minimal implementation**

- Add a runtime-aware loader:
  - Tauri: invoke supporter sync command
  - Web: fetch bundled JSON
- Move shared normalization and sorting into this module where needed by the UI

**Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/supporters.test.ts`
Expected: PASS

### Task 4: Switch installer and about page to the shared loader

**Files:**
- Modify: `src/lib/components/installer/InstallerSupportBar.svelte`
- Modify: `src/routes/about/+page.svelte`

**Step 1: Write the failing test**

- If a direct component test is not already practical in this repo, use the shared loader tests from Task 3 as the regression barrier and manually verify component integration through type checking.

**Step 2: Run test to verify it fails**

Run: `npm run check`
Expected: FAIL until both components compile against the new shared loader types.

**Step 3: Write minimal implementation**

- Replace duplicated fetch/normalize logic with the shared loader.
- Keep current modal behavior and copy intact.

**Step 4: Run test to verify it passes**

Run: `npm run check`
Expected: PASS

### Task 5: Verify the full change set

**Files:**
- Modify: `docs/plans/2026-03-19-supporters-sync-design.md`
- Modify: `docs/plans/2026-03-19-supporters-sync.md`

**Step 1: Run Rust tests**

Run: `cargo test supporters`
Expected: PASS

**Step 2: Run frontend tests**

Run: `npm test`
Expected: PASS

**Step 3: Run type and Svelte checks**

Run: `npm run check`
Expected: PASS

**Step 4: Commit**

```bash
git add docs/plans/2026-03-19-supporters-sync-design.md docs/plans/2026-03-19-supporters-sync.md src-tauri/Cargo.toml src-tauri/src/lib.rs src-tauri/src/commands/mod.rs src-tauri/src/commands/supporters.rs src/lib/installer/api.ts src/lib/types.ts src/lib/supporters.ts src/lib/supporters.test.ts src/lib/components/installer/InstallerSupportBar.svelte src/routes/about/+page.svelte
git commit -m "feat: sync supporters from cache and remote"
```
