# Installer Update Check Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a lightweight startup update check that reports the installer version to a Cloudflare Worker and shows a non-blocking prompt when a newer version exists.

**Architecture:** The Svelte app will generate and persist an anonymous `installId`, throttle background update checks in local storage, and call a configurable Worker endpoint after the main page mounts. The Worker will read a release JSON document from KV, compare semantic versions, and return website metadata for the banner CTA.

**Tech Stack:** SvelteKit, Tauri 2 frontend APIs, TypeScript, Node test runner, Cloudflare Workers KV

---

### Task 1: Define client-side update-check behavior

**Files:**
- Modify: `src/lib/installer/storage.ts`
- Create: `src/lib/installer/storage.test.ts`
- Create: `src/lib/installer/update.ts`
- Create: `src/lib/installer/update.test.ts`

**Step 1: Write the failing tests**

Add tests for:
- generating and persisting `installId`
- persisting update-check timestamps
- skipping checks within the throttle window
- comparing semantic versions correctly
- returning banner data only when the server reports a newer version

**Step 2: Run tests to verify they fail**

Run: `node --test src/lib/installer/storage.test.ts src/lib/installer/update.test.ts`
Expected: FAIL because the new storage and update-check helpers do not exist yet.

**Step 3: Write minimal implementation**

Implement:
- `getOrCreateInstallId()`
- `loadLastUpdateCheckAt()` / `persistLastUpdateCheckAt()`
- `shouldCheckForInstallerUpdate()`
- `compareSemanticVersions()`
- `checkForInstallerUpdate()`

**Step 4: Run tests to verify they pass**

Run: `node --test src/lib/installer/storage.test.ts src/lib/installer/update.test.ts`
Expected: PASS

### Task 2: Integrate update checks into the home page

**Files:**
- Modify: `src/routes/+page.svelte`
- Modify: `src/lib/i18n.ts`
- Modify: `src/lib/types.ts`
- Create: `src/env.d.ts`

**Step 1: Write the failing test**

Add a small source-level test that confirms the home page triggers the update check on mount and renders the update prompt copy.

**Step 2: Run test to verify it fails**

Run: `node --test src/lib/installer/update-page.test.ts`
Expected: FAIL because the page does not reference the update-check helpers or banner copy yet.

**Step 3: Write minimal implementation**

Add:
- background `loadUpdateInfo()` call on mount
- a dismissible banner with localized fallback copy
- `openUrl()` CTA to the website URL
- `VITE_UPDATE_CHECK_URL` typing

**Step 4: Run test to verify it passes**

Run: `node --test src/lib/installer/update-page.test.ts`
Expected: PASS

### Task 3: Scaffold the Worker endpoint

**Files:**
- Create: `workers/update-check/package.json`
- Create: `workers/update-check/wrangler.toml`
- Create: `workers/update-check/src/index.ts`

**Step 1: Write the failing test**

Skip. This repo does not currently include a Worker test harness; keep the Worker implementation minimal and verify it with TypeScript-free runtime-safe code plus manual inspection.

**Step 2: Write minimal implementation**

Implement one POST endpoint that:
- parses client metadata
- reads the release JSON from KV
- compares versions
- returns `updateAvailable`, `latestVersion`, `websiteUrl`, `title`, and `message`

**Step 3: Verify the implementation shape**

Run: `sed -n '1,220p' workers/update-check/src/index.ts`
Expected: a single small Worker entrypoint with release parsing and response generation.

### Task 4: Verify end-to-end repo health

**Files:**
- Verify: `src/lib/installer/storage.test.ts`
- Verify: `src/lib/installer/update.test.ts`
- Verify: `src/lib/installer/update-page.test.ts`
- Verify: `src/routes/+page.svelte`
- Verify: `workers/update-check/src/index.ts`

**Step 1: Run targeted tests**

Run: `node --test src/lib/installer/storage.test.ts src/lib/installer/update.test.ts src/lib/installer/update-page.test.ts`
Expected: PASS

**Step 2: Run project type checks**

Run: `npm run check`
Expected: PASS

**Step 3: Review changed files**

Run: `git diff -- src/lib/installer/storage.ts src/lib/installer/update.ts src/routes/+page.svelte src/lib/i18n.ts src/lib/types.ts src/env.d.ts workers/update-check`
Expected: only the planned update-check changes
