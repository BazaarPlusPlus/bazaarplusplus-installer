# Supporters Tier Shuffle Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Shuffle supporters within each tier once per load while keeping descending tier groups intact.

**Architecture:** The shared frontend loader remains the source of truth for supporter ordering. It will normalize data, shuffle entries within each tier using a deterministic injectable random function for tests, then cache the first successful response so repeated callers see the same order until the module reloads.

**Tech Stack:** TypeScript, Node test runner, SvelteKit shared frontend utilities

---

### Task 1: Add failing tests for grouped shuffle behavior

**Files:**
- Modify: `src/lib/supporters.test.ts`
- Test: `src/lib/supporters.test.ts`

**Step 1: Write the failing test**

Add tests that verify:

- tier order remains `4 -> 3 -> 2 -> 1`
- entries inside a tier are shuffled using an injected random function
- repeated `loadSupportersData()` calls return the same first-load order

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/supporters.test.ts`
Expected: FAIL because the shuffle helper and load cache do not exist yet.

### Task 2: Implement load-time tier shuffle

**Files:**
- Modify: `src/lib/supporters.ts`
- Modify: `src/lib/supporters.test.ts`

**Step 1: Write minimal implementation**

Add:

- a Fisher-Yates helper
- a `shuffleSupportersWithinTier()` helper
- module-level cached response state
- an optional injected random function for tests

**Step 2: Run test to verify it passes**

Run: `npm test -- src/lib/supporters.test.ts`
Expected: PASS

### Task 3: Verify no regression in the shared loader behavior

**Files:**
- Modify: `src/lib/supporters.ts`
- Modify: `src/lib/supporters.test.ts`

**Step 1: Run focused verification**

Run: `npm test -- src/lib/supporters.test.ts`
Expected: PASS with all supporter loader tests green.

**Step 2: Run broader static verification**

Run: `npm run check`
Expected: PASS without new type or Svelte errors from the shared loader changes.
