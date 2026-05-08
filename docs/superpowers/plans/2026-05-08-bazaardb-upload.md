# BazaarDB Screenshot Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a BazaarDB upload integration to the installer that lets users connect a BazaarDB account via a personal access token (PAT), upload end-of-run screenshots (manually or automatically), and survive transient failures with a retrying queue.

**Architecture:** PAT lives in the OS keyring (Keychain / Credential Manager) via the `keyring` crate; non-secret prefs (connected account name, auto-upload toggle) live in localStorage; outbound HTTP via `reqwest` with `rustls-tls` + `multipart`; new installer-owned SQLite at `<app_data>/BazaarPlusPlus/installer.db` for the `pending_uploads` queue (the BPP mod DB stays read-only); settings UI as a new `/settings` route mirroring the `/about` pattern; URL scheme handoff via `tauri-plugin-deep-link` + `tauri-plugin-single-instance`.

**Tech Stack:** Rust (Tauri 2, rusqlite 0.32, reqwest 0.12, image 0.25, keyring 3, tokio 1), Svelte 5 + SvelteKit 2, ts-rs 12 for command bindings, Vitest for frontend tests, `cargo test` for backend.

**Endpoints (default; configurable):** Per the spec these paths are TBD with BazaarDB, but the spec proposes them; treat them as defaults that one can change in one place.

- Token validation: `GET {BAZAARDB_BASE_URL}/api/auth/me` → `200 { account_name }` / `401`
- Screenshot upload: `POST {BAZAARDB_BASE_URL}/api/uploads/screenshot` (multipart) → `200 { id }`
- `BAZAARDB_BASE_URL` default: `https://bazaardb.bazaarplusplus.com`. Defined as a single constant on each side (`src-tauri/src/bazaardb/endpoints.rs` and `src/lib/config/endpoints.ts`).

**File structure (new + modified):**

```text
src-tauri/src/
  bazaardb/                      NEW module
    mod.rs                       module wiring
    endpoints.rs                 base URL + path constants
    keyring.rs                   PAT save/load/delete via keyring crate
    client.rs                    reqwest client: validate_token, upload_screenshot
    image_pipeline.rs            decode → resize → JPEG encode with q85/q75/q60 fallback
    payload.rs                   metadata struct + multipart form builder
    queue.rs                     pending_uploads schema + CRUD
    backoff.rs                   pure backoff schedule helper
    worker.rs                    tokio task that drains the queue
    deeplink.rs                  bazaarplusplus://link?... handler (Phase 5 only)
  installer_db/                  NEW module — installer-owned SQLite
    mod.rs                       open + migrate the installer DB
    path.rs                      app_data_dir() + path resolution
  commands/
    bazaardb.rs                  NEW Tauri commands
  stream/records/
    repo.rs                      MODIFIED — add player_name, player_account_id
    mapper.rs                    MODIFIED — surface the new fields in OverlayRecord
  lib.rs                         MODIFIED — register bazaardb commands + plugins
  Cargo.toml                     MODIFIED — add reqwest, keyring, deep-link plugins

src/
  routes/settings/+page.svelte   NEW route
  lib/
    bazaardb/
      account-store.ts           NEW Svelte writable store
      api.ts                     NEW typed wrappers around bridge::call
    config/
      endpoints.ts               MODIFIED — add BAZAARDB_BASE_URL
    bridge/commands.ts           MODIFIED — register new commands in TauriCommandMap
    components/
      stream/                    MODIFIED — add "Upload to BazaarDB" action on records
```

---

## Phase 1: Surface `player_name` and `player_account_id` in stream-records SELECTs

The end-of-run screenshot record in BPP's local SQLite (`run_screenshots`) does not carry `player_name` / `player_account_id`. Those columns live on the `battles` table at `Game/RunLogging/Persistence/Sqlite/RunLogSqliteSchema.cs:91-132`. `run_screenshots.run_id` joins to `battles.run_id`. A run has many battles but identity is stable across them, so a scalar subquery (`LIMIT 1`) is the simplest correct shape.

This phase is independently shippable — it only widens the data surfaced to the existing record library; no UI changes required.

### Task 1.1: Extend `OverlayRecordRow` with `player_name` and `player_account_id`

**Files:**
- Modify: `src-tauri/src/stream/records/repo.rs`

- [ ] **Step 1: Write the failing test**

Append to the existing `#[cfg(test)] mod tests` block in `src-tauri/src/stream/records/repo.rs` (note the helper function `create_run_screenshots_table` exists; you'll add a sibling helper `create_battles_table`):

```rust
fn create_battles_table(conn: &rusqlite::Connection) {
    conn.execute(
        "create table battles (
            battle_id text primary key,
            source text not null,
            run_id text,
            recorded_at_utc text not null,
            combat_kind text not null,
            player_name text,
            player_account_id text
        )",
        [],
    )
    .unwrap();
}

#[test]
fn latest_overlay_record_includes_player_identity_from_battles() {
    let temp = tempfile::NamedTempFile::new().unwrap();
    let conn = rusqlite::Connection::open(temp.path()).unwrap();
    create_run_screenshots_table(&conn);
    create_battles_table(&conn);
    conn.execute(
        "insert into run_screenshots (
            screenshot_id, run_id, capture_source, image_relative_path,
            captured_at_local, captured_at_utc, hero_name
         ) values (
            'snap-1', 'run-1', 'end_of_run_auto', 'final.png',
            '2026-04-10T20:30:05+00:00', '2026-04-10T20:30:05+00:00', 'Mak'
         )",
        [],
    )
    .unwrap();
    conn.execute(
        "insert into battles (
            battle_id, source, run_id, recorded_at_utc, combat_kind,
            player_name, player_account_id
         ) values (
            'b-1', 'LOCAL', 'run-1', '2026-04-10T20:30:00+00:00',
            'PVP', 'Xinyu', 'acct-9'
         )",
        [],
    )
    .unwrap();

    let latest = load_latest_overlay_record(temp.path(), None, 0)
        .unwrap()
        .unwrap();

    assert_eq!(latest.player_name.as_deref(), Some("Xinyu"));
    assert_eq!(latest.player_account_id.as_deref(), Some("acct-9"));
}

#[test]
fn latest_overlay_record_returns_none_player_identity_when_no_battle() {
    let temp = tempfile::NamedTempFile::new().unwrap();
    let conn = rusqlite::Connection::open(temp.path()).unwrap();
    create_run_screenshots_table(&conn);
    create_battles_table(&conn);
    conn.execute(
        "insert into run_screenshots (
            screenshot_id, run_id, capture_source, image_relative_path,
            captured_at_local, captured_at_utc
         ) values (
            'snap-orphan', 'run-orphan', 'end_of_run_auto', 'orphan.png',
            '2026-04-10T20:30:05+00:00', '2026-04-10T20:30:05+00:00'
         )",
        [],
    )
    .unwrap();

    let latest = load_latest_overlay_record(temp.path(), None, 0)
        .unwrap()
        .unwrap();

    assert!(latest.player_name.is_none());
    assert!(latest.player_account_id.is_none());
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:rust -- repo::tests::latest_overlay_record_includes_player_identity_from_battles`
Expected: FAIL — compile error on `latest.player_name` (field does not exist yet).

- [ ] **Step 3: Add the fields to `OverlayRecordRow` and update the row mapper**

In `src-tauri/src/stream/records/repo.rs`:

```rust
#[derive(Clone, Debug)]
pub(crate) struct OverlayRecordRow {
    pub(super) id: String,
    pub(super) hero: String,
    pub(super) game_mode: String,
    pub(super) captured_at: String,
    pub(super) captured_at_utc: String,
    pub(super) image_path: Option<String>,
    pub(super) wins: Option<i64>,
    pub(super) position: Option<i64>,
    pub(super) battle_count: Option<i64>,
    pub(super) rank: Option<String>,
    pub(super) rating: Option<i64>,
    pub(super) player_name: Option<String>,
    pub(super) player_account_id: Option<String>,
}
```

Update `map_overlay_record_row`:

```rust
fn map_overlay_record_row(row: &rusqlite::Row<'_>) -> Result<OverlayRecordRow, String> {
    Ok(OverlayRecordRow {
        id: row.get(0).map_err(|err| err.to_string())?,
        hero: row.get(1).map_err(|err| err.to_string())?,
        game_mode: row.get(2).map_err(|err| err.to_string())?,
        captured_at: row.get(3).map_err(|err| err.to_string())?,
        image_path: row.get(4).map_err(|err| err.to_string())?,
        wins: row.get(5).map_err(|err| err.to_string())?,
        position: row.get(6).map_err(|err| err.to_string())?,
        battle_count: row.get(7).map_err(|err| err.to_string())?,
        rank: row.get(8).map_err(|err| err.to_string())?,
        rating: row.get(9).map_err(|err| err.to_string())?,
        captured_at_utc: row.get(10).map_err(|err| err.to_string())?,
        player_name: row.get(11).map_err(|err| err.to_string())?,
        player_account_id: row.get(12).map_err(|err| err.to_string())?,
    })
}
```

The SQL needs to project the two new columns at indices 11/12. We'll update each SELECT in tasks 1.2-1.4.

- [ ] **Step 4: Update `load_latest_overlay_record` SELECTs**

Inside `load_latest_overlay_record`, update both SQL strings (with-`from` and without-`from` branches) to add two trailing scalar subqueries that join `battles` by `run_id`. Both subqueries MUST share the same `ORDER BY` so they always pick the same battle row — independent subqueries with `IS NOT NULL` filters can return mismatched fields from different rows.

```rust
"
select
  rs.screenshot_id,
  coalesce(nullif(trim(rs.hero_name), ''), 'Unknown') as hero,
  'End of run' as game_mode,
  coalesce(nullif(trim(rs.captured_at_local), ''), rs.captured_at_utc) as captured_at,
  rs.image_relative_path as image_path,
  rs.victories_at_capture as wins,
  rs.player_position,
  rs.day as battle_count,
  nullif(trim(rs.player_rank), '') as player_rank,
  rs.player_rating as player_rating,
  rs.captured_at_utc,
  (select b.player_name from battles b
     where b.run_id = rs.run_id
     order by b.recorded_at_utc asc
     limit 1) as player_name,
  (select b.player_account_id from battles b
     where b.run_id = rs.run_id
     order by b.recorded_at_utc asc
     limit 1) as player_account_id
from run_screenshots rs
where rs.capture_source = 'end_of_run_auto'
  and datetime(rs.captured_at_utc) >= datetime(?1)
order by datetime(rs.captured_at_utc) desc, rs.screenshot_id desc
limit 1 offset ?2
"
```

Apply the same trailing two columns to the without-`from` SELECT in the same function. SQLite errors when a query references a non-existent table, so guard the battles-using SELECTs at runtime: `if table_exists(&conn, "battles")?` chooses the subquery shape; otherwise project `null as player_name, null as player_account_id` so the row mapper still has columns at indices 11/12. Existing test fixtures only seed `run_screenshots`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:rust -- repo::tests::latest_overlay_record_includes_player_identity_from_battles`
Expected: PASS.

Also run: `npm run test:rust -- repo::tests::latest_overlay_record_returns_none_player_identity_when_no_battle`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/stream/records/repo.rs
git commit -m "Surface player identity on the latest overlay record"
```

### Task 1.2: Apply the same SELECT extension to `load_overlay_record_list`

**Files:**
- Modify: `src-tauri/src/stream/records/repo.rs`

- [ ] **Step 1: Write the failing test**

Append to the same `tests` module:

```rust
#[test]
fn overlay_record_list_includes_player_identity() {
    let temp = tempfile::NamedTempFile::new().unwrap();
    let conn = rusqlite::Connection::open(temp.path()).unwrap();
    create_run_screenshots_table(&conn);
    create_battles_table(&conn);
    conn.execute(
        "insert into run_screenshots (
            screenshot_id, run_id, capture_source, image_relative_path,
            captured_at_local, captured_at_utc, hero_name
         ) values
         ('snap-a', 'run-a', 'end_of_run_auto', 'a.png',
          '2026-04-10T20:30:05+00:00', '2026-04-10T20:30:05+00:00', 'Mak'),
         ('snap-b', 'run-b', 'end_of_run_auto', 'b.png',
          '2026-04-10T21:30:05+00:00', '2026-04-10T21:30:05+00:00', 'Vanessa')",
        [],
    )
    .unwrap();
    conn.execute(
        "insert into battles (
            battle_id, source, run_id, recorded_at_utc, combat_kind,
            player_name, player_account_id
         ) values
         ('b-a', 'LOCAL', 'run-a', '2026-04-10T20:00:00+00:00', 'PVP', 'Alice', 'acct-A'),
         ('b-b', 'LOCAL', 'run-b', '2026-04-10T21:00:00+00:00', 'PVP', 'Bob',   'acct-B')",
        [],
    )
    .unwrap();

    let records = load_overlay_record_list(temp.path(), None, None).unwrap();
    assert_eq!(records.len(), 2);
    assert_eq!(records[0].player_account_id.as_deref(), Some("acct-B"));
    assert_eq!(records[1].player_account_id.as_deref(), Some("acct-A"));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:rust -- repo::tests::overlay_record_list_includes_player_identity`
Expected: FAIL — `player_account_id` is `None` (the SQL doesn't project it yet).

- [ ] **Step 3: Update both SELECTs inside `load_overlay_record_list`**

Apply the same two trailing scalar subqueries (`(select ... from battles b where b.run_id = rs.run_id ... limit 1)`) to both branches inside `load_overlay_record_list`. The shape mirrors Task 1.1 Step 4.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:rust -- repo::tests::overlay_record_list_includes_player_identity`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/stream/records/repo.rs
git commit -m "Include player identity in overlay record list"
```

### Task 1.3: Apply the same SELECT extension to `load_overlay_record_by_id`

**Files:**
- Modify: `src-tauri/src/stream/records/repo.rs`

- [ ] **Step 1: Write the failing test**

```rust
#[test]
fn load_overlay_record_by_id_includes_player_identity() {
    let temp = tempfile::NamedTempFile::new().unwrap();
    let conn = rusqlite::Connection::open(temp.path()).unwrap();
    create_run_screenshots_table(&conn);
    create_battles_table(&conn);
    conn.execute(
        "insert into run_screenshots (
            screenshot_id, run_id, capture_source, image_relative_path,
            captured_at_local, captured_at_utc, hero_name
         ) values ('snap-1', 'run-1', 'end_of_run_auto', 'm.png',
                   '2026-04-10T20:30:05+00:00', '2026-04-10T20:30:05+00:00', 'Mak')",
        [],
    )
    .unwrap();
    conn.execute(
        "insert into battles (
            battle_id, source, run_id, recorded_at_utc, combat_kind,
            player_name, player_account_id
         ) values ('b-1', 'LOCAL', 'run-1', '2026-04-10T20:00:00+00:00',
                   'PVP', 'Xinyu', 'acct-9')",
        [],
    )
    .unwrap();

    let record = load_overlay_record_by_id(temp.path(), "snap-1")
        .unwrap()
        .unwrap();

    assert_eq!(record.player_name.as_deref(), Some("Xinyu"));
    assert_eq!(record.player_account_id.as_deref(), Some("acct-9"));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:rust -- repo::tests::load_overlay_record_by_id_includes_player_identity`
Expected: FAIL — fields are `None`.

- [ ] **Step 3: Update the SELECT inside `load_overlay_record_by_id`**

Add the same two trailing scalar subqueries to the SELECT in `load_overlay_record_by_id`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:rust -- repo::tests::load_overlay_record_by_id_includes_player_identity`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/stream/records/repo.rs
git commit -m "Include player identity when loading overlay record by id"
```

### Task 1.4: Surface the new fields on `OverlayRecord` (frontend type) and expose `load_record_by_id`

**Files:**
- Modify: `src-tauri/src/stream/records/repo.rs`
- Modify: `src-tauri/src/stream/records/mapper.rs`
- Modify: `src-tauri/src/stream/records/mod.rs`
- Regenerate: `src/lib/generated/bindings/StreamRecordSummary.ts` (auto)

Phase 3 and Phase 4 both need to load a single `OverlayRecord` by `screenshot_id`. The repository currently exposes only offset-based access; add a by-id method here, alongside the type changes, so later phases don't have to grow the repo's public surface.

Also add `run_id: Option<String>` to `OverlayRecordRow` and `OverlayRecord` — the upload metadata payload (Phase 3) needs it.

- [ ] **Step 1: Add `run_id` to `OverlayRecordRow` and project it from every SELECT**

In `src-tauri/src/stream/records/repo.rs`:

```rust
#[derive(Clone, Debug)]
pub(crate) struct OverlayRecordRow {
    pub(super) id: String,
    pub(super) run_id: Option<String>,
    pub(super) hero: String,
    pub(super) game_mode: String,
    pub(super) captured_at: String,
    pub(super) captured_at_utc: String,
    pub(super) image_path: Option<String>,
    pub(super) wins: Option<i64>,
    pub(super) position: Option<i64>,
    pub(super) battle_count: Option<i64>,
    pub(super) rank: Option<String>,
    pub(super) rating: Option<i64>,
    pub(super) player_name: Option<String>,
    pub(super) player_account_id: Option<String>,
}
```

Update `map_overlay_record_row` to read column index 1 as `run_id` (renumber the rest of the indices accordingly). In every SELECT (the four in Tasks 1.1-1.3), insert `rs.run_id` as the second projected column right after `rs.screenshot_id`. Existing tests that only assert other fields remain green.

- [ ] **Step 2: Add `run_id` and the player fields to `OverlayRecord`**

In `src-tauri/src/stream/records/mapper.rs`:

```rust
#[derive(Clone, Debug, Serialize, ts_rs::TS)]
#[ts(export, rename = "StreamRecordSummary")]
pub struct OverlayRecord {
    pub id: String,
    pub run_id: Option<String>,
    pub title: String,
    pub subtitle: String,
    pub captured_at: String,
    pub captured_at_utc: String,
    pub image_url: Option<String>,
    pub image_path: Option<String>,
    pub wins: Option<i64>,
    pub position: Option<i64>,
    pub battle_count: Option<i64>,
    pub rank: Option<String>,
    pub rating: Option<i64>,
    pub player_name: Option<String>,
    pub player_account_id: Option<String>,
}
```

Extend `to_overlay_record`:

```rust
OverlayRecord {
    id: row.id,
    run_id: row.run_id,
    title: row.hero.clone(),
    subtitle: build_subtitle(&row.game_mode, row.wins, row.battle_count),
    captured_at: row.captured_at,
    captured_at_utc: row.captured_at_utc,
    image_url,
    image_path,
    wins: row.wins,
    position: row.position,
    battle_count: row.battle_count,
    rank: row.rank,
    rating: row.rating,
    player_name: row.player_name,
    player_account_id: row.player_account_id,
}
```

- [ ] **Step 3: Expose `load_record_by_id` on the repository**

In `src-tauri/src/stream/records/mod.rs`, add a public method that mirrors `load_record_at_offset` but takes a `screenshot_id`:

```rust
pub fn load_record_by_id(&self, record_id: &str) -> Result<Option<OverlayRecord>, String> {
    let database_path = self.database_path()?;
    Ok(load_overlay_record_by_id(&database_path, record_id)?
        .map(|row| to_overlay_record(self.game_path.as_deref(), row)))
}
```

- [ ] **Step 4: Regenerate bindings and run all tests for regression**

Run: `npm run generate:bindings && npm run check && npm run test:rust`
Expected: bindings regenerate; `svelte-check` passes; `StreamRecordSummary` now has `run_id?: string | null; player_name?: string | null; player_account_id?: string | null;`. All existing tests stay green; new tests from Tasks 1.1-1.3 stay green.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/stream/records/ src/lib/generated/
git commit -m "Expose run_id, player identity, and a by-id load on the overlay record"
```

---

## Phase 2: BazaarDB account: PAT keyring + token validation + settings UI

This phase introduces the `bazaardb` Rust module, the `keyring` crate for credential storage, the `reqwest` HTTP client, and a new `/settings` SvelteKit route. After this phase the user can connect / disconnect a BazaarDB account; uploads are not yet wired.

### Task 2.1: Add `reqwest`, `keyring`, and frontend endpoint constant

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src/lib/config/endpoints.ts`

- [ ] **Step 1: Edit `src-tauri/Cargo.toml`**

Add inside `[dependencies]`, alphabetically near existing entries:

```toml
keyring = "3"
reqwest = { version = "0.12", default-features = false, features = ["rustls-tls", "multipart", "json"] }
```

`rustls-tls` is chosen over `native-tls` to keep cross-platform builds self-contained — Tauri Windows builds without OpenSSL by default and we don't want to introduce a system-tls dependency for two HTTP calls.

- [ ] **Step 2: Verify the workspace still builds**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: PASS (downloads + compiles new deps; no source changes yet).

- [ ] **Step 3: Edit `src/lib/config/endpoints.ts` to add the BazaarDB base URL**

Open `src/lib/config/endpoints.ts`, locate the existing endpoint exports, and add:

```ts
export const BAZAARDB_BASE_URL = 'https://bazaardb.bazaarplusplus.com';
export const BAZAARDB_TOKEN_PAGE_URL = `${BAZAARDB_BASE_URL}/settings/tokens`;
```

- [ ] **Step 4: Commit**

```bash
git add src-tauri/Cargo.toml src/lib/config/endpoints.ts
git commit -m "Add reqwest, keyring deps and BazaarDB endpoint constants"
```

### Task 2.2: `bazaardb::keyring` — PAT save/load/delete

**Files:**
- Create: `src-tauri/src/bazaardb/mod.rs`
- Create: `src-tauri/src/bazaardb/keyring.rs`
- Create: `src-tauri/src/bazaardb/endpoints.rs`
- Modify: `src-tauri/src/lib.rs` (declare `mod bazaardb;`)

- [ ] **Step 1: Wire up the new module**

Create `src-tauri/src/bazaardb/mod.rs`:

```rust
pub mod endpoints;
pub mod keyring;
```

Create `src-tauri/src/bazaardb/endpoints.rs`:

```rust
pub const BAZAARDB_BASE_URL: &str = "https://bazaardb.bazaarplusplus.com";

pub fn auth_me_url() -> String {
    format!("{BAZAARDB_BASE_URL}/api/auth/me")
}

pub fn upload_screenshot_url() -> String {
    format!("{BAZAARDB_BASE_URL}/api/uploads/screenshot")
}
```

Add `mod bazaardb;` to the top of `src-tauri/src/lib.rs` next to the existing `mod commands;` line.

- [ ] **Step 2: Write the failing test for keyring helpers**

Create `src-tauri/src/bazaardb/keyring.rs` with the test stub first:

```rust
#[cfg(test)]
mod tests {
    use super::{KeyringStore, MemoryKeyringBackend};

    #[test]
    fn save_then_load_returns_the_token() {
        let store = KeyringStore::with_backend(MemoryKeyringBackend::default());
        store.save("pat-abc").unwrap();
        assert_eq!(store.load().unwrap().as_deref(), Some("pat-abc"));
    }

    #[test]
    fn delete_clears_the_token() {
        let store = KeyringStore::with_backend(MemoryKeyringBackend::default());
        store.save("pat-abc").unwrap();
        store.delete().unwrap();
        assert!(store.load().unwrap().is_none());
    }

    #[test]
    fn load_returns_none_when_no_token_is_stored() {
        let store = KeyringStore::with_backend(MemoryKeyringBackend::default());
        assert!(store.load().unwrap().is_none());
    }
}
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:rust -- bazaardb::keyring::tests`
Expected: FAIL — `KeyringStore`, `MemoryKeyringBackend` don't exist.

- [ ] **Step 4: Implement `KeyringStore` + a swappable backend trait**

Add to `src-tauri/src/bazaardb/keyring.rs` above the tests:

```rust
use std::sync::Mutex;

pub trait KeyringBackend: Send + Sync {
    fn set(&self, value: &str) -> Result<(), String>;
    fn get(&self) -> Result<Option<String>, String>;
    fn delete(&self) -> Result<(), String>;
}

pub struct OsKeyringBackend {
    service: &'static str,
    user: &'static str,
}

impl OsKeyringBackend {
    pub fn new() -> Self {
        Self {
            service: "com.bazaarplusplus.installer",
            user: "bazaardb-pat",
        }
    }

    fn entry(&self) -> Result<keyring::Entry, String> {
        keyring::Entry::new(self.service, self.user).map_err(|err| err.to_string())
    }
}

impl KeyringBackend for OsKeyringBackend {
    fn set(&self, value: &str) -> Result<(), String> {
        self.entry()?.set_password(value).map_err(|err| err.to_string())
    }

    fn get(&self) -> Result<Option<String>, String> {
        match self.entry()?.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(err) => Err(err.to_string()),
        }
    }

    fn delete(&self) -> Result<(), String> {
        match self.entry()?.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(err) => Err(err.to_string()),
        }
    }
}

#[derive(Default)]
pub struct MemoryKeyringBackend {
    inner: Mutex<Option<String>>,
}

impl KeyringBackend for MemoryKeyringBackend {
    fn set(&self, value: &str) -> Result<(), String> {
        *self.inner.lock().unwrap() = Some(value.to_string());
        Ok(())
    }

    fn get(&self) -> Result<Option<String>, String> {
        Ok(self.inner.lock().unwrap().clone())
    }

    fn delete(&self) -> Result<(), String> {
        *self.inner.lock().unwrap() = None;
        Ok(())
    }
}

pub struct KeyringStore<B: KeyringBackend = OsKeyringBackend> {
    backend: B,
}

impl KeyringStore<OsKeyringBackend> {
    pub fn os() -> Self {
        Self { backend: OsKeyringBackend::new() }
    }
}

impl<B: KeyringBackend> KeyringStore<B> {
    pub fn with_backend(backend: B) -> Self {
        Self { backend }
    }

    pub fn save(&self, token: &str) -> Result<(), String> {
        self.backend.set(token)
    }

    pub fn load(&self) -> Result<Option<String>, String> {
        self.backend.get()
    }

    pub fn delete(&self) -> Result<(), String> {
        self.backend.delete()
    }
}
```

- [ ] **Step 5: Run the tests**

Run: `npm run test:rust -- bazaardb::keyring::tests`
Expected: PASS — all three tests green.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/bazaardb/ src-tauri/src/lib.rs
git commit -m "Add bazaardb module with keyring-backed PAT store"
```

### Task 2.3: `bazaardb::client` — token validation against `/api/auth/me`

**Files:**
- Create: `src-tauri/src/bazaardb/client.rs`
- Modify: `src-tauri/src/bazaardb/mod.rs`

- [ ] **Step 1: Write the failing test**

Create `src-tauri/src/bazaardb/client.rs` with a test that drives validation behavior. Use `reqwest` against `httpbin`-style endpoints? No — use a tiny in-process axum server (we already have axum) on `127.0.0.1:0` to give a real round-trip. Add this test stub:

```rust
#[cfg(test)]
mod tests {
    use super::{validate_token, ValidateOutcome};
    use axum::{routing::get, Json, Router};
    use serde_json::json;
    use std::net::SocketAddr;
    use tokio::net::TcpListener;

    async fn spawn_mock(handler: Router) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr: SocketAddr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(listener, handler).await.unwrap();
        });
        format!("http://{}", addr)
    }

    #[tokio::test]
    async fn validate_token_returns_account_name_on_200() {
        let app = Router::new().route("/api/auth/me", get(|| async {
            Json(json!({ "account_name": "Xinyu" }))
        }));
        let base = spawn_mock(app).await;

        let result = validate_token(&base, "pat-abc").await.unwrap();
        match result {
            ValidateOutcome::Ok { account_name } => assert_eq!(account_name, "Xinyu"),
            other => panic!("expected Ok, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn validate_token_returns_unauthorized_on_401() {
        let app = Router::new().route("/api/auth/me", get(|| async {
            (axum::http::StatusCode::UNAUTHORIZED, Json(json!({"error":"bad"})))
        }));
        let base = spawn_mock(app).await;

        let result = validate_token(&base, "pat-bad").await.unwrap();
        assert!(matches!(result, ValidateOutcome::Unauthorized));
    }
}
```

- [ ] **Step 2: Run the test**

Run: `npm run test:rust -- bazaardb::client::tests`
Expected: FAIL — `validate_token` does not exist.

- [ ] **Step 3: Implement `validate_token`**

Add to `src-tauri/src/bazaardb/client.rs` above the tests:

```rust
use reqwest::{Client, StatusCode};
use serde::Deserialize;

#[derive(Debug)]
pub enum ValidateOutcome {
    Ok { account_name: String },
    Unauthorized,
}

#[derive(Deserialize)]
struct AuthMeResponse {
    account_name: String,
}

pub async fn validate_token(base_url: &str, pat: &str) -> Result<ValidateOutcome, String> {
    let client = Client::builder()
        .user_agent(concat!("bppinstaller/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|err| err.to_string())?;

    let response = client
        .get(format!("{base_url}/api/auth/me"))
        .bearer_auth(pat)
        .send()
        .await
        .map_err(|err| err.to_string())?;

    match response.status() {
        StatusCode::OK => {
            let parsed: AuthMeResponse =
                response.json().await.map_err(|err| err.to_string())?;
            Ok(ValidateOutcome::Ok { account_name: parsed.account_name })
        }
        StatusCode::UNAUTHORIZED => Ok(ValidateOutcome::Unauthorized),
        other => Err(format!("unexpected status {other}")),
    }
}
```

Add `pub mod client;` to `src-tauri/src/bazaardb/mod.rs`.

- [ ] **Step 4: Run the test**

Run: `npm run test:rust -- bazaardb::client::tests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/bazaardb/
git commit -m "Add token validation against /api/auth/me"
```

### Task 2.4: Tauri commands — `connect_bazaardb`, `disconnect_bazaardb`, `get_bazaardb_status`

**Files:**
- Create: `src-tauri/src/commands/bazaardb.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/lib/bridge/commands.ts`

- [ ] **Step 1: Define the command surface**

Create `src-tauri/src/commands/bazaardb.rs`:

```rust
use serde::{Deserialize, Serialize};

use crate::bazaardb::{
    client::{validate_token, ValidateOutcome},
    endpoints::BAZAARDB_BASE_URL,
    keyring::KeyringStore,
};

#[derive(Debug, Clone, Serialize, ts_rs::TS)]
#[ts(export)]
pub struct BazaardbStatus {
    pub connected: bool,
    pub account_name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ConnectBazaardbRequest {
    pub token: String,
}

#[tauri::command]
pub async fn connect_bazaardb(
    request: ConnectBazaardbRequest,
) -> Result<BazaardbStatus, String> {
    let outcome = validate_token(BAZAARDB_BASE_URL, &request.token).await?;
    match outcome {
        ValidateOutcome::Ok { account_name } => {
            KeyringStore::os().save(&request.token)?;
            Ok(BazaardbStatus { connected: true, account_name: Some(account_name) })
        }
        ValidateOutcome::Unauthorized => Err("unauthorized".to_string()),
    }
}

#[tauri::command]
pub fn disconnect_bazaardb() -> Result<(), String> {
    KeyringStore::os().delete()
}

#[tauri::command]
pub async fn get_bazaardb_status() -> Result<BazaardbStatus, String> {
    let store = KeyringStore::os();
    let Some(pat) = store.load()? else {
        return Ok(BazaardbStatus { connected: false, account_name: None });
    };

    match validate_token(BAZAARDB_BASE_URL, &pat).await? {
        ValidateOutcome::Ok { account_name } => {
            Ok(BazaardbStatus { connected: true, account_name: Some(account_name) })
        }
        ValidateOutcome::Unauthorized => {
            store.delete().ok();
            Ok(BazaardbStatus { connected: false, account_name: None })
        }
    }
}
```

- [ ] **Step 2: Register in `src-tauri/src/commands/mod.rs`**

Add `pub mod bazaardb;` next to other module declarations.

- [ ] **Step 3: Register in `src-tauri/src/lib.rs`**

In the `use commands::{...};` block add:

```rust
bazaardb::{connect_bazaardb, disconnect_bazaardb, get_bazaardb_status},
```

In `tauri::generate_handler![...]` add the three new names alongside existing entries.

- [ ] **Step 4: Add typed wrappers to `src/lib/bridge/commands.ts`**

Inside `TauriCommandMap`, add three entries (alphabetical with existing keys is fine):

```ts
connect_bazaardb: { args: { request: { token: string } }; returns: BazaardbStatus };
disconnect_bazaardb: { args: void; returns: void };
get_bazaardb_status: { args: void; returns: BazaardbStatus };
```

Import `BazaardbStatus` from `$lib/generated/commands`.

- [ ] **Step 5: Generate bindings and type-check**

Run: `npm run generate:bindings && npm run check`
Expected: PASS (`BazaardbStatus.ts` generated; svelte-check green).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/ src/lib/bridge/commands.ts src/lib/generated/
git commit -m "Add Tauri commands to connect, disconnect, and inspect BazaarDB account"
```

### Task 2.5: Frontend `account-store` + typed API wrapper

**Files:**
- Create: `src/lib/bazaardb/api.ts`
- Create: `src/lib/bazaardb/account-store.ts`
- Create: `src/lib/bazaardb/account-store.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/bazaardb/account-store.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { createAccountStore } from './account-store';

describe('createAccountStore', () => {
  it('starts disconnected', () => {
    const store = createAccountStore({
      api: {
        getStatus: vi.fn().mockResolvedValue({ connected: false, account_name: null }),
        connect: vi.fn(),
        disconnect: vi.fn(),
      },
    });
    expect(get(store).connected).toBe(false);
    expect(get(store).accountName).toBeNull();
  });

  it('reflects connected state after refresh', async () => {
    const store = createAccountStore({
      api: {
        getStatus: vi.fn().mockResolvedValue({ connected: true, account_name: 'Xinyu' }),
        connect: vi.fn(),
        disconnect: vi.fn(),
      },
    });
    await store.refresh();
    expect(get(store).connected).toBe(true);
    expect(get(store).accountName).toBe('Xinyu');
  });

  it('connect persists account name on success', async () => {
    const connect = vi
      .fn()
      .mockResolvedValue({ connected: true, account_name: 'Xinyu' });
    const store = createAccountStore({
      api: {
        getStatus: vi.fn().mockResolvedValue({ connected: false, account_name: null }),
        connect,
        disconnect: vi.fn(),
      },
    });
    await store.connect('pat-abc');
    expect(connect).toHaveBeenCalledWith('pat-abc');
    expect(get(store).accountName).toBe('Xinyu');
  });

  it('disconnect clears local state', async () => {
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const store = createAccountStore({
      api: {
        getStatus: vi.fn().mockResolvedValue({ connected: true, account_name: 'Xinyu' }),
        connect: vi.fn(),
        disconnect,
      },
    });
    await store.refresh();
    await store.disconnect();
    expect(disconnect).toHaveBeenCalled();
    expect(get(store).connected).toBe(false);
    expect(get(store).accountName).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npm run test:unit -- account-store`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `api.ts` and `account-store.ts`**

`src/lib/bazaardb/api.ts`:

```ts
import { call } from '$lib/bridge/commands';
import type { BazaardbStatus } from '$lib/generated/commands';

export interface BazaardbApi {
  getStatus(): Promise<BazaardbStatus>;
  connect(token: string): Promise<BazaardbStatus>;
  disconnect(): Promise<void>;
}

export const tauriBazaardbApi: BazaardbApi = {
  getStatus: () => call('get_bazaardb_status'),
  connect: (token) => call('connect_bazaardb', { request: { token } }),
  disconnect: () => call('disconnect_bazaardb'),
};
```

`src/lib/bazaardb/account-store.ts`:

```ts
import { writable } from 'svelte/store';
import type { BazaardbApi } from './api';
import { tauriBazaardbApi } from './api';

export interface AccountState {
  connected: boolean;
  accountName: string | null;
}

const initial: AccountState = { connected: false, accountName: null };

export function createAccountStore({ api = tauriBazaardbApi }: { api?: BazaardbApi } = {}) {
  const { subscribe, set } = writable<AccountState>(initial);

  function apply(status: { connected: boolean; account_name: string | null }) {
    set({ connected: status.connected, accountName: status.account_name ?? null });
  }

  async function refresh() {
    apply(await api.getStatus());
  }

  async function connect(token: string) {
    apply(await api.connect(token));
  }

  async function disconnect() {
    await api.disconnect();
    set(initial);
  }

  return { subscribe, refresh, connect, disconnect };
}

export const accountStore = createAccountStore();
```

- [ ] **Step 4: Run the test**

Run: `npm run test:unit -- account-store`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bazaardb/
git commit -m "Add BazaarDB account store and Tauri-backed API wrapper"
```

### Task 2.6: New `/settings` route with connect / disconnect UI

**Files:**
- Create: `src/routes/settings/+page.svelte`
- Modify: `src/lib/components/AppNav.svelte` (or whichever file holds the top navigation)

- [ ] **Step 1: Find the existing nav and add a "Settings" link**

Search the codebase for the navigation component:

```bash
grep -nr "/about" src/lib/components src/routes | head
```

Add a Settings link with the same styling as the About link, pointing to `/settings`.

- [ ] **Step 2: Implement the page**

Create `src/routes/settings/+page.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { open } from '@tauri-apps/plugin-opener';
  import { accountStore } from '$lib/bazaardb/account-store';
  import { BAZAARDB_TOKEN_PAGE_URL } from '$lib/config/endpoints';

  let token = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);

  onMount(() => {
    accountStore.refresh().catch((err) => (error = String(err)));
  });

  async function connect() {
    if (!token.trim()) {
      error = 'Paste the personal access token first.';
      return;
    }
    busy = true;
    error = null;
    try {
      await accountStore.connect(token.trim());
      token = '';
    } catch (err) {
      error = String(err);
    } finally {
      busy = false;
    }
  }

  async function disconnect() {
    busy = true;
    try {
      await accountStore.disconnect();
    } finally {
      busy = false;
    }
  }
</script>

<section>
  <h1>BazaarDB</h1>

  {#if $accountStore.connected}
    <p>Connected as <strong>{$accountStore.accountName}</strong>.</p>
    <button type="button" onclick={disconnect} disabled={busy}>Disconnect</button>
  {:else}
    <p>
      Generate a personal access token at
      <a href="#" onclick={(e) => { e.preventDefault(); open(BAZAARDB_TOKEN_PAGE_URL); }}>
        {BAZAARDB_TOKEN_PAGE_URL}
      </a>, then paste it below.
    </p>
    <input
      type="password"
      bind:value={token}
      placeholder="Paste token here"
      autocomplete="off"
    />
    <button type="button" onclick={connect} disabled={busy}>Connect</button>
  {/if}

  {#if error}
    <p role="alert">{error}</p>
  {/if}
</section>
```

- [ ] **Step 3: Type-check**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 4: Manual smoke test (cannot be automated; UI behavior)**

Run: `npm run dev` then click into Settings. Confirm:
- Loading the page calls `get_bazaardb_status` (no token → "Disconnected" UI)
- Pasting an invalid token shows "unauthorized" in `error`
- Pasting a valid token shows the account name and a Disconnect button
- Disconnect returns the UI to the disconnected state

If the BazaarDB endpoint is not yet live, point `BAZAARDB_BASE_URL` at a temporary mock (e.g., a local axum server) for the smoke test, then revert.

- [ ] **Step 5: Commit**

```bash
git add src/routes/settings/ src/lib/components/
git commit -m "Add a settings route with BazaarDB connect/disconnect UI"
```

---

## Phase 3: Image preprocessing + manual upload

This phase implements the JPEG pipeline (q85 → q75 → q60 fallback under 2 MB), the multipart payload builder, the upload HTTP call, and a Tauri command + UI button for one-click manual uploads.

### Task 3.1: `bazaardb::image_pipeline` — decode → resize → JPEG with quality fallback

**Files:**
- Create: `src-tauri/src/bazaardb/image_pipeline.rs`
- Modify: `src-tauri/src/bazaardb/mod.rs`

- [ ] **Step 1: Write the failing test**

Create `src-tauri/src/bazaardb/image_pipeline.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::{encode_for_upload, EncodeOutput};
    use image::{ImageBuffer, ImageFormat, Rgb};
    use std::io::Cursor;

    fn make_png(width: u32, height: u32) -> Vec<u8> {
        let buffer: ImageBuffer<Rgb<u8>, _> =
            ImageBuffer::from_pixel(width, height, Rgb([200u8, 100, 50]));
        let mut out = Cursor::new(Vec::new());
        buffer
            .write_to(&mut out, ImageFormat::Png)
            .unwrap();
        out.into_inner()
    }

    #[test]
    fn encode_downscales_to_max_longest_edge_1920() {
        let png = make_png(3840, 2160);
        let EncodeOutput { bytes, width, height, quality } =
            encode_for_upload(&png).unwrap();
        assert_eq!(width, 1920);
        assert_eq!(height, 1080);
        assert!(bytes.len() < 2 * 1024 * 1024);
        assert_eq!(quality, 85);
    }

    #[test]
    fn encode_does_not_upscale_smaller_than_1920() {
        let png = make_png(800, 600);
        let EncodeOutput { width, height, .. } = encode_for_upload(&png).unwrap();
        assert_eq!(width, 800);
        assert_eq!(height, 600);
    }

    #[test]
    fn encode_preserves_aspect_ratio() {
        let png = make_png(2400, 800);
        let EncodeOutput { width, height, .. } = encode_for_upload(&png).unwrap();
        assert_eq!(width, 1920);
        assert_eq!(height, 640);
    }
}
```

- [ ] **Step 2: Run the test**

Run: `npm run test:rust -- bazaardb::image_pipeline::tests`
Expected: FAIL — module empty.

- [ ] **Step 3: Implement `encode_for_upload`**

Add to `src-tauri/src/bazaardb/image_pipeline.rs` above the tests:

```rust
use image::{codecs::jpeg::JpegEncoder, imageops::FilterType, DynamicImage};
use std::io::Cursor;

const MAX_EDGE: u32 = 1920;
const SOFT_CAP_BYTES: usize = 2 * 1024 * 1024;
const QUALITY_LADDER: &[u8] = &[85, 75, 60];

#[derive(Debug)]
pub struct EncodeOutput {
    pub bytes: Vec<u8>,
    pub width: u32,
    pub height: u32,
    pub quality: u8,
}

pub fn encode_for_upload(input: &[u8]) -> Result<EncodeOutput, String> {
    let img = image::load_from_memory(input).map_err(|err| err.to_string())?;
    let resized = downscale_if_needed(img);
    let (width, height) = (resized.width(), resized.height());

    let rgb = DynamicImage::ImageRgb8(resized.into_rgb8());

    for &quality in QUALITY_LADDER {
        let bytes = encode_jpeg(&rgb, quality)?;
        if bytes.len() <= SOFT_CAP_BYTES {
            return Ok(EncodeOutput { bytes, width, height, quality });
        }
    }

    Err(format!(
        "encoded image still exceeds {} bytes at quality {}",
        SOFT_CAP_BYTES,
        QUALITY_LADDER.last().copied().unwrap_or(0)
    ))
}

fn downscale_if_needed(img: DynamicImage) -> DynamicImage {
    let (w, h) = (img.width(), img.height());
    if w <= MAX_EDGE && h <= MAX_EDGE {
        return img;
    }
    img.resize(MAX_EDGE, MAX_EDGE, FilterType::Lanczos3)
}

fn encode_jpeg(img: &DynamicImage, quality: u8) -> Result<Vec<u8>, String> {
    let mut buf = Cursor::new(Vec::new());
    let encoder = JpegEncoder::new_with_quality(&mut buf, quality);
    img.write_with_encoder(encoder).map_err(|err| err.to_string())?;
    Ok(buf.into_inner())
}
```

Add `pub mod image_pipeline;` to `src-tauri/src/bazaardb/mod.rs`.

- [ ] **Step 4: Run the tests**

Run: `npm run test:rust -- bazaardb::image_pipeline::tests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/bazaardb/
git commit -m "Add image preprocessing pipeline with JPEG quality fallback"
```

### Task 3.2: `bazaardb::payload` — metadata struct + multipart form builder

**Files:**
- Create: `src-tauri/src/bazaardb/payload.rs`
- Modify: `src-tauri/src/bazaardb/mod.rs`

- [ ] **Step 1: Write the failing test**

Create `src-tauri/src/bazaardb/payload.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::{ScreenshotMetadata, SCHEMA_VERSION};

    #[test]
    fn metadata_serializes_with_stable_keys() {
        let metadata = ScreenshotMetadata {
            screenshot_id: "snap-1".into(),
            run_id: Some("run-1".into()),
            hero_name: Some("Mak".into()),
            final_days: Some(14),
            final_victories: Some(10),
            player_name: Some("Xinyu".into()),
            player_account_id: "acct-9".into(),
            player_rank: Some("Diamond".into()),
            player_rating: Some(1942),
            player_position: Some(1),
            captured_at_utc: "2026-04-10T20:30:05+00:00".into(),
            installer_version: "3.3.0".into(),
            auto_uploaded: false,
            image_format: "jpeg".into(),
        };

        let json = serde_json::to_value(&metadata).unwrap();
        assert_eq!(json["schema_version"], SCHEMA_VERSION);
        assert_eq!(json["screenshot_id"], "snap-1");
        assert_eq!(json["installer_version"], "3.3.0");
        assert_eq!(json["auto_uploaded"], false);
        assert_eq!(json["image_format"], "jpeg");
        assert_eq!(json["player_account_id"], "acct-9");
    }
}
```

- [ ] **Step 2: Run the test**

Run: `npm run test:rust -- bazaardb::payload::tests`
Expected: FAIL — `ScreenshotMetadata` missing.

- [ ] **Step 3: Implement the metadata struct**

Add to `src-tauri/src/bazaardb/payload.rs` above the tests:

```rust
use serde::Serialize;

pub const SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize)]
pub struct ScreenshotMetadata {
    pub schema_version: u32,
    pub installer_version: String,
    pub auto_uploaded: bool,
    pub image_format: String,
    pub screenshot_id: String,
    pub run_id: Option<String>,
    pub hero_name: Option<String>,
    pub final_days: Option<i64>,
    pub final_victories: Option<i64>,
    pub player_name: Option<String>,
    pub player_account_id: String,
    pub player_rank: Option<String>,
    pub player_rating: Option<i64>,
    pub player_position: Option<i64>,
    pub captured_at_utc: String,
}

impl Default for ScreenshotMetadata {
    fn default() -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            installer_version: env!("CARGO_PKG_VERSION").to_string(),
            auto_uploaded: false,
            image_format: "jpeg".into(),
            screenshot_id: String::new(),
            run_id: None,
            hero_name: None,
            final_days: None,
            final_victories: None,
            player_name: None,
            player_account_id: String::new(),
            player_rank: None,
            player_rating: None,
            player_position: None,
            captured_at_utc: String::new(),
        }
    }
}
```

Add `pub mod payload;` to `src-tauri/src/bazaardb/mod.rs`.

- [ ] **Step 4: Run the test**

Run: `npm run test:rust -- bazaardb::payload::tests`
Expected: PASS — `schema_version: 1`, all other fields present.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/bazaardb/
git commit -m "Add upload metadata struct with stable schema_version"
```

### Task 3.3: `bazaardb::client::upload_screenshot` — multipart POST

**Files:**
- Modify: `src-tauri/src/bazaardb/client.rs`

- [ ] **Step 1: Write the failing test**

Append to `src-tauri/src/bazaardb/client.rs` test module:

```rust
use crate::bazaardb::payload::ScreenshotMetadata;
use axum::extract::Multipart;
use axum::routing::post;

#[tokio::test]
async fn upload_screenshot_returns_id_on_200() {
    let app = Router::new().route(
        "/api/uploads/screenshot",
        post(|mut multipart: Multipart| async move {
            let mut saw_image = false;
            let mut saw_metadata = false;
            while let Some(field) = multipart.next_field().await.unwrap() {
                match field.name() {
                    Some("image") => { let _ = field.bytes().await.unwrap(); saw_image = true; }
                    Some("metadata") => { let _ = field.text().await.unwrap(); saw_metadata = true; }
                    _ => {}
                }
            }
            assert!(saw_image && saw_metadata);
            Json(json!({"id": "remote-id-1"}))
        }),
    );
    let base = spawn_mock(app).await;

    let metadata = ScreenshotMetadata {
        screenshot_id: "snap-1".into(),
        player_account_id: "acct-9".into(),
        captured_at_utc: "2026-04-10T20:30:05+00:00".into(),
        ..Default::default()
    };
    let bytes = vec![0u8; 1024];

    let id = super::upload_screenshot(&base, "pat-abc", &metadata, &bytes)
        .await
        .unwrap();
    assert_eq!(id, "remote-id-1");
}
```

- [ ] **Step 2: Run the test**

Run: `npm run test:rust -- bazaardb::client::tests::upload_screenshot_returns_id_on_200`
Expected: FAIL — `upload_screenshot` does not exist.

- [ ] **Step 3: Implement `upload_screenshot`**

Add to `src-tauri/src/bazaardb/client.rs`:

```rust
use crate::bazaardb::payload::ScreenshotMetadata;
use reqwest::multipart;

#[derive(Deserialize)]
struct UploadResponse {
    id: String,
}

pub async fn upload_screenshot(
    base_url: &str,
    pat: &str,
    metadata: &ScreenshotMetadata,
    image_bytes: &[u8],
) -> Result<String, String> {
    let metadata_json = serde_json::to_string(metadata).map_err(|err| err.to_string())?;
    let image_part = multipart::Part::bytes(image_bytes.to_vec())
        .file_name("screenshot.jpg")
        .mime_str("image/jpeg")
        .map_err(|err| err.to_string())?;
    let form = multipart::Form::new()
        .text("metadata", metadata_json)
        .part("image", image_part);

    let client = Client::builder()
        .user_agent(concat!("bppinstaller/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|err| err.to_string())?;

    let response = client
        .post(format!("{base_url}/api/uploads/screenshot"))
        .bearer_auth(pat)
        .multipart(form)
        .send()
        .await
        .map_err(|err| err.to_string())?;

    let status = response.status();
    if status.is_success() {
        let parsed: UploadResponse = response.json().await.map_err(|err| err.to_string())?;
        Ok(parsed.id)
    } else if status == StatusCode::TOO_MANY_REQUESTS {
        let retry_after = response
            .headers()
            .get(reqwest::header::RETRY_AFTER)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());
        Err(format!("rate_limited:{}", retry_after.unwrap_or_default()))
    } else if status.is_client_error() {
        Err(format!("client_error:{}", status.as_u16()))
    } else {
        Err(format!("server_error:{}", status.as_u16()))
    }
}
```

The error tag prefix (`client_error:`, `server_error:`, `rate_limited:`) is the contract for the retry worker to decide what to do; the worker matches on these prefixes (Phase 4).

- [ ] **Step 4: Run the tests**

Run: `npm run test:rust -- bazaardb::client::tests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/bazaardb/client.rs
git commit -m "Add multipart upload for BazaarDB screenshots"
```

### Task 3.4: Tauri command `upload_screenshot_to_bazaardb` (manual mode)

**Files:**
- Modify: `src-tauri/src/commands/bazaardb.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/lib/bridge/commands.ts`

- [ ] **Step 1: Add the command**

Append to `src-tauri/src/commands/bazaardb.rs`:

```rust
use std::path::PathBuf;

use serde::Serialize;
use tauri::State;

use crate::bazaardb::{
    client::upload_screenshot, endpoints::BAZAARDB_BASE_URL, image_pipeline::encode_for_upload,
    payload::ScreenshotMetadata,
};
use crate::commands::startup::InstallerContextState;
use crate::stream::records::OverlayRecordRepository;

#[derive(Debug, Serialize, ts_rs::TS)]
#[ts(export)]
pub struct UploadResult {
    pub remote_id: String,
}

#[derive(Debug, serde::Deserialize)]
pub struct UploadScreenshotRequest {
    pub screenshot_id: String,
}

#[tauri::command]
pub async fn upload_screenshot_to_bazaardb(
    request: UploadScreenshotRequest,
    context: State<'_, InstallerContextState>,
) -> Result<UploadResult, String> {
    let pat = KeyringStore::os()
        .load()?
        .ok_or_else(|| "not_connected".to_string())?;

    let game_path = context.game_path();
    let repo = OverlayRecordRepository::new(game_path.map(PathBuf::from));

    let record = repo
        .load_record_by_id(&request.screenshot_id)?
        .ok_or_else(|| "record_not_found".to_string())?;

    let player_account_id = record
        .player_account_id
        .clone()
        .ok_or_else(|| "missing_player_account_id".to_string())?;

    let (_image_path, raw_bytes) = repo
        .load_image(&request.screenshot_id)?
        .ok_or_else(|| "image_missing".to_string())?;
    let encoded = encode_for_upload(&raw_bytes)?;

    let metadata = ScreenshotMetadata {
        screenshot_id: request.screenshot_id.clone(),
        run_id: record.run_id.clone(),
        hero_name: Some(record.title.clone()),
        final_days: record.battle_count,
        final_victories: record.wins,
        player_name: record.player_name.clone(),
        player_account_id,
        player_rank: record.rank.clone(),
        player_rating: record.rating,
        player_position: record.position,
        captured_at_utc: record.captured_at_utc.clone(),
        auto_uploaded: false,
        ..Default::default()
    };

    let remote_id = upload_screenshot(BAZAARDB_BASE_URL, &pat, &metadata, &encoded.bytes).await?;
    Ok(UploadResult { remote_id })
}
```

`record.run_id` and `repo.load_record_by_id` come from Task 1.4 — confirm those changes are merged before this task starts.

- [ ] **Step 2: Add `InstallerContextState::game_path()` if missing**

Search `src-tauri/src/commands/startup.rs` for an accessor that returns the current game path. If absent, add:

```rust
impl InstallerContextState {
    pub fn game_path(&self) -> Option<PathBuf> {
        self.inner.lock().ok().and_then(|guard| guard.game_path.clone())
    }
}
```

(adjust to match the actual field shape inside `InstallerContextState`).

- [ ] **Step 3: Register the command**

Add `upload_screenshot_to_bazaardb` to `tauri::generate_handler![...]` in `src-tauri/src/lib.rs` and to `TauriCommandMap` in `src/lib/bridge/commands.ts`:

```ts
upload_screenshot_to_bazaardb: {
  args: { request: { screenshot_id: string } };
  returns: UploadResult;
};
```

- [ ] **Step 4: Type-check + run all tests**

Run: `npm run generate:bindings && npm run check && npm run test:rust`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/ src/lib/bridge/commands.ts src/lib/generated/
git commit -m "Add manual screenshot upload command"
```

### Task 3.5: Frontend "Upload to BazaarDB" action on the record library

**Files:**
- Modify: whichever component renders the stream records list (find via `grep -nr "list_stream_overlay_records" src/`)
- Create: `src/lib/bazaardb/upload-actions.ts`

- [ ] **Step 1: Locate the list component**

```bash
grep -nr "list_stream_overlay_records" src/
```

Expected hit: a Svelte component that maps `StreamRecordSummary[]` to rows. Note its path; the next step modifies it.

- [ ] **Step 2: Add the upload helper**

Create `src/lib/bazaardb/upload-actions.ts`:

```ts
import { call } from '$lib/bridge/commands';

export type UploadStatus =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'success'; remoteId: string }
  | { kind: 'error'; message: string };

export async function uploadScreenshot(screenshotId: string): Promise<UploadStatus> {
  try {
    const result = await call('upload_screenshot_to_bazaardb', {
      request: { screenshot_id: screenshotId },
    });
    return { kind: 'success', remoteId: result.remote_id };
  } catch (err) {
    return { kind: 'error', message: String(err) };
  }
}
```

- [ ] **Step 3: Add the button to each record row**

In the list component, add a per-row button that:

- Is disabled when `record.player_account_id == null` (tooltip: "Player account ID is missing for this run; cannot upload.")
- Shows an inline status: spinner (pending), green check (success), red text with reason (error)
- On click, calls `uploadScreenshot(record.id)` and updates the per-row status

Track per-row state in a `Map<string, UploadStatus>` Svelte rune state; do not put it in a global store.

- [ ] **Step 4: Type-check**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 5: Manual smoke test**

Run: `npm run dev`. Open the record library, click "Upload to BazaarDB" on a record:
- With no PAT connected: expect `not_connected` error message.
- With PAT connected, but record has `player_account_id == null`: expect button disabled with tooltip.
- With PAT connected and `player_account_id` present: expect pending → success with remote id (against a mock server if BazaarDB is not yet live).

- [ ] **Step 6: Commit**

```bash
git add src/lib/bazaardb/ src/lib/components/
git commit -m "Add manual upload action to the record library"
```

---

## Phase 4: `pending_uploads` queue + retry worker + auto mode

This phase adds the installer-owned SQLite, the queue table, the retry worker, and the auto-upload toggle. After this phase a failed upload is durable across restarts and auto-mode submits new end-of-run screenshots without user intervention.

### Task 4.1: Installer-owned SQLite — open + bootstrap

**Files:**
- Create: `src-tauri/src/installer_db/mod.rs`
- Create: `src-tauri/src/installer_db/path.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write the failing test for the bootstrap function**

Create `src-tauri/src/installer_db/mod.rs`:

```rust
pub mod path;

use rusqlite::Connection;
use std::path::Path;

pub fn open_and_bootstrap(database_path: &Path) -> Result<Connection, String> {
    if let Some(parent) = database_path.parent() {
        std::fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let conn = Connection::open(database_path).map_err(|err| err.to_string())?;
    conn.execute_batch(BOOTSTRAP_SQL)
        .map_err(|err| err.to_string())?;
    Ok(conn)
}

const BOOTSTRAP_SQL: &str = r#"
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS pending_uploads (
    screenshot_id TEXT PRIMARY KEY,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_attempt_at TEXT,
    last_error TEXT,
    next_attempt_at TEXT,
    source TEXT NOT NULL CHECK (source IN ('auto', 'manual'))
);

CREATE INDEX IF NOT EXISTS idx_pending_uploads_next_attempt
    ON pending_uploads(next_attempt_at);
"#;

#[cfg(test)]
mod tests {
    use super::open_and_bootstrap;
    use tempfile::tempdir;

    #[test]
    fn bootstrap_creates_pending_uploads_table() {
        let dir = tempdir().unwrap();
        let db = dir.path().join("installer.db");
        let conn = open_and_bootstrap(&db).unwrap();

        let count: i64 = conn
            .query_row(
                "select count(*) from sqlite_master where type='table' and name='pending_uploads'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn bootstrap_creates_parent_dirs() {
        let dir = tempdir().unwrap();
        let nested = dir.path().join("a/b/c").join("installer.db");
        open_and_bootstrap(&nested).unwrap();
        assert!(nested.exists());
    }
}
```

- [ ] **Step 2: Add path resolution**

Create `src-tauri/src/installer_db/path.rs`:

```rust
use std::path::PathBuf;

pub fn default_installer_db_path() -> Option<PathBuf> {
    let base = dirs::data_local_dir()?;
    Some(base.join("BazaarPlusPlus").join("installer.db"))
}
```

- [ ] **Step 3: Run the tests**

Run: `npm run test:rust -- installer_db`
Expected: PASS — bootstrap test green; the `path` module has no tests yet (pure platform indirection).

- [ ] **Step 4: Wire into `lib.rs`**

Add `mod installer_db;` to `src-tauri/src/lib.rs` next to `mod commands;`. Inside the Tauri `setup()` block, eagerly bootstrap the DB so failures surface at startup:

```rust
.setup(|app| {
    let handle = app.app_handle();
    if let Some(db_path) = installer_db::path::default_installer_db_path() {
        if let Err(err) = installer_db::open_and_bootstrap(&db_path) {
            eprintln!("failed to bootstrap installer db: {err}");
        }
    }
    build_tray(&handle)?;
    Ok(())
})
```

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/installer_db/ src-tauri/src/lib.rs
git commit -m "Add installer-owned SQLite for the pending uploads queue"
```

### Task 4.2: `bazaardb::queue` — typed CRUD on `pending_uploads`

**Files:**
- Create: `src-tauri/src/bazaardb/queue.rs`
- Modify: `src-tauri/src/bazaardb/mod.rs`

- [ ] **Step 1: Write the failing test**

Create `src-tauri/src/bazaardb/queue.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::{enqueue, list_due, mark_failure, mark_success, PendingRow, UploadSource};
    use crate::installer_db::open_and_bootstrap;
    use chrono::{Duration, Utc};
    use tempfile::NamedTempFile;

    fn fresh_db() -> rusqlite::Connection {
        let temp = NamedTempFile::new().unwrap();
        open_and_bootstrap(temp.path()).unwrap()
    }

    #[test]
    fn enqueue_stores_a_pending_row_with_zero_attempts() {
        let conn = fresh_db();
        enqueue(&conn, "snap-1", UploadSource::Manual).unwrap();
        let rows = list_due(&conn, &Utc::now()).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].screenshot_id, "snap-1");
        assert_eq!(rows[0].attempts, 0);
        assert_eq!(rows[0].source, UploadSource::Manual);
    }

    #[test]
    fn list_due_excludes_rows_whose_next_attempt_is_in_the_future() {
        let conn = fresh_db();
        enqueue(&conn, "snap-1", UploadSource::Auto).unwrap();
        let now = Utc::now();
        let later = now + Duration::hours(1);
        mark_failure(&conn, "snap-1", &later, "transient").unwrap();

        let rows_now = list_due(&conn, &now).unwrap();
        assert!(rows_now.is_empty(), "row should not be due yet");

        let rows_after = list_due(&conn, &(later + Duration::seconds(1))).unwrap();
        assert_eq!(rows_after.len(), 1);
        assert_eq!(rows_after[0].attempts, 1);
        assert_eq!(rows_after[0].last_error.as_deref(), Some("transient"));
    }

    #[test]
    fn mark_success_removes_the_row() {
        let conn = fresh_db();
        enqueue(&conn, "snap-1", UploadSource::Manual).unwrap();
        mark_success(&conn, "snap-1").unwrap();
        assert!(list_due(&conn, &Utc::now()).unwrap().is_empty());
    }
}
```

- [ ] **Step 2: Run the test**

Run: `npm run test:rust -- bazaardb::queue::tests`
Expected: FAIL — module empty.

- [ ] **Step 3: Implement queue CRUD**

Add to `src-tauri/src/bazaardb/queue.rs`:

```rust
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UploadSource {
    Manual,
    Auto,
}

impl UploadSource {
    fn as_str(self) -> &'static str {
        match self {
            UploadSource::Manual => "manual",
            UploadSource::Auto => "auto",
        }
    }

    fn parse(s: &str) -> Result<Self, String> {
        match s {
            "manual" => Ok(UploadSource::Manual),
            "auto" => Ok(UploadSource::Auto),
            other => Err(format!("unknown upload source: {other}")),
        }
    }
}

#[derive(Debug, Clone)]
pub struct PendingRow {
    pub screenshot_id: String,
    pub attempts: i64,
    pub last_attempt_at: Option<String>,
    pub last_error: Option<String>,
    pub next_attempt_at: Option<String>,
    pub source: UploadSource,
}

pub fn enqueue(conn: &Connection, screenshot_id: &str, source: UploadSource) -> Result<(), String> {
    conn.execute(
        "insert or ignore into pending_uploads
            (screenshot_id, attempts, source) values (?1, 0, ?2)",
        params![screenshot_id, source.as_str()],
    )
    .map(|_| ())
    .map_err(|err| err.to_string())
}

pub fn list_due(conn: &Connection, now: &DateTime<Utc>) -> Result<Vec<PendingRow>, String> {
    let now_str = now.to_rfc3339();
    let mut stmt = conn
        .prepare(
            "select screenshot_id, attempts, last_attempt_at, last_error, next_attempt_at, source
             from pending_uploads
             where next_attempt_at is null or next_attempt_at <= ?1
             order by coalesce(next_attempt_at, '0') asc",
        )
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map([now_str], |row| {
            Ok(PendingRow {
                screenshot_id: row.get(0)?,
                attempts: row.get(1)?,
                last_attempt_at: row.get(2)?,
                last_error: row.get(3)?,
                next_attempt_at: row.get(4)?,
                source: UploadSource::parse(&row.get::<_, String>(5)?).unwrap_or(UploadSource::Manual),
            })
        })
        .map_err(|err| err.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|err| err.to_string())?);
    }
    Ok(out)
}

pub fn mark_success(conn: &Connection, screenshot_id: &str) -> Result<(), String> {
    conn.execute(
        "delete from pending_uploads where screenshot_id = ?1",
        params![screenshot_id],
    )
    .map(|_| ())
    .map_err(|err| err.to_string())
}

pub fn mark_failure(
    conn: &Connection,
    screenshot_id: &str,
    next_attempt_at: &DateTime<Utc>,
    last_error: &str,
) -> Result<(), String> {
    conn.execute(
        "update pending_uploads
            set attempts = attempts + 1,
                last_attempt_at = ?2,
                last_error = ?3,
                next_attempt_at = ?4
            where screenshot_id = ?1",
        params![
            screenshot_id,
            Utc::now().to_rfc3339(),
            last_error,
            next_attempt_at.to_rfc3339(),
        ],
    )
    .map(|_| ())
    .map_err(|err| err.to_string())
}

pub fn count_pending(conn: &Connection) -> Result<i64, String> {
    conn.query_row(
        "select count(*) from pending_uploads",
        [],
        |row| row.get(0),
    )
    .map_err(|err| err.to_string())
}
```

Add `pub mod queue;` to `src-tauri/src/bazaardb/mod.rs`.

- [ ] **Step 4: Run the tests**

Run: `npm run test:rust -- bazaardb::queue::tests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/bazaardb/
git commit -m "Add typed CRUD for the pending_uploads queue"
```

### Task 4.3: `bazaardb::backoff` — exponential schedule

**Files:**
- Create: `src-tauri/src/bazaardb/backoff.rs`
- Modify: `src-tauri/src/bazaardb/mod.rs`

The spec specifies `1m, 5m, 15m, 1h, 6h, 24h cap`. This is a pure function with no I/O — straightforward TDD.

- [ ] **Step 1: Write the failing test**

Create `src-tauri/src/bazaardb/backoff.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::next_delay_seconds;

    #[test]
    fn schedule_matches_spec_for_first_six_attempts() {
        assert_eq!(next_delay_seconds(0), 60);          // 1m
        assert_eq!(next_delay_seconds(1), 5 * 60);      // 5m
        assert_eq!(next_delay_seconds(2), 15 * 60);     // 15m
        assert_eq!(next_delay_seconds(3), 60 * 60);     // 1h
        assert_eq!(next_delay_seconds(4), 6 * 60 * 60); // 6h
        assert_eq!(next_delay_seconds(5), 24 * 60 * 60);// 24h cap
    }

    #[test]
    fn schedule_caps_at_24h_for_high_attempt_counts() {
        assert_eq!(next_delay_seconds(99), 24 * 60 * 60);
    }
}
```

- [ ] **Step 2: Run the test**

Run: `npm run test:rust -- bazaardb::backoff::tests`
Expected: FAIL.

- [ ] **Step 3: Implement**

```rust
const SCHEDULE: &[u64] = &[
    60,
    5 * 60,
    15 * 60,
    60 * 60,
    6 * 60 * 60,
    24 * 60 * 60,
];

pub fn next_delay_seconds(attempts_so_far: u32) -> u64 {
    let idx = (attempts_so_far as usize).min(SCHEDULE.len() - 1);
    SCHEDULE[idx]
}
```

Add `pub mod backoff;` to `src-tauri/src/bazaardb/mod.rs`.

- [ ] **Step 4: Run the test**

Run: `npm run test:rust -- bazaardb::backoff::tests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/bazaardb/
git commit -m "Add exponential backoff schedule for the upload retry worker"
```

### Task 4.4: Retry worker (tokio task)

**Files:**
- Create: `src-tauri/src/bazaardb/worker.rs`
- Modify: `src-tauri/src/bazaardb/mod.rs`
- Modify: `src-tauri/src/lib.rs`

This is the only piece in Phase 4 with imperfect test coverage. We extract the *decision* part (what to do for a given response) into a pure function and unit test that. The `tokio::spawn` loop itself is not unit-tested (no meaningful seam without injecting a fake clock + fake DB + fake HTTP all at once, which would only test the wiring).

- [ ] **Step 1: Write the failing test for `decide_after_attempt`**

Create `src-tauri/src/bazaardb/worker.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::{decide_after_attempt, AttemptDecision};

    #[test]
    fn ok_outcome_drops_the_row() {
        let decision = decide_after_attempt(Ok("remote-id".to_string()), 0);
        assert!(matches!(decision, AttemptDecision::Done { .. }));
    }

    #[test]
    fn server_error_schedules_retry() {
        let decision = decide_after_attempt(Err("server_error:503".to_string()), 0);
        assert!(matches!(decision, AttemptDecision::Retry { .. }));
    }

    #[test]
    fn rate_limited_uses_retry_after_when_present() {
        let decision = decide_after_attempt(Err("rate_limited:120".to_string()), 0);
        match decision {
            AttemptDecision::Retry { delay_seconds, .. } => assert_eq!(delay_seconds, 120),
            _ => panic!("expected retry"),
        }
    }

    #[test]
    fn rate_limited_falls_back_to_schedule_when_retry_after_missing() {
        let decision = decide_after_attempt(Err("rate_limited:".to_string()), 1);
        match decision {
            AttemptDecision::Retry { delay_seconds, .. } => assert_eq!(delay_seconds, 5 * 60),
            _ => panic!("expected retry"),
        }
    }

    #[test]
    fn client_error_401_pauses_pending_pat_reconnect() {
        let decision = decide_after_attempt(Err("client_error:401".to_string()), 0);
        assert!(matches!(decision, AttemptDecision::PauseUntilReconnect { .. }));
    }

    #[test]
    fn other_client_errors_drop_the_row_with_message() {
        let decision = decide_after_attempt(Err("client_error:422".to_string()), 0);
        assert!(matches!(decision, AttemptDecision::Drop { .. }));
    }
}
```

- [ ] **Step 2: Run the test**

Run: `npm run test:rust -- bazaardb::worker::tests`
Expected: FAIL.

- [ ] **Step 3: Implement `decide_after_attempt` and the worker loop**

Add above the tests in `src-tauri/src/bazaardb/worker.rs`:

```rust
use crate::bazaardb::{
    backoff::next_delay_seconds, client::upload_screenshot,
    endpoints::BAZAARDB_BASE_URL, image_pipeline::encode_for_upload,
    keyring::KeyringStore, payload::ScreenshotMetadata, queue,
};
use crate::installer_db::{self, path::default_installer_db_path};
use crate::stream::records::OverlayRecordRepository;
use chrono::{Duration, Utc};
use std::path::PathBuf;
use std::time::Duration as StdDuration;

#[derive(Debug)]
pub enum AttemptDecision {
    Done { remote_id: String },
    Retry { delay_seconds: u64, message: String },
    PauseUntilReconnect { message: String },
    Drop { message: String },
}

pub fn decide_after_attempt(
    outcome: Result<String, String>,
    attempts_so_far: u32,
) -> AttemptDecision {
    match outcome {
        Ok(remote_id) => AttemptDecision::Done { remote_id },
        Err(err) => {
            if let Some(rest) = err.strip_prefix("rate_limited:") {
                let parsed = rest.trim().parse::<u64>().ok();
                let delay = parsed.unwrap_or_else(|| next_delay_seconds(attempts_so_far));
                AttemptDecision::Retry { delay_seconds: delay, message: err }
            } else if let Some(rest) = err.strip_prefix("client_error:") {
                if rest.trim() == "401" {
                    AttemptDecision::PauseUntilReconnect { message: err }
                } else {
                    AttemptDecision::Drop { message: err }
                }
            } else if err.starts_with("server_error:") || err.contains("network") {
                AttemptDecision::Retry {
                    delay_seconds: next_delay_seconds(attempts_so_far),
                    message: err,
                }
            } else {
                AttemptDecision::Retry {
                    delay_seconds: next_delay_seconds(attempts_so_far),
                    message: err,
                }
            }
        }
    }
}

pub fn spawn_worker(game_path: Option<PathBuf>) {
    tokio::spawn(async move {
        loop {
            if let Err(err) = drain_once(game_path.clone()).await {
                eprintln!("upload worker tick failed: {err}");
            }
            tokio::time::sleep(StdDuration::from_secs(60)).await;
        }
    });
}

async fn drain_once(game_path: Option<PathBuf>) -> Result<(), String> {
    let Some(db_path) = default_installer_db_path() else { return Ok(()); };
    let conn = installer_db::open_and_bootstrap(&db_path)?;

    let pat = match KeyringStore::os().load()? {
        Some(token) => token,
        None => return Ok(()),
    };

    let now = Utc::now();
    let due = queue::list_due(&conn, &now)?;
    if due.is_empty() {
        return Ok(());
    }

    let repo = OverlayRecordRepository::new(game_path);

    for row in due {
        let Some(record) = repo.load_record_by_id(&row.screenshot_id)? else {
            queue::mark_success(&conn, &row.screenshot_id).ok();
            continue;
        };

        let Some(player_account_id) = record.player_account_id.clone() else {
            queue::mark_failure(
                &conn,
                &row.screenshot_id,
                &(now + Duration::hours(24)),
                "missing_player_account_id",
            )?;
            continue;
        };

        let Some((_path, raw)) = repo.load_image(&row.screenshot_id)? else {
            queue::mark_success(&conn, &row.screenshot_id).ok();
            continue;
        };
        let encoded = match encode_for_upload(&raw) {
            Ok(e) => e,
            Err(err) => {
                queue::mark_failure(
                    &conn,
                    &row.screenshot_id,
                    &(now + Duration::hours(24)),
                    &err,
                )?;
                continue;
            }
        };

        let metadata = ScreenshotMetadata {
            screenshot_id: row.screenshot_id.clone(),
            run_id: record.run_id.clone(),
            hero_name: Some(record.title.clone()),
            final_days: record.battle_count,
            final_victories: record.wins,
            player_name: record.player_name.clone(),
            player_account_id,
            player_rank: record.rank.clone(),
            player_rating: record.rating,
            player_position: record.position,
            captured_at_utc: record.captured_at_utc.clone(),
            auto_uploaded: matches!(row.source, queue::UploadSource::Auto),
            ..Default::default()
        };

        let outcome =
            upload_screenshot(BAZAARDB_BASE_URL, &pat, &metadata, &encoded.bytes).await;

        match decide_after_attempt(outcome, row.attempts as u32) {
            AttemptDecision::Done { .. } => {
                queue::mark_success(&conn, &row.screenshot_id)?;
            }
            AttemptDecision::Retry { delay_seconds, message } => {
                let next = now + Duration::seconds(delay_seconds as i64);
                queue::mark_failure(&conn, &row.screenshot_id, &next, &message)?;
            }
            AttemptDecision::PauseUntilReconnect { message } => {
                let next = now + Duration::days(365);
                queue::mark_failure(&conn, &row.screenshot_id, &next, &message)?;
            }
            AttemptDecision::Drop { message } => {
                let next = now + Duration::days(365);
                queue::mark_failure(&conn, &row.screenshot_id, &next, &message)?;
            }
        }
    }
    Ok(())
}
```

Add `pub mod worker;` to `src-tauri/src/bazaardb/mod.rs`.

In `src-tauri/src/lib.rs`'s `setup()`, after the installer DB bootstrap, kick off the worker:

```rust
crate::bazaardb::worker::spawn_worker(None);
```

(Pass an actual `game_path` once you have a way to resolve it from `InstallerContextState` at startup time; otherwise leave it `None` and let path resolution fall back to `find_database_path_anywhere`.)

- [ ] **Step 4: Run the tests**

Run: `npm run test:rust -- bazaardb::worker::tests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/bazaardb/ src-tauri/src/lib.rs
git commit -m "Add background worker that drains the pending uploads queue"
```

### Task 4.5: Hook manual upload to the queue (so it survives transient failures)

**Files:**
- Modify: `src-tauri/src/commands/bazaardb.rs`

The current `upload_screenshot_to_bazaardb` (Task 3.4) returns an error directly on transient failures. Wrap that to persist to `pending_uploads` so the worker can finish the job.

- [ ] **Step 1: Write the failing test**

In `src-tauri/src/commands/bazaardb.rs` add a test module that exercises `upload_or_enqueue` (we'll extract the queue/upload decision into a unit-testable function):

```rust
#[cfg(test)]
mod tests {
    use super::{handle_attempt_outcome, AttemptResult};
    use crate::installer_db::open_and_bootstrap;
    use tempfile::NamedTempFile;

    #[test]
    fn handle_outcome_returns_remote_id_on_success_without_enqueueing() {
        let temp = NamedTempFile::new().unwrap();
        let conn = open_and_bootstrap(temp.path()).unwrap();
        let result = handle_attempt_outcome(&conn, "snap-1", Ok("remote-1".into()), false).unwrap();
        assert!(matches!(result, AttemptResult::Uploaded { .. }));
        let count: i64 = conn
            .query_row("select count(*) from pending_uploads", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn handle_outcome_enqueues_on_transient_failure() {
        let temp = NamedTempFile::new().unwrap();
        let conn = open_and_bootstrap(temp.path()).unwrap();
        let result =
            handle_attempt_outcome(&conn, "snap-1", Err("server_error:503".into()), false).unwrap();
        assert!(matches!(result, AttemptResult::Queued { .. }));
        let count: i64 = conn
            .query_row("select count(*) from pending_uploads", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn handle_outcome_drops_on_permanent_4xx() {
        let temp = NamedTempFile::new().unwrap();
        let conn = open_and_bootstrap(temp.path()).unwrap();
        let result =
            handle_attempt_outcome(&conn, "snap-1", Err("client_error:422".into()), false)
                .unwrap_err();
        assert!(result.contains("client_error:422"));
        let count: i64 = conn
            .query_row("select count(*) from pending_uploads", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }
}
```

- [ ] **Step 2: Run the test**

Run: `npm run test:rust -- commands::bazaardb::tests`
Expected: FAIL.

- [ ] **Step 3: Implement `handle_attempt_outcome` + integrate**

Add to `src-tauri/src/commands/bazaardb.rs`:

```rust
use crate::bazaardb::{queue, worker::{decide_after_attempt, AttemptDecision}};
use crate::installer_db::{self, path::default_installer_db_path};
use chrono::{Duration as ChronoDuration, Utc};
use rusqlite::Connection;

pub enum AttemptResult {
    Uploaded { remote_id: String },
    Queued { reason: String },
}

pub fn handle_attempt_outcome(
    conn: &Connection,
    screenshot_id: &str,
    outcome: Result<String, String>,
    auto: bool,
) -> Result<AttemptResult, String> {
    match decide_after_attempt(outcome, 0) {
        AttemptDecision::Done { remote_id } => Ok(AttemptResult::Uploaded { remote_id }),
        AttemptDecision::Retry { delay_seconds, message } => {
            queue::enqueue(
                conn,
                screenshot_id,
                if auto { queue::UploadSource::Auto } else { queue::UploadSource::Manual },
            )?;
            let next = Utc::now() + ChronoDuration::seconds(delay_seconds as i64);
            queue::mark_failure(conn, screenshot_id, &next, &message)?;
            Ok(AttemptResult::Queued { reason: message })
        }
        AttemptDecision::PauseUntilReconnect { message } => {
            queue::enqueue(
                conn,
                screenshot_id,
                if auto { queue::UploadSource::Auto } else { queue::UploadSource::Manual },
            )?;
            let next = Utc::now() + ChronoDuration::days(365);
            queue::mark_failure(conn, screenshot_id, &next, &message)?;
            Err(message)
        }
        AttemptDecision::Drop { message } => Err(message),
    }
}
```

In `upload_screenshot_to_bazaardb`, replace the bare `?` after `upload_screenshot(...)` with a call to `handle_attempt_outcome`. When it returns `Queued`, surface a struct that distinguishes "queued" vs "uploaded" to the frontend so the UI can show "Will retry" instead of failure.

Update the `UploadResult` type:

```rust
#[derive(Debug, Serialize, ts_rs::TS)]
#[ts(export)]
pub enum UploadResult {
    Uploaded { remote_id: String },
    Queued { reason: String },
}
```

- [ ] **Step 4: Run the tests**

Run: `npm run test:rust -- commands::bazaardb::tests`
Expected: PASS.

- [ ] **Step 5: Update the frontend to handle `Queued`**

In `src/lib/bazaardb/upload-actions.ts`:

```ts
export type UploadStatus =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'uploaded'; remoteId: string }
  | { kind: 'queued'; reason: string }
  | { kind: 'error'; message: string };

export async function uploadScreenshot(screenshotId: string): Promise<UploadStatus> {
  try {
    const result = await call('upload_screenshot_to_bazaardb', {
      request: { screenshot_id: screenshotId },
    });
    if ('Uploaded' in result) {
      return { kind: 'uploaded', remoteId: result.Uploaded.remote_id };
    }
    return { kind: 'queued', reason: result.Queued.reason };
  } catch (err) {
    return { kind: 'error', message: String(err) };
  }
}
```

Update the row UI to render `Queued` as "Will retry" with the reason on hover.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/bazaardb.rs src/lib/bazaardb/ src/lib/generated/
git commit -m "Persist transient upload failures in the pending_uploads queue"
```

### Task 4.6: Auto mode — toggle + capture-source watcher

**Files:**
- Create: `src-tauri/src/bazaardb/auto_watcher.rs`
- Modify: `src-tauri/src/bazaardb/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/routes/settings/+page.svelte`

The watcher polls the BPP DB for new `end_of_run_auto` screenshots since the last seen `captured_at_utc`, and enqueues each one with `UploadSource::Auto`. The current `pending_uploads.next_attempt_at` is `null` after `enqueue`, so the worker picks them up on its next tick.

- [ ] **Step 1: Write the failing test for the high-watermark cursor**

Create `src-tauri/src/bazaardb/auto_watcher.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::{find_new_screenshots, NewScreenshot};
    use rusqlite::Connection;

    fn make_db(rows: &[(&str, &str, &str, &str)]) -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "create table run_screenshots (
                screenshot_id text primary key,
                run_id text,
                capture_source text not null,
                image_relative_path text not null,
                captured_at_local text not null,
                captured_at_utc text not null
            )",
            [],
        )
        .unwrap();
        for (id, run_id, source, captured_at_utc) in rows {
            conn.execute(
                "insert into run_screenshots
                    (screenshot_id, run_id, capture_source, image_relative_path,
                     captured_at_local, captured_at_utc)
                 values (?1, ?2, ?3, 'x.png', ?4, ?4)",
                rusqlite::params![id, run_id, source, captured_at_utc],
            )
            .unwrap();
        }
        conn
    }

    #[test]
    fn finds_only_end_of_run_auto_after_cursor() {
        let conn = make_db(&[
            ("snap-old", "r1", "end_of_run_auto", "2026-04-10T10:00:00+00:00"),
            ("snap-pvp", "r2", "pvp_battle_start", "2026-04-10T11:00:00+00:00"),
            ("snap-new", "r3", "end_of_run_auto", "2026-04-10T12:00:00+00:00"),
        ]);
        let new_rows = find_new_screenshots(&conn, "2026-04-10T10:30:00+00:00").unwrap();
        let ids: Vec<&str> = new_rows.iter().map(|r| r.screenshot_id.as_str()).collect();
        assert_eq!(ids, vec!["snap-new"]);
    }

    #[test]
    fn returns_empty_when_cursor_matches_latest() {
        let conn = make_db(&[
            ("snap-old", "r1", "end_of_run_auto", "2026-04-10T10:00:00+00:00"),
        ]);
        let new_rows = find_new_screenshots(&conn, "2026-04-10T10:00:00+00:00").unwrap();
        assert!(new_rows.is_empty());
    }
}
```

- [ ] **Step 2: Run the test**

Run: `npm run test:rust -- bazaardb::auto_watcher::tests`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add to `src-tauri/src/bazaardb/auto_watcher.rs` above the tests:

```rust
use rusqlite::Connection;

#[derive(Debug, Clone)]
pub struct NewScreenshot {
    pub screenshot_id: String,
    pub captured_at_utc: String,
}

pub fn find_new_screenshots(
    conn: &Connection,
    cursor_utc_exclusive: &str,
) -> Result<Vec<NewScreenshot>, String> {
    let mut stmt = conn
        .prepare(
            "select screenshot_id, captured_at_utc
             from run_screenshots
             where capture_source = 'end_of_run_auto'
               and datetime(captured_at_utc) > datetime(?1)
             order by datetime(captured_at_utc) asc",
        )
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map([cursor_utc_exclusive], |row| {
            Ok(NewScreenshot {
                screenshot_id: row.get(0)?,
                captured_at_utc: row.get(1)?,
            })
        })
        .map_err(|err| err.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|err| err.to_string())?);
    }
    Ok(out)
}
```

Add `pub mod auto_watcher;` to `src-tauri/src/bazaardb/mod.rs`.

- [ ] **Step 4: Run the tests**

Run: `npm run test:rust -- bazaardb::auto_watcher::tests`
Expected: PASS.

- [ ] **Step 5: Wire the watcher into the worker tick**

In `src-tauri/src/bazaardb/worker.rs`, before draining `pending_uploads`, run `find_new_screenshots` against the BPP DB using the last-seen cursor (stored in a new key in the installer DB, e.g., a tiny `auto_cursor` table). For each new row, `queue::enqueue(... UploadSource::Auto)`.

Gate the watcher behind a new flag `auto_upload_enabled` stored in the installer DB. The frontend toggle (next step) flips this flag.

```sql
CREATE TABLE IF NOT EXISTS bazaardb_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

Add this to the bootstrap SQL in `src-tauri/src/installer_db/mod.rs` and add tiny helpers `get_setting(conn, key) -> Option<String>` and `set_setting(conn, key, value)`.

- [ ] **Step 6: Add Tauri commands `set_auto_upload_enabled` and `get_auto_upload_enabled`**

In `src-tauri/src/commands/bazaardb.rs`:

```rust
#[tauri::command]
pub fn set_auto_upload_enabled(enabled: bool) -> Result<(), String> {
    let db_path = default_installer_db_path().ok_or_else(|| "no_data_dir".to_string())?;
    let conn = installer_db::open_and_bootstrap(&db_path)?;
    installer_db::set_setting(&conn, "auto_upload_enabled", if enabled { "1" } else { "0" })
}

#[tauri::command]
pub fn get_auto_upload_enabled() -> Result<bool, String> {
    let db_path = default_installer_db_path().ok_or_else(|| "no_data_dir".to_string())?;
    let conn = installer_db::open_and_bootstrap(&db_path)?;
    Ok(installer_db::get_setting(&conn, "auto_upload_enabled")?.as_deref() == Some("1"))
}
```

Register both in `lib.rs` and `bridge/commands.ts`.

- [ ] **Step 7: Add the toggle to the settings page**

In `src/routes/settings/+page.svelte`:

```svelte
<script lang="ts">
  import { call } from '$lib/bridge/commands';
  let autoUpload = $state(false);

  onMount(async () => {
    autoUpload = await call('get_auto_upload_enabled');
  });

  async function toggleAutoUpload(next: boolean) {
    autoUpload = next;
    await call('set_auto_upload_enabled', { enabled: next });
  }
</script>

<label>
  <input type="checkbox" checked={autoUpload}
         onchange={(e) => toggleAutoUpload(e.currentTarget.checked)} />
  Auto-upload end-of-run screenshots
</label>
```

Default: off (per the spec — opt-in).

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/ src/routes/settings/ src/lib/
git commit -m "Add auto-upload toggle and watcher for new end-of-run screenshots"
```

### Task 4.7: Settings page — pending count + queue inspector

**Files:**
- Modify: `src/routes/settings/+page.svelte`
- Add: `src-tauri/src/commands/bazaardb.rs` — `list_pending_uploads` command

- [ ] **Step 1: Add the command**

```rust
#[derive(Debug, Serialize, ts_rs::TS)]
#[ts(export)]
pub struct PendingUploadView {
    pub screenshot_id: String,
    pub attempts: i64,
    pub last_error: Option<String>,
    pub next_attempt_at: Option<String>,
    pub source: String,
}

#[tauri::command]
pub fn list_pending_uploads() -> Result<Vec<PendingUploadView>, String> {
    let db_path = default_installer_db_path().ok_or_else(|| "no_data_dir".to_string())?;
    let conn = installer_db::open_and_bootstrap(&db_path)?;
    let rows = queue::list_due(&conn, &chrono::DateTime::<chrono::Utc>::MAX_UTC)?;
    Ok(rows
        .into_iter()
        .map(|r| PendingUploadView {
            screenshot_id: r.screenshot_id,
            attempts: r.attempts,
            last_error: r.last_error,
            next_attempt_at: r.next_attempt_at,
            source: match r.source {
                queue::UploadSource::Auto => "auto".to_string(),
                queue::UploadSource::Manual => "manual".to_string(),
            },
        })
        .collect())
}
```

Register in `lib.rs` + `bridge/commands.ts`.

- [ ] **Step 2: Add the queue panel**

In `src/routes/settings/+page.svelte`, add a "Pending uploads" section with:
- A count of pending rows
- A toggleable list of `{screenshot_id, attempts, last_error, next_attempt_at}`
- A refresh button

- [ ] **Step 3: Type-check + manual smoke test**

Run: `npm run check && npm run dev`
Validate the queue panel shows expected rows after a forced failure (point `BAZAARDB_BASE_URL` at a mock that returns 503, then trigger a manual upload).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/bazaardb.rs src-tauri/src/lib.rs src/lib/bridge/commands.ts src/lib/generated/ src/routes/settings/
git commit -m "Surface pending uploads in the settings page"
```

---

## Phase 5 (optional): URL scheme handoff for `bazaarplusplus://link`

Skip this phase unless BazaarDB confirms they will ship the "Send to BazaarPlusPlus" button. The functionality is purely a UX shortcut; paste already works.

### Task 5.1: Add `tauri-plugin-deep-link` and `tauri-plugin-single-instance`

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Add plugins to Cargo.toml**

```toml
tauri-plugin-deep-link = "2"
```

```toml
[target.'cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))'.dependencies]
tauri-plugin-single-instance = { version = "2", features = ["deep-link"] }
```

- [ ] **Step 2: Edit `tauri.conf.json` to register the scheme**

Inside the existing `plugins` block:

```json
"deep-link": {
  "desktop": {
    "schemes": ["bazaarplusplus"]
  }
}
```

For Windows, the scheme also needs to be registered in the bundle config so the installer registers it on install. Refer to the `tauri-plugin-deep-link` docs for the platform-specific bundle bits and copy the relevant snippets.

- [ ] **Step 3: Verify the workspace builds**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/tauri.conf.json
git commit -m "Register bazaarplusplus URL scheme via deep-link plugin"
```

### Task 5.2: Handle `bazaarplusplus://link` URLs

**Files:**
- Create: `src-tauri/src/bazaardb/deeplink.rs`
- Modify: `src-tauri/src/bazaardb/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write the failing test for URL parsing**

Create `src-tauri/src/bazaardb/deeplink.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::{parse_link_url, LinkParams};

    #[test]
    fn parses_token_and_account_from_link_url() {
        let parsed = parse_link_url("bazaarplusplus://link?token=pat-abc&account=Xinyu").unwrap();
        assert_eq!(parsed, LinkParams {
            token: "pat-abc".into(),
            account: Some("Xinyu".into()),
        });
    }

    #[test]
    fn percent_decodes_account_display_name() {
        let parsed =
            parse_link_url("bazaarplusplus://link?token=pat&account=Xin%20yu").unwrap();
        assert_eq!(parsed.account.as_deref(), Some("Xin yu"));
    }

    #[test]
    fn rejects_non_link_paths() {
        assert!(parse_link_url("bazaarplusplus://other?token=pat").is_err());
    }

    #[test]
    fn rejects_missing_token() {
        assert!(parse_link_url("bazaarplusplus://link?account=Xinyu").is_err());
    }
}
```

- [ ] **Step 2: Run the test**

Run: `npm run test:rust -- bazaardb::deeplink::tests`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add to `src-tauri/src/bazaardb/deeplink.rs` above the tests:

```rust
#[derive(Debug, PartialEq, Eq)]
pub struct LinkParams {
    pub token: String,
    pub account: Option<String>,
}

pub fn parse_link_url(raw: &str) -> Result<LinkParams, String> {
    let stripped = raw.strip_prefix("bazaarplusplus://").ok_or("not a bazaarplusplus url")?;
    let (path, query) = stripped.split_once('?').unwrap_or((stripped, ""));
    if path != "link" {
        return Err(format!("unexpected path: {path}"));
    }
    let mut token = None;
    let mut account = None;
    for pair in query.split('&') {
        if pair.is_empty() { continue; }
        let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
        let decoded = percent_decode(value);
        match key {
            "token" => token = Some(decoded),
            "account" => account = Some(decoded),
            _ => {}
        }
    }
    let token = token.ok_or("missing token")?;
    Ok(LinkParams { token, account })
}

fn percent_decode(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let bytes = input.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(&input[i + 1..i + 3], 16) {
                out.push(byte as char);
                i += 3;
                continue;
            }
        } else if bytes[i] == b'+' {
            out.push(' ');
            i += 1;
            continue;
        }
        out.push(bytes[i] as char);
        i += 1;
    }
    out
}
```

Add `pub mod deeplink;` to `src-tauri/src/bazaardb/mod.rs`.

- [ ] **Step 4: Wire into Tauri's `setup()`**

In `src-tauri/src/lib.rs`'s `setup()`:

```rust
use tauri_plugin_deep_link::DeepLinkExt;

let app_handle = app.handle().clone();
app.deep_link().on_open_url(move |event| {
    for url in event.urls() {
        if let Ok(params) = crate::bazaardb::deeplink::parse_link_url(&url.to_string()) {
            let handle = app_handle.clone();
            tauri::async_runtime::spawn(async move {
                let request = crate::commands::bazaardb::ConnectBazaardbRequest { token: params.token };
                if let Err(err) = crate::commands::bazaardb::connect_bazaardb(request).await {
                    eprintln!("deeplink connect failed: {err}");
                } else if let Some(window) = handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                    let _ = window.eval("window.location.assign('/settings');");
                }
            });
        }
    }
});
```

Also register the plugins:

```rust
.plugin(tauri_plugin_deep_link::init())
.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
    let _ = args;
}))
```

`tauri-plugin-single-instance` must come before any other plugin per its docs.

- [ ] **Step 5: Run the tests**

Run: `npm run test:rust -- bazaardb::deeplink::tests`
Expected: PASS.

- [ ] **Step 6: Manual smoke test**

Build a debug app: `npm run dev`. From a terminal: `open "bazaarplusplus://link?token=valid-pat&account=Xinyu"` (macOS) or the Windows equivalent. Confirm the app focuses and `/settings` shows "Connected as Xinyu".

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/ src/lib/
git commit -m "Handle bazaarplusplus deep links to import a PAT"
```

---

## Self-review checklist

Before handing off:

- [ ] **Spec coverage:** Every section of `2026-05-08-bazaardb-upload-design.md` maps to a task — auth (Phase 2), data model + multipart (Phase 3), retry policy (Phase 4), settings UI (Phase 2 + 4), URL scheme (Phase 5), multi-user semantics (player_account_id flowing through Phase 1 → 3 → 4).
- [ ] **No placeholders:** No "TODO", "fill in details", or "similar to Task N" — every step has its own code block. Endpoint URLs are concrete defaults; the only TBD is whether the spec's proposed paths match what BazaarDB ships, and that's a one-line constant change.
- [ ] **Type consistency:** `OverlayRecordRow.player_name` / `player_account_id` are `Option<String>` everywhere. `ScreenshotMetadata.player_account_id` is `String` (required — see the "missing_player_account_id" error path). `UploadSource` is `manual` | `auto` end-to-end. `UploadResult` is `Uploaded` / `Queued` end-to-end.

## Notes on parallelism and ordering

The phases must execute in order (each builds on the previous), but inside a phase several tasks are independent and a parallel-agent runner can dispatch them in parallel:

- Phase 1 tasks 1.1, 1.2, 1.3 are independent (each modifies a different SQL statement). Task 1.4 depends on 1.1-1.3 because the row mapper exposes the new fields.
- Phase 2 tasks 2.2 and 2.3 are independent (keyring vs HTTP client); 2.4 depends on both.
- Phase 3 tasks 3.1 (image) and 3.2 (payload) are independent; 3.3 depends on 3.2; 3.4 depends on 3.1, 3.2, 3.3.
- Phase 4 tasks 4.2 (queue), 4.3 (backoff), 4.6 (auto watcher) are independent of each other; 4.4 (worker) depends on 4.2 + 4.3; 4.5 (manual hook) depends on 4.4; 4.7 depends on 4.2.

If executing with `superpowers:subagent-driven-development`, prefer one task per subagent so reviews stay tight.
