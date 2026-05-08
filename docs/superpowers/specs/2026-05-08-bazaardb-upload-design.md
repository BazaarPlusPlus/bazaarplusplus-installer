# BazaarDB Screenshot Upload Integration

Status: Draft
Date: 2026-05-08

## Goal

Allow installer users to upload end-of-run screenshots to BazaarDB so that
BazaarDB can collect and display match results without requiring the user
to operate a browser flow themselves.

## Context

- BazaarDB's existing upload endpoint relies on Supabase session cookies and
  a Cloudflare Turnstile token, which are tied to a logged-in browser
  session and are not reachable from the installer.
- BazaarDB has no concept of "linked game account": a BazaarDB user is not
  associated with any in-game `player_account_id`.
- The installer is a Tauri desktop app distributed to many users, and a
  single PC can switch between multiple in-game accounts over time.
- The installer already has access, via the BPP mod's local SQLite, to
  per-screenshot run metadata (hero, day, position, rank, etc.) and to a
  table that surfaces `player_name` / `player_account_id` (currently not
  read by the installer's SQL).

## Out of scope

- Server-side changes to BazaarDB beyond the items in
  "Communication points for BazaarDB" below.
- Programmatic linking of a BazaarDB account to an in-game account.
- Modifying BazaarDB's existing browser upload flow.

## Authentication

### Primary: paste a PAT

This is the path that MUST work, regardless of any optional enhancements.

1. BazaarDB extends its account schema with a personal access token (PAT)
   field. Users generate / revoke tokens from a BazaarDB settings page.
2. The installer's settings page exposes a "Connect BazaarDB account"
   section with:
   - A link button that opens the BazaarDB token page in the user's
     default browser.
   - An input field where the user pastes the PAT.
   - A "Connect" action that validates the PAT and persists it on
     success.
3. Validation calls a BazaarDB endpoint (path TBD with BazaarDB) that
   returns the BazaarDB account display name on success and a 401 on
   failure.
4. Once connected, the settings page shows the connected account name and
   a "Disconnect" action that clears local credentials.

### Optional UX enhancement: custom URL scheme handoff

The installer registers the `bazaarplusplus://` URL scheme via Tauri so
that BazaarDB MAY (at their option) add a "Send to BazaarPlusPlus" button
to their token page that opens
`bazaarplusplus://link?token=<pat>&account=<display_name>`. The installer
handles the deep link, runs the same validation flow as paste, and stores
the token.

This is a pure UX shortcut. BazaarDB might decline to add a third-party
button on their site, which is fine — paste still works. The installer
should register the scheme either way; it costs nothing and turns on the
moment BazaarDB chooses to ship the button.

### Storage

The PAT is stored in the OS keyring via a Tauri keyring plugin
(macOS Keychain / Windows Credential Manager). It is never written to a
plain config file or log. One installer instance is bound to one BazaarDB
account at a time.

## Data model

### Upload payload fields

Per-screenshot fields, sent for every upload:

| Field | Type | Source | Notes |
| --- | --- | --- | --- |
| `screenshot_id` | string (UUID) | BPP `run_screenshots.screenshot_id` | Idempotency key |
| `run_id` | string | BPP `run_screenshots.run_id` | Many screenshots can share one run |
| `hero_name` | string | BPP `run_screenshots.hero_name` | e.g. "Mak", "Vanessa" |
| `final_days` | int | BPP `run_screenshots.day` | In-game turn count at end of run |
| `final_victories` | int | BPP `run_screenshots.victories_at_capture` | Wins at end of run |
| `player_name` | string | BPP DB (table TBD) | Display only — see multi-user handling |
| `player_account_id` | string | BPP DB (table TBD) | Stable game account identifier |
| `player_rank` | string | BPP `run_screenshots.player_rank` | e.g. "Diamond" |
| `player_rating` | int | BPP `run_screenshots.player_rating` | MMR |
| `player_position` | int | BPP `run_screenshots.player_position` | Final placement |
| `captured_at_utc` | string (ISO 8601) | BPP `run_screenshots.captured_at_utc` | UTC timestamp |

Client metadata, set by the installer:

| Field | Type | Notes |
| --- | --- | --- |
| `schema_version` | int | Starts at `1`. Bumped when this field set changes |
| `installer_version` | string | Installer's semver string |
| `auto_uploaded` | bool | `true` if uploaded by auto mode, `false` if manual |
| `image_format` | string | Encoding of the uploaded image, e.g. `"jpeg"` |

### Multipart format

```
POST /api/uploads/screenshot          (path TBD with BazaarDB)
Authorization: Bearer <pat>
Content-Type: multipart/form-data

image:    <JPEG bytes — see "Image preprocessing" below>
metadata: <JSON string of all fields above>
```

### Image preprocessing

End-of-run screenshots from the BPP mod are PNGs at the user's display
resolution, typically 5–10 MB at 1080p and larger at higher resolutions.
Sending them raw is wasteful for upload time, BazaarDB storage, and
end-user bandwidth. The installer downscales and re-encodes before
upload:

- **Format**: JPEG. Universal browser support; chosen over WebP to keep
  the wire format predictable and reduce server-side handling variants.
- **Quality**: 85. Visually indistinguishable from the source at typical
  web display sizes; sits at the size/quality knee.
- **Max longest edge**: 1920 px, preserving aspect ratio. Smaller images
  are not upscaled.
- **Soft fallback**: if the resulting JPEG is still > 2 MB, re-encode at
  q75, then q60. If still over the cap, fail the upload with a clear
  error rather than silently truncating quality further.
- **Implementation**: the existing `image` crate (already a dependency
  in [src-tauri/Cargo.toml](../../../src-tauri/Cargo.toml)) handles
  decode → resize → JPEG encode in one pipeline.

Expected output: ~200–500 KB per image, a 20–50× reduction from the PNG
source. The metadata payload sets `image_format: "jpeg"` so BazaarDB can
unambiguously tell processed from raw, and so the field is in place if a
future schema version introduces other formats.

Putting metadata into a single JSON form field (rather than one form
field per attribute) keeps the wire shape stable as fields are added or
renamed.

### SQL extensions on the installer side

The installer's current `run_screenshots` SELECT statements
([repo.rs](../../../src-tauri/src/stream/records/repo.rs)) do not project
`player_name` or `player_account_id`. Implementation will need to:

- Identify which BPP table holds those columns (read BPP DB schema in
  situ; not yet documented in this repo).
- Extend the existing SELECTs to JOIN or subquery those columns, keeping
  the resulting `OverlayRecordRow` backwards-compatible for existing UI
  consumers.
- Treat missing `player_account_id` as a "cannot upload" state for that
  record (do not upload partial data).

## Multi-user handling

A single installer instance is bound to one BazaarDB account, but the
in-game account at capture time is whatever the user was logged into. So:

- Each upload's `player_account_id` reflects the in-game account at
  capture, which can differ across screenshots even from the same
  installer.
- BazaarDB MUST NOT assume `bazaardb_user → player_account_id` is 1:1.
  The relationship is many-to-many.
- The semantics on the BazaarDB side:
  - `bazaardb_user` (derived from the PAT): "who submitted this".
    Authoritative for rate-limiting, attribution, and revocation.
  - `player_account_id` (from payload): "who played this run".
    Authoritative for aggregation, leaderboards, and per-account stats.
- `player_name` is for display only. Players can rename, so it must
  never be used as an aggregation or dedup key.

## Upload modes

The installer supports two modes, controlled by a single
"Auto-upload screenshots" toggle in settings.

### Manual (default)

- Each entry in the screenshot record library has an "Upload to
  BazaarDB" action.
- Invoking the action submits exactly that screenshot, with
  `auto_uploaded: false`.
- Inline status feedback per entry: pending → success / failure with
  reason.

Default is manual / opt-in to avoid silently exfiltrating user data on
upgrade.

### Auto

- When the toggle is on, every new `end_of_run_auto` screenshot is
  enqueued for upload with `auto_uploaded: true`.
- Status surfaces in the existing stream/recording status area; no
  modal interruptions.

### Failure handling and retry

A new local SQLite table `pending_uploads` tracks state across restarts:

```sql
create table pending_uploads (
  screenshot_id text primary key,
  attempts integer not null default 0,
  last_attempt_at text,
  last_error text,
  next_attempt_at text,
  source text not null   -- 'auto' | 'manual'
);
```

Retry policy:

- Network errors and 5xx: exponential backoff `1m, 5m, 15m, 1h, 6h`,
  then capped at `24h`.
- 429: respect `Retry-After`, fall back to the same backoff curve.
- 401: stop retrying for this PAT, surface a "reconnect BazaarDB"
  prompt in settings; the queue resumes once a new PAT is connected.
- 4xx other than 401/429: do not retry, mark `last_error`, surface in
  the record library row.

The queue is drained on app start and on network-availability change.
Idempotency on the server (see Communication points) means the worst
case from a duplicated retry is a no-op response, not a duplicate row.

## Settings UI

A new "BazaarDB" section in the installer settings:

- Connection status: "Not connected" or "Connected as `<account>`"
- Connect / Disconnect button(s)
- Auto-upload toggle (off by default)
- Pending-uploads count and a "View queue" affordance for inspecting
  failed entries

## Communication points for BazaarDB

These are the items to align with the BazaarDB maintainer. They do not
describe internal installer work.

1. Add a PAT field to the BazaarDB account schema, with a settings page
   to generate / revoke tokens.
2. Expose two endpoints accessible with `Authorization: Bearer <pat>`:
   - Token validation: returns `200 { account_name }` on valid PAT,
     `401` otherwise.
   - Screenshot upload: accepts the multipart payload above.
3. Server-side dedup: enforce uniqueness on `screenshot_id`. Repeat
   uploads MUST return the existing record idempotently, not 4xx.
   (`screenshot_id` is a UUID generated at capture time on the
   installer side, so it is stable across retries.)
4. Server-side rate limiting per PAT (the PAT only attributes; it does
   not by itself prevent a single user from spamming).
5. Multi-user semantics: `bazaardb_user → player_account_id` is
   many-to-many; treat `player_name` as display-only.
6. (Optional) Add a "Send to BazaarPlusPlus" button on the token page
   that opens `bazaarplusplus://link?token=<pat>&account=<display>`.
7. (Suggested) "Pending confirmation" review flow. Incoming uploads
   land in a per-user pending queue rather than going public
   immediately; the BazaarDB account holder approves, edits, or
   discards each entry from the BazaarDB UI before it becomes
   visible to other users. This addresses several concerns at once:
   - Mis-captured screenshots can be filtered out before they're
     public.
   - If `player_account_id` is wrong (e.g. user was logged into a
     different in-game account at capture time), the user can spot
     it and discard.
   - Acts as a safety valve if a PAT is stolen: the legitimate
     account holder sees unfamiliar uploads in their pending queue
     and can revoke the token plus clean up affected entries before
     they spread.

   This is purely a BazaarDB UX decision. The installer does not
   need to know whether an upload was published immediately or
   queued for review, so this can be added without any installer
   changes.

## Phasing

1. Extend `run_screenshots` SQL to surface `player_name` and
   `player_account_id`.
2. Settings UI: PAT input, validation call, keyring storage, connection
   status.
3. Image preprocessing pipeline (decode / resize / JPEG encode), manual
   upload action on the record library, multipart POST with the
   metadata schema.
4. `pending_uploads` table, retry worker, auto-mode toggle.
5. (Conditional on BazaarDB) URL scheme handoff handler for
   `bazaarplusplus://link`.

## Open items requiring BazaarDB confirmation

- Endpoint paths for token validation and screenshot upload.
- Whether BazaarDB will add the URL-scheme handoff button.
- Server-side rate-limit thresholds and `Retry-After` policy.
- Whether `auto_uploaded` is actually wanted in the payload, or whether
  BazaarDB prefers to treat all uploads identically.
