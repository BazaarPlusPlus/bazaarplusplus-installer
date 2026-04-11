# Home Shell And Stream Mode Implementation Plan

> Status: historical implementation record. It reflects a point-in-time plan, not the current source of truth.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the installer into a multi-page desktop utility with a home screen, a dedicated stream mode, and a localhost OBS overlay service that can keep running from the tray.

**Architecture:** Keep the existing install workflow intact by moving it to `/install`, add a lightweight app shell around all routes, and implement the stream service inside the Tauri backend with explicit start/stop/status commands. The frontend remains a Svelte SPA, while the backend owns port selection, SQLite reads, tray behavior, and the OBS-facing HTTP surface.

**Tech Stack:** SvelteKit SPA, TypeScript, Tauri 2, Rust, `rusqlite`, `axum`, `tokio`, `tauri-plugin-clipboard-manager`

---

## File Structure

### Frontend shell and navigation

- Modify: `src/routes/+layout.svelte`
  - Wrap route content in a reusable app shell instead of rendering only a raw `<slot />`
- Create: `src/lib/components/shell/AppShell.svelte`
  - Top-level frame, navigation, mobile-safe page chrome, active-link highlighting
- Create: `src/lib/components/shell/HomeStatusCard.svelte`
  - Small reusable status card for the new home page
- Modify: `src/lib/types.ts`
  - Add the shared `StreamServiceStatus` type before home and stream features consume it
- Create: `src/lib/home/summary.ts`
  - Pure helpers for deriving home-page status cards from installer and stream state
- Create: `src/lib/home/summary.test.ts`
  - Node tests for home-page summary derivation

### Route migration

- Modify: `src/routes/+page.svelte`
  - Replace installer logic with the new home page
- Create: `src/routes/install/+page.svelte`
  - Move the current installer page here with minimal behavior change
- Create: `src/routes/stream/+page.svelte`
  - Stream Mode page
- Modify: `src/lib/i18n.ts`
  - Add shell/home/stream copy

### Stream frontend state

- Create: `src/lib/stream/api.ts`
  - Tauri command wrappers for stream service status/start/stop
- Create: `src/lib/stream/state.ts`
  - Pure helpers for stream-mode UI state and fallback messaging
- Create: `src/lib/stream/state.test.ts`
  - Node tests for stream-mode state derivation
- Create: `src/lib/components/stream/StreamServiceCard.svelte`
  - Start/stop, status, fallback-port message
- Create: `src/lib/components/stream/StreamPreviewCard.svelte`
  - Simplified recent-record preview and preview/open actions

### Tauri stream backend

- Modify: `src-tauri/Cargo.toml`
  - Add `axum`, `tokio`, `rusqlite`, and clipboard plugin dependency
- Modify: `src-tauri/src/lib.rs`
  - Register stream commands, tray plugin, tray/window lifecycle hooks, managed runtime state
- Create: `src-tauri/src/commands/stream.rs`
  - Tauri commands for start/stop/status
- Create: `src-tauri/src/stream/mod.rs`
  - Re-export stream modules
- Create: `src-tauri/src/stream/state.rs`
  - Shared runtime state, close-policy helpers
- Create: `src-tauri/src/stream/server.rs`
  - Port selection, server start/stop, status reporting
- Create: `src-tauri/src/stream/records.rs`
  - SQLite path resolution and read-only queries
- Create: `src-tauri/src/stream/http.rs`
  - `/overlay`, `/api/records/latest`, `/api/records/recent`, `/health`

### Overlay assets

- Create: `src-tauri/resources/stream/overlay.html`
  - OBS-facing page shell
- Create: `src-tauri/resources/stream/overlay.css`
  - Overlay styles
- Create: `src-tauri/resources/stream/overlay.js`
  - Poll latest-record API and render state

## Task 1: Introduce the app shell and home-page state helpers

**Files:**
- Create: `src/lib/components/shell/AppShell.svelte`
- Create: `src/lib/components/shell/HomeStatusCard.svelte`
- Modify: `src/lib/types.ts`
- Create: `src/lib/home/summary.ts`
- Test: `src/lib/home/summary.test.ts`
- Modify: `src/routes/+layout.svelte`
- Modify: `src/lib/i18n.ts`

- [ ] **Step 1: Write the failing home-summary test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import { createHomeSummary } from './summary.ts';

test('createHomeSummary marks stream mode active when service is running', () => {
  const summary = createHomeSummary({
    env: {
      steam_path: 'C:/Steam',
      steam_launch_options_supported: true,
      game_path: 'C:/Games/The Bazaar',
      dotnet_version: '9.0.0',
      dotnet_ok: true,
      bepinex_installed: true,
      bpp_version: '2.3.7',
      bundled_bpp_version: '2.3.7'
    },
    streamStatus: {
      running: true,
      host: '127.0.0.1',
      port: 17654,
      overlay_url: 'http://127.0.0.1:17654/overlay',
      using_fallback_port: false,
      last_error: null
    }
  });

  assert.equal(summary.stream.tone, 'active');
  assert.match(summary.stream.detail, /17654/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test src/lib/home/summary.test.ts`
Expected: FAIL with `Cannot find module './summary.ts'` or `createHomeSummary is not exported`

- [ ] **Step 3: Implement the pure summary helper and the shell components**

```ts
// src/lib/types.ts
export interface StreamServiceStatus {
  running: boolean;
  host: string;
  port: number | null;
  overlay_url: string | null;
  using_fallback_port: boolean;
  last_error: string | null;
}
```

```ts
// src/lib/home/summary.ts
import type { EnvironmentInfo, StreamServiceStatus } from '$lib/types';

export function createHomeSummary(input: {
  env: EnvironmentInfo | null;
  streamStatus: StreamServiceStatus;
}) {
  const installed = Boolean(input.env?.bepinex_installed);
  const version = input.env?.bpp_version ?? input.env?.bundled_bpp_version ?? 'unknown';

  return {
    install: {
      tone: installed ? 'active' : 'idle',
      title: installed ? 'BazaarPlusPlus installed' : 'BazaarPlusPlus not installed',
      detail: installed ? `Version ${version}` : 'Open Install & Repair to continue.'
    },
    stream: {
      tone: input.streamStatus.running ? 'active' : 'idle',
      title: input.streamStatus.running ? 'Stream mode running' : 'Stream mode stopped',
      detail: input.streamStatus.running
        ? `OBS URL: ${input.streamStatus.overlay_url}`
        : 'Start the local service when you are ready to stream.'
    }
  };
}
```

```svelte
<!-- src/lib/components/shell/AppShell.svelte -->
<script lang="ts">
  import { page } from '$app/state';

  export let title: string;
  export let navItems: { href: string; label: string }[];
</script>

<div class="app-shell">
  <aside class="nav">
    {#each navItems as item}
      <a class:active={$page.url.pathname === item.href} href={item.href}>{item.label}</a>
    {/each}
  </aside>

  <section class="content">
    <slot />
  </section>
</div>
```

- [ ] **Step 4: Wire the shell into the root layout and add new message keys**

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import AppShell from '$lib/components/shell/AppShell.svelte';
  import { locale } from '$lib/locale';
  import { formatMessage } from '$lib/i18n';

  const navItems = [
    { href: '/', label: 'Home' },
    { href: '/install', label: 'Install & Repair' },
    { href: '/stream', label: 'Stream Mode' },
    { href: '/changelog', label: 'Changelog' },
    { href: '/about', label: 'About' }
  ];
</script>

<AppShell title="BazaarPlusPlus" {navItems}>
  <slot />
</AppShell>
```

```ts
// src/lib/i18n.ts
export type MessageKey =
  | 'navHome'
  | 'navInstall'
  | 'navStream'
  | 'homeTitle'
  | 'homeIntro'
  | 'homeOpenInstall'
  | 'homeOpenStream'
  | 'streamTitle'
  | 'streamStart'
  | 'streamStop';
```

- [ ] **Step 5: Run the test and Svelte typecheck**

Run: `node --test src/lib/home/summary.test.ts && npm run check`
Expected: PASS for the new summary test and no new Svelte or TypeScript errors

- [ ] **Step 6: Commit the shell foundation**

```bash
git add src/routes/+layout.svelte src/lib/i18n.ts src/lib/types.ts src/lib/components/shell src/lib/home
git commit -m "Add app shell foundation"
```

## Task 2: Move the existing installer flow to `/install` and create the new home page

**Files:**
- Create: `src/routes/install/+page.svelte`
- Modify: `src/routes/+page.svelte`
- Modify: `src/lib/i18n.ts`
- Test: `src/lib/home/summary.test.ts`

- [ ] **Step 1: Extend the failing summary test for install-state wording**

```ts
test('createHomeSummary shows install guidance when BazaarPlusPlus is missing', () => {
  const summary = createHomeSummary({
    env: null,
    streamStatus: {
      running: false,
      host: '127.0.0.1',
      port: null,
      overlay_url: null,
      using_fallback_port: false,
      last_error: null
    }
  });

  assert.equal(summary.install.tone, 'idle');
  assert.match(summary.install.detail, /Install & Repair/);
});
```

- [ ] **Step 2: Run the targeted test before route changes**

Run: `node --test src/lib/home/summary.test.ts`
Expected: FAIL until `createHomeSummary` handles missing installer data exactly as the test expects

- [ ] **Step 3: Move the installer page to `/install` with minimal behavior change**

```bash
mkdir -p src/routes/install
cp src/routes/+page.svelte src/routes/install/+page.svelte
```

```svelte
<!-- src/routes/+page.svelte -->
<script lang="ts">
  import HomeStatusCard from '$lib/components/shell/HomeStatusCard.svelte';
  import { createHomeSummary } from '$lib/home/summary';
  import { detectEnvironment } from '$lib/installer/api';
  import { onMount } from 'svelte';

  let env = null;
  let streamStatus = {
    running: false,
    host: '127.0.0.1',
    port: null,
    overlay_url: null,
    using_fallback_port: false,
    last_error: null
  };

  $: summary = createHomeSummary({ env, streamStatus });

  onMount(async () => {
    env = await detectEnvironment();
  });
</script>
```

- [ ] **Step 4: Replace the old root page UI with mixed status and navigation cards**

```svelte
<main class="home-shell">
  <section class="hero">
    <h1>{t('homeTitle')}</h1>
    <p>{t('homeIntro')}</p>
  </section>

  <section class="status-grid">
    <HomeStatusCard {...summary.install} href="/install" />
    <HomeStatusCard {...summary.stream} href="/stream" />
  </section>

  <section class="action-grid">
    <a href="/install">{t('homeOpenInstall')}</a>
    <a href="/stream">{t('homeOpenStream')}</a>
    <a href="/changelog">Changelog</a>
    <a href="/about">About</a>
  </section>
</main>
```

- [ ] **Step 5: Run route-safe verification**

Run: `node --test src/lib/home/summary.test.ts && npm run check`
Expected: PASS, with the installer still typechecking from its new `/install` route

- [ ] **Step 6: Commit the route split**

```bash
git add src/routes/+page.svelte src/routes/install/+page.svelte src/lib/i18n.ts src/lib/home/summary.test.ts
git commit -m "Move installer flow behind home page"
```

## Task 3: Add stream-mode frontend state and UI

**Files:**
- Create: `src/lib/stream/api.ts`
- Create: `src/lib/stream/state.ts`
- Create: `src/lib/stream/state.test.ts`
- Create: `src/lib/components/stream/StreamServiceCard.svelte`
- Create: `src/lib/components/stream/StreamPreviewCard.svelte`
- Create: `src/routes/stream/+page.svelte`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/i18n.ts`

- [ ] **Step 1: Write the failing stream-state test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import { createStreamPageState } from './state.ts';

test('createStreamPageState surfaces fallback-port guidance', () => {
  const state = createStreamPageState({
    running: true,
    host: '127.0.0.1',
    port: 17658,
    overlay_url: 'http://127.0.0.1:17658/overlay',
    using_fallback_port: true,
    last_error: null
  });

  assert.equal(state.canCopyUrl, true);
  assert.match(state.portMessage, /17658/);
  assert.match(state.portMessage, /fallback/i);
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run: `node --test src/lib/stream/state.test.ts`
Expected: FAIL because `createStreamPageState` does not exist yet

- [ ] **Step 3: Add shared stream types, command wrappers, and page-state helper**

```ts
// src/lib/types.ts
export interface StreamRecordSummary {
  id: string;
  title: string;
  subtitle: string;
  captured_at: string;
}
```

```ts
// src/lib/stream/api.ts
import { invoke } from '@tauri-apps/api/core';
import type { StreamRecordSummary, StreamServiceStatus } from '$lib/types';

export function getStreamServiceStatus() {
  return invoke<StreamServiceStatus>('get_stream_service_status');
}

export function startStreamService() {
  return invoke<StreamServiceStatus>('start_stream_service');
}

export function stopStreamService() {
  return invoke<StreamServiceStatus>('stop_stream_service');
}

export function loadRecentStreamRecords(baseUrl: string) {
  return fetch(`${baseUrl}/api/records/recent`).then((response) =>
    response.json() as Promise<StreamRecordSummary[]>
  );
}
```

```ts
// src/lib/stream/state.ts
import type { StreamServiceStatus } from '$lib/types';

export function createStreamPageState(status: StreamServiceStatus) {
  return {
    canCopyUrl: Boolean(status.running && status.overlay_url),
    canOpenPreview: Boolean(status.running && status.overlay_url),
    portMessage: status.running
      ? status.using_fallback_port
        ? `Using fallback port ${status.port}. Update OBS if you pinned the old address.`
        : `Listening on ${status.host}:${status.port}.`
      : 'Service is stopped.'
  };
}
```

- [ ] **Step 4: Build the `Stream Mode` page and cards around explicit service status**

```svelte
<!-- src/routes/stream/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { getStreamServiceStatus, startStreamService, stopStreamService } from '$lib/stream/api';
  import { createStreamPageState } from '$lib/stream/state';
  import StreamServiceCard from '$lib/components/stream/StreamServiceCard.svelte';
  import StreamPreviewCard from '$lib/components/stream/StreamPreviewCard.svelte';

  let status = {
    running: false,
    host: '127.0.0.1',
    port: null,
    overlay_url: null,
    using_fallback_port: false,
    last_error: null
  };

  $: pageState = createStreamPageState(status);

  onMount(async () => {
    status = await getStreamServiceStatus();
  });
</script>
```

```svelte
<main class="stream-shell">
  <StreamServiceCard {status} {pageState} onStart={startStreamService} onStop={stopStreamService} />
  <StreamPreviewCard baseUrl={status.overlay_url?.replace(/\/overlay$/, '') ?? null} {pageState} />
</main>
```

- [ ] **Step 5: Run the stream-state test and full frontend typecheck**

Run: `node --test src/lib/stream/state.test.ts && npm run check`
Expected: PASS, with `/stream` compiling and no missing type errors

- [ ] **Step 6: Commit the stream-mode frontend**

```bash
git add src/lib/types.ts src/lib/stream src/lib/components/stream src/routes/stream/+page.svelte src/lib/i18n.ts
git commit -m "Add stream mode frontend"
```

## Task 4: Implement the backend stream service status model and port binding

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Create: `src-tauri/src/commands/stream.rs`
- Create: `src-tauri/src/stream/mod.rs`
- Create: `src-tauri/src/stream/state.rs`
- Create: `src-tauri/src/stream/server.rs`

- [ ] **Step 1: Write the failing Rust test for fallback-port selection**

```rust
#[test]
fn binds_fallback_port_when_preferred_port_is_occupied() {
    let occupied = std::net::TcpListener::bind(("127.0.0.1", 17654)).unwrap();
    let chosen = choose_bind_port("127.0.0.1", 17654, 17656).unwrap();

    assert_eq!(chosen, 17655);
    drop(occupied);
}
```

- [ ] **Step 2: Run the targeted Rust test before implementation**

Run: `cargo test binds_fallback_port_when_preferred_port_is_occupied --manifest-path src-tauri/Cargo.toml`
Expected: FAIL because the stream server module and helper do not exist yet

- [ ] **Step 3: Add dependencies and implement runtime state plus binding helpers**

```toml
# src-tauri/Cargo.toml
axum = "0.8"
tokio = { version = "1", features = ["rt-multi-thread", "macros", "sync", "net"] }
rusqlite = { version = "0.32", features = ["bundled"] }
tauri-plugin-clipboard-manager = "2"
```

```rust
// src-tauri/src/stream/server.rs
pub fn choose_bind_port(host: &str, start: u16, end: u16) -> Result<u16, String> {
    for port in start..=end {
        if std::net::TcpListener::bind((host, port)).is_ok() {
            return Ok(port);
        }
    }

    Err(format!("No available localhost port in range {start}-{end}"))
}
```

```rust
// src-tauri/src/stream/state.rs
#[derive(Clone, Debug, serde::Serialize)]
pub struct StreamServiceStatus {
    pub running: bool,
    pub host: String,
    pub port: Option<u16>,
    pub overlay_url: Option<String>,
    pub using_fallback_port: bool,
    pub last_error: Option<String>,
}
```

- [ ] **Step 4: Expose start/stop/status commands and manage state from `lib.rs`**

```rust
// src-tauri/src/commands/stream.rs
#[tauri::command]
pub async fn start_stream_service(
    app: tauri::AppHandle,
    state: tauri::State<'_, StreamRuntimeState>,
) -> Result<StreamServiceStatus, String> {
    crate::stream::server::start(app, state.inner()).await
}

#[tauri::command]
pub fn get_stream_service_status(
    state: tauri::State<'_, StreamRuntimeState>,
) -> StreamServiceStatus {
    state.snapshot()
}
```

```rust
// src-tauri/src/lib.rs
.manage(crate::stream::state::StreamRuntimeState::default())
.plugin(tauri_plugin_clipboard_manager::init())
.invoke_handler(tauri::generate_handler![
    start_stream_service,
    stop_stream_service,
    get_stream_service_status,
])
```

- [ ] **Step 5: Run the targeted Rust test and compile the crate**

Run: `cargo test binds_fallback_port_when_preferred_port_is_occupied --manifest-path src-tauri/Cargo.toml && cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS, with the new stream modules compiling cleanly

- [ ] **Step 6: Commit the backend service core**

```bash
git add src-tauri/Cargo.toml src-tauri/src/lib.rs src-tauri/src/commands/stream.rs src-tauri/src/stream
git commit -m "Add stream service backend core"
```

## Task 5: Add SQLite reads and OBS HTTP routes

**Files:**
- Create: `src-tauri/src/stream/records.rs`
- Create: `src-tauri/src/stream/http.rs`
- Create: `src-tauri/resources/stream/overlay.html`
- Create: `src-tauri/resources/stream/overlay.css`
- Create: `src-tauri/resources/stream/overlay.js`
- Modify: `src-tauri/src/stream/server.rs`
- Modify: `src-tauri/src/stream/state.rs`

- [ ] **Step 1: Write the failing record-mapping test against a temporary SQLite file**

```rust
#[test]
fn latest_record_returns_none_when_database_has_no_rows() {
    let temp = tempfile::NamedTempFile::new().unwrap();
    let conn = rusqlite::Connection::open(temp.path()).unwrap();
    conn.execute(
        "create table records (id text primary key, title text not null, subtitle text not null, captured_at text not null)",
        [],
    )
    .unwrap();

    let latest = load_latest_record(temp.path()).unwrap();
    assert!(latest.is_none());
}

#[test]
fn latest_record_returns_none_when_database_file_is_missing() {
    let temp_dir = tempfile::tempdir().unwrap();
    let missing = temp_dir.path().join("missing-records.sqlite");
    let latest = load_latest_record(&missing).unwrap();

    assert!(latest.is_none());
}
```

- [ ] **Step 2: Run the targeted Rust test before implementing SQLite reads**

Run: `cargo test latest_record_returns_none_when_database_has_no_rows --manifest-path src-tauri/Cargo.toml`
Expected: FAIL because `load_latest_record` does not exist yet

- [ ] **Step 3: Implement read-only record queries and HTTP handlers**

```rust
// src-tauri/src/stream/records.rs
pub fn load_latest_record(database_path: &std::path::Path) -> Result<Option<StreamRecord>, String> {
    if !database_path.exists() {
        return Ok(None);
    }

    let conn = rusqlite::Connection::open(database_path).map_err(|err| err.to_string())?;
    let mut stmt = conn
        .prepare(
            "select id, title, subtitle, captured_at from records order by captured_at desc limit 1",
        )
        .map_err(|err| err.to_string())?;

    stmt.query_row([], |row| {
        Ok(StreamRecord {
            id: row.get(0)?,
            title: row.get(1)?,
            subtitle: row.get(2)?,
            captured_at: row.get(3)?,
        })
    })
    .optional()
    .map_err(|err| err.to_string())
}
```

```rust
// src-tauri/src/stream/http.rs
pub async fn latest_record(
    State(app_state): State<HttpAppState>,
) -> axum::Json<Option<StreamRecord>> {
    axum::Json(app_state.records.load_latest().unwrap_or(None))
}
```

```html
<!-- src-tauri/resources/stream/overlay.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="/assets/overlay.css" />
    <script type="module" src="/assets/overlay.js"></script>
  </head>
  <body>
    <main id="overlay-root" class="overlay empty">
      <p class="eyebrow">BazaarPlusPlus</p>
      <h1>No records yet</h1>
      <p class="detail">Start a match and the overlay will update automatically.</p>
    </main>
  </body>
</html>
```

- [ ] **Step 4: Serve the overlay assets and wire `/overlay` plus JSON endpoints into the running server**

```rust
let router = axum::Router::new()
    .route("/health", axum::routing::get(health))
    .route("/api/records/latest", axum::routing::get(latest_record))
    .route("/api/records/recent", axum::routing::get(recent_records))
    .route("/overlay", axum::routing::get(overlay_page))
    .route("/assets/overlay.css", axum::routing::get(overlay_css))
    .route("/assets/overlay.js", axum::routing::get(overlay_js));
```

- [ ] **Step 5: Run focused tests and the full backend suite**

Run: `cargo test latest_record_returns_none_when_database_has_no_rows --manifest-path src-tauri/Cargo.toml && cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS, with empty-database behavior covered and no backend regressions

- [ ] **Step 6: Commit the overlay-serving layer**

```bash
git add src-tauri/src/stream/records.rs src-tauri/src/stream/http.rs src-tauri/resources/stream src-tauri/src/stream/server.rs src-tauri/src/stream/state.rs
git commit -m "Add OBS overlay routes and record reads"
```

## Task 6: Add tray behavior, window-close policy, and final integration checks

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/stream/state.rs`
- Modify: `src/routes/stream/+page.svelte`
- Modify: `src/lib/components/stream/StreamServiceCard.svelte`
- Modify: `src/lib/i18n.ts`
- Test: `src/lib/stream/state.test.ts`

- [ ] **Step 1: Extend the failing stream-state test for tray-safe close behavior messaging**

```ts
test('createStreamPageState warns that closing the window will hide to tray while running', () => {
  const state = createStreamPageState({
    running: true,
    host: '127.0.0.1',
    port: 17654,
    overlay_url: 'http://127.0.0.1:17654/overlay',
    using_fallback_port: false,
    last_error: null
  });

  assert.match(state.lifecycleMessage, /tray/i);
});
```

- [ ] **Step 2: Run the stream-state test to verify it fails before the integration polish**

Run: `node --test src/lib/stream/state.test.ts`
Expected: FAIL because `lifecycleMessage` is not returned yet

- [ ] **Step 3: Implement tray menu setup and close interception in Tauri**

```rust
// src-tauri/src/lib.rs
.on_window_event(|window, event| {
    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        let state = window.state::<crate::stream::state::StreamRuntimeState>();
        if state.snapshot().running {
            api.prevent_close();
            let _ = window.hide();
        }
    }
})
```

```rust
let tray = tauri::tray::TrayIconBuilder::new()
    .menu(&menu)
    .on_menu_event(|app, event| match event.id.as_ref() {
        "show_window" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        "copy_obs_url" => {
            use tauri_plugin_clipboard_manager::ClipboardExt;

            let state = app.state::<crate::stream::state::StreamRuntimeState>();
            if let Some(url) = state.snapshot().overlay_url {
                let _ = app.clipboard().write_text(url);
            }
        }
        "stop_stream_service" => {
            let state = app.state::<crate::stream::state::StreamRuntimeState>();
            let _ = tauri::async_runtime::spawn(crate::stream::server::stop(state.inner().clone()));
        }
        "quit" => app.exit(0),
        _ => {}
    });
```

- [ ] **Step 4: Surface the close-policy message and copy/open actions in the stream page**

```svelte
<!-- src/lib/components/stream/StreamServiceCard.svelte -->
<p class="detail">{pageState.lifecycleMessage}</p>
<button on:click={copyUrl} disabled={!pageState.canCopyUrl}>Copy OBS URL</button>
<button on:click={openPreview} disabled={!pageState.canOpenPreview}>Open Preview</button>
```

```ts
// src/lib/stream/state.ts
lifecycleMessage: status.running
  ? 'Closing the window will hide BazaarPlusPlus to the system tray while the stream service keeps running.'
  : 'Closing the window will exit BazaarPlusPlus normally.'
```

- [ ] **Step 5: Run final verification for frontend and packaging-sensitive changes**

Run: `node --test src/lib/home/summary.test.ts src/lib/stream/state.test.ts && npm run check && npm run prebuild-check && cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS for the Node tests, Svelte check, prebuild check, and Rust tests

- [ ] **Step 6: Commit the tray integration and final polish**

```bash
git add src-tauri/src/lib.rs src-tauri/src/stream/state.rs src/routes/stream/+page.svelte src/lib/components/stream/StreamServiceCard.svelte src/lib/stream/state.ts src/lib/stream/state.test.ts src/lib/i18n.ts
git commit -m "Add tray-backed stream mode integration"
```

## Self-Review

### Spec coverage

- Home shell and top-level navigation: covered by Tasks 1 and 2
- Install flow moved behind a dedicated route: covered by Task 2
- Stream Mode page with service controls, OBS URL, and preview: covered by Task 3
- Localhost service with runtime-selected port: covered by Task 4
- SQLite-backed overlay routes and empty-data handling: covered by Task 5
- Tray minimize-on-close only while stream service is running: covered by Task 6
- Final verification with `npm run check` and `npm run prebuild-check`: covered by Task 6

### Placeholder scan

- No `TBD`, `TODO`, or deferred implementation markers remain in tasks
- Every task names exact files and explicit commands
- Code steps include concrete snippets instead of abstract guidance

### Type consistency

- Frontend status type uses `StreamServiceStatus` consistently across `src/lib/types.ts`, `src/lib/stream/api.ts`, and `src/lib/stream/state.ts`
- Backend status payload uses matching fields: `running`, `host`, `port`, `overlay_url`, `using_fallback_port`, `last_error`
- Route split consistently uses `/`, `/install`, and `/stream`
