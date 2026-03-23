# Supporters Cloudflare Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make supporter loading return local data immediately, refresh Cloudflare data in the background, and surface refreshed data on the next modal reopen without unnecessary reshuffles.

**Architecture:** The Rust Tauri command remains the source of truth for bundled/cache/remote selection, but stale refresh becomes a detached background task instead of a blocking request. The frontend shared loader revalidates against Tauri on each modal open and reuses shuffled order only when the returned supporter snapshot is unchanged.

**Tech Stack:** Rust, Tauri, TypeScript, Svelte, Node test runner

---

### Task 1: Add failing Rust tests for stale return and refresh persistence

**Files:**
- Modify: `src-tauri/src/commands/supporters.rs`
- Test: `src-tauri/src/commands/supporters.rs`

**Step 1: Write the failing test**

Add tests for:

- stale local payload returns immediately and requests a background refresh instead of blocking
- refresh helper persists fetched remote entries to cache state

**Step 2: Run test to verify it fails**

Run: `cargo test supporters`
Expected: FAIL because the non-blocking refresh helper and cache-write test hook do not exist yet.

### Task 2: Add failing frontend tests for reopen-time revalidation

**Files:**
- Modify: `src/lib/supporters.test.ts`
- Test: `src/lib/supporters.test.ts`

**Step 1: Write the failing test**

Add tests for:

- same Tauri payload snapshot reuses prior shuffle order across multiple loads
- changed Tauri payload snapshot is picked up on the next load

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/supporters.test.ts`
Expected: FAIL because the frontend loader still short-circuits on the first cached response.

### Task 3: Implement non-blocking Cloudflare refresh

**Files:**
- Modify: `src-tauri/src/commands/supporters.rs`

**Step 1: Write minimal implementation**

Add:

- detached refresh scheduling with an in-flight guard
- a refresh helper that fetches remote entries and writes cache
- response construction that always returns local payload immediately

**Step 2: Run Rust tests**

Run: `cargo test supporters`
Expected: PASS

### Task 4: Implement snapshot-aware frontend revalidation

**Files:**
- Modify: `src/lib/supporters.ts`
- Modify: `src/lib/components/supporters/SupporterListModal.svelte`
- Modify: `src/lib/supporters.test.ts`

**Step 1: Write minimal implementation**

Add:

- loader state keyed by payload snapshot instead of permanent response short-circuiting
- modal reopen-time load behavior
- shuffle reuse only when the snapshot key is unchanged

**Step 2: Run frontend tests**

Run: `npm test -- src/lib/supporters.test.ts`
Expected: PASS

### Task 5: Verify end-to-end behavior

**Files:**
- Modify: `src-tauri/src/commands/supporters.rs`
- Modify: `src/lib/supporters.ts`
- Modify: `src/lib/components/supporters/SupporterListModal.svelte`

**Step 1: Run full verification**

Run: `cargo test supporters`
Expected: PASS

Run: `npm test`
Expected: PASS

Run: `npm run check`
Expected: PASS

**Step 2: Confirm remote source is reachable**

Run a direct fetch against `https://bpp-static.bazaarplusplus.com/supporter-list.json` and confirm the payload is valid JSON so the refresh helper can consume it.
