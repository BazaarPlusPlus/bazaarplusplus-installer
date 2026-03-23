# Supporters Remove Amount Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove `amount` from supporter data end-to-end while keeping loaders tolerant of older payloads that still include it.

**Architecture:** The Rust Tauri command and the frontend shared loader both treat `name` and `tier` as the only canonical supporter fields. Legacy payloads may still contain `amount`, but that field is ignored during normalization. Deterministic pre-shuffle ordering becomes `tier desc`, then `name asc`.

**Tech Stack:** Rust, Tauri, TypeScript, Svelte, Node test runner

---

### Task 1: Add failing Rust tests for amount-free payloads

**Files:**
- Modify: `src-tauri/src/commands/supporters.rs`

**Step 1: Write the failing tests**

Add tests for:

- valid payloads normalize when entries only contain `name` and `tier`
- legacy payloads that still include `amount` normalize successfully
- normalized sorting no longer depends on `amount`

**Step 2: Run test to verify it fails**

Run: `cargo test supporters`
Expected: FAIL because the Rust model still requires `amount`.

### Task 2: Add failing frontend tests for amount-free payloads

**Files:**
- Modify: `src/lib/supporters.test.ts`
- Modify: `src/lib/types.ts`

**Step 1: Write the failing tests**

Add tests for:

- `normalizeSupporterPayload()` accepts entries without `amount`
- legacy payloads with `amount` are normalized without preserving the field
- `sortSupporters()` sorts by `tier`, then `name`

**Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/supporters.test.ts`
Expected: FAIL because the frontend model still requires `amount`.

### Task 3: Remove amount from Rust support code

**Files:**
- Modify: `src-tauri/src/commands/supporters.rs`

**Step 1: Write minimal implementation**

Update:

- `SupporterEntry`
- normalization and sorting
- cache document handling
- unit tests

**Step 2: Run Rust tests**

Run: `cargo test supporters`
Expected: PASS

### Task 4: Remove amount from frontend support code and bundled data

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/supporters.ts`
- Modify: `src/lib/supporters.test.ts`
- Modify: `static/support/supporter-list.json`

**Step 1: Write minimal implementation**

Update:

- TS types and normalization
- shuffle snapshot key generation
- bundled JSON shape

**Step 2: Run frontend checks**

Run: `npm test`
Expected: PASS

Run: `npm run check`
Expected: PASS

### Task 5: Verify end-to-end behavior

**Step 1: Run full verification**

Run: `cargo test supporters`
Expected: PASS

Run: `npm test`
Expected: PASS

Run: `npm run check`
Expected: PASS
