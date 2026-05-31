# React Root And Contract P0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the root SvelteKit build entry with the approved React prototype shell and establish the first generated-contract API layer.

**Architecture:** Keep the backend stable while swapping the frontend runtime to React/Vite, then add typed API seams that can absorb the subsequent install, stream, and history command rewrites. Rust DTOs remain the canonical source for generated TypeScript bindings.

**Tech Stack:** React, React Router, Vite, TypeScript, Tailwind CSS, lucide-react, Tauri 2, Vitest.

---

## Contract Freeze Notes

- Final command names are product-oriented: app bootstrap/locale, install state/actions, stream ensure/restart/session actions, and history run/detail actions.
- The mod SQLite schema is authoritative. History fields use `victories`, `losses`, `final_player_rank`, `final_player_rating`, `opponent_name`, `screenshot_id`, and uppercase combat video `status`; there is no `runs.player_name`, `wins`, `final_rank`, `final_rating`, or `opponent_player_name`.
- React-facing preview DTOs must not include full local `image_path` or full `image_url`; strip previews compose `base_url + strip_url`.
- `/overlay`, `/settings`, and `/assets/*` are preserved. `/api/records/*` is renamed to `/api/stream/*` when the stream HTTP contract is rewritten.
- `/stream` route entry and History image use call `ensure_stream_session`; only the manual retry button calls `restart_stream_session`.
- Svelte compatibility is not a goal for the final implementation.

## Task 1: React Root Build Scaffold

**Files:**
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles/index.css`
- Modify: `vite.config.js` or replace with `vite.config.ts`
- Modify: `tsconfig.json`
- Modify: `vitest.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Install React build dependencies**

Run:

```bash
npm install react react-dom react-router-dom lucide-react clsx tailwind-merge
npm install -D @vitejs/plugin-react @tailwindcss/vite tailwindcss @types/react @types/react-dom
```

Expected: `package.json` and `package-lock.json` add React/Tailwind dependencies without modifying app source.

- [ ] **Step 2: Create the Vite React HTML entry**

Add `index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>BazaarPlusPlus</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Switch Vite to React while preserving Tauri dev settings**

Replace the SvelteKit plugin with `@vitejs/plugin-react` and `@tailwindcss/vite`, keeping the existing `__FRONTEND_VERSION__`, port `1420`, strict port, HMR host, and `src-tauri` watch ignore.

- [ ] **Step 4: Switch TypeScript to React JSX**

Update `tsconfig.json` so it no longer extends `.svelte-kit/tsconfig.json`, includes `src`, `scripts`, and `vitest.config.ts`, and sets `"jsx": "react-jsx"`, `"lib": ["ES2023", "DOM", "DOM.Iterable"]`, `"moduleResolution": "bundler"`, and `"strict": true`.

- [ ] **Step 5: Copy the approved prototype shell**

Copy the prototype route structure from `bpp-react-prototype/src/App.tsx`, replacing `MemoryRouter` with `BrowserRouter`. Copy the prototype global styles into `src/styles/index.css`.

- [ ] **Step 6: Verify the root scaffold**

Run:

```bash
npm run build
```

Expected: the build uses Vite/React and no longer runs `svelte-kit sync`.

## Task 2: Typed Frontend API Foundation

**Files:**
- Create: `src/api/tauri.ts`
- Create: `src/api/http.ts`
- Create: `src/api/http.test.ts`
- Create: `src/types/backend.ts`
- Modify: `scripts/generate-bindings.mjs`
- Modify: `package.json`

- [ ] **Step 1: Move generated binding output**

Change `scripts/generate-bindings.mjs` to emit to `src/types/generated/bindings` and write the generated barrel to `src/types/generated/index.ts`.

- [ ] **Step 2: Add a backend type barrel**

Add `src/types/backend.ts`:

```ts
export type * from './generated';
```

- [ ] **Step 3: Add a typed invoke helper**

Add `src/api/tauri.ts` with a command map for current commands plus the planned product names as the later migration target. The helper normalizes unknown backend errors into `Error` instances for route hooks.

- [ ] **Step 4: Add local HTTP URL helpers**

Add `src/api/http.ts` with `joinServiceUrl(baseUrl, relativePath)` and `composeStripPreviewUrl(baseUrl, stripUrl)`. The helper rejects full `http://`, `https://`, and `file://` strip values because React must only receive relative strip paths.

- [ ] **Step 5: Add URL composition tests**

Add Vitest coverage:

```ts
import { describe, expect, it } from 'vitest';
import { composeStripPreviewUrl, joinServiceUrl } from './http';

describe('stream HTTP URL helpers', () => {
  it('joins a local service base URL and relative route without duplicate slashes', () => {
    expect(joinServiceUrl('http://127.0.0.1:17654/', '/api/stream/summary')).toBe(
      'http://127.0.0.1:17654/api/stream/summary'
    );
  });

  it('composes strip preview URLs from relative strip paths only', () => {
    expect(composeStripPreviewUrl('http://127.0.0.1:17654', '/images/abc/strip')).toBe(
      'http://127.0.0.1:17654/images/abc/strip'
    );
  });

  it('rejects full image URLs at the React boundary', () => {
    expect(() => composeStripPreviewUrl('http://127.0.0.1:17654', 'file:///tmp/full.png')).toThrow(
      'relative strip URL'
    );
  });
});
```

- [ ] **Step 6: Verify API foundation**

Run:

```bash
npm run generate:bindings
npm run test:unit
```

Expected: generated TypeScript appears under `src/types/generated`, and the URL tests pass.

## Task 3: First Stream Session Contract Slice

**Files:**
- Modify: `src-tauri/src/stream/state.rs`
- Modify: `src-tauri/src/stream/server.rs`
- Modify: `src-tauri/src/commands/stream.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Extend stream status with session URLs**

Add `base_url` and `settings_url` to `StreamServiceStatus`, with `overlay_url` remaining explicit. Keep existing fields for active window state.

- [ ] **Step 2: Split ensure and restart behavior**

Implement `ensure_stream_session` as an idempotent wrapper over the existing start path. Implement `restart_stream_session` as stop-then-start and ensure it resets `active_window_offset` to `0`.

- [ ] **Step 3: Keep stop internal**

Register `ensure_stream_session` and `restart_stream_session` in the Tauri handler. Leave `stop_stream_service` callable for tray/app quit until the old frontend surface is removed.

- [ ] **Step 4: Add Rust tests**

Add tests proving `StreamRuntimeState` preserves an active window when a running session is ensured and resets it after restart/start state is rebuilt.

- [ ] **Step 5: Verify stream slice**

Run:

```bash
npm run test:rust
```

Expected: stream state/server tests pass, including existing port-conflict coverage.
