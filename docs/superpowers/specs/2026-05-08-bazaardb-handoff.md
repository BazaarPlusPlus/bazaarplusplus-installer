# BazaarPlusPlus Installer → BazaarDB Upload Integration

## Goal

Allow installer users to publish end-of-run screenshots and run
metadata to BazaarDB without driving the existing browser upload flow.
The browser flow is unaffected.

## Authentication: personal access tokens (PAT)

The current upload endpoint depends on Supabase session cookies and a
Cloudflare Turnstile token, neither of which the installer can produce.
Proposed flow:

1. Add a token field to the BazaarDB account schema.
2. Provide a settings page where users generate and revoke tokens.
3. The installer sends `Authorization: Bearer <pat>` on every request.

The PAT is the installer's only credential. One installer instance is
bound to one BazaarDB account at a time.

## Endpoints

Two endpoints, both authenticated with `Authorization: Bearer <pat>`.
Paths below are placeholders — pick whatever fits your routing.

### Token validation

Called once when the user connects their account, to verify the PAT and
fetch the account display name to show in the installer UI.

```
GET /api/auth/me

200 { "account_name": "Xinyu" }
401 { "error": "..." }
```

### Screenshot upload

```
POST /api/uploads/screenshot
Content-Type: multipart/form-data

image:    <JPEG bytes — see "Image format">
metadata: <JSON string — see "Fields">

200 { "id": "<server-side id>" }    on first upload OR duplicate
4xx { "error": "..." }              permanent failure (installer surfaces)
5xx { "error": "..." }              transient failure (installer retries)
```

## Fields

### Per-screenshot metadata (sent on every upload)

| Field | Type | Notes |
| --- | --- | --- |
| `screenshot_id` | string (UUID) | Idempotency key; stable across retries |
| `run_id` | string | One run can have multiple screenshots |
| `hero_name` | string | e.g. "Mak", "Vanessa" |
| `final_days` | int | In-game turn count at end of run |
| `final_victories` | int | Wins at end of run |
| `player_name` | string | Display only — see Multi-user semantics |
| `player_account_id` | string | Stable in-game account identifier |
| `player_rank` | string | e.g. "Diamond" |
| `player_rating` | int | MMR |
| `player_position` | int | Final placement |
| `captured_at_utc` | string (ISO 8601) | UTC timestamp |

### Client metadata (set by the installer)

| Field | Type | Notes |
| --- | --- | --- |
| `schema_version` | int | Starts at 1; bumped on field changes |
| `installer_version` | string | Installer's semver |
| `auto_uploaded` | bool | True if uploaded by auto mode, false if manual |
| `image_format` | string | Encoding of the uploaded image, e.g. `"jpeg"` |

## Image format

End-of-run screenshots are PNGs at the user's display resolution
(typically 5–10 MB at 1080p, larger at higher resolutions). The
installer downscales and re-encodes before upload:

- **Format**: JPEG.
- **Quality**: 85.
- **Max longest edge**: 1920 px, preserving aspect ratio.
- **Typical size**: 200–500 KB. Soft cap 2 MB.

## Multi-user semantics

A single PC can be used to play multiple in-game accounts over time. As
a result, **the same BazaarDB user (= same PAT) may upload runs from
different in-game accounts.**

- `bazaardb_user` (derived from the PAT) = "who submitted this".
  Authoritative for rate limiting, attribution, revocation.
- `player_account_id` (from the upload payload) = "who played this run".
  Authoritative for aggregation, leaderboards, per-account stats.

These are not the same identity. The relationship is many-to-many; the
schema should not enforce a 1:1 mapping.

`player_name` is display only — players can rename. Aggregation and
dedup must always go through `player_account_id`.

## Server-side expectations

### Idempotency / dedup

- Use `screenshot_id` as a unique key.
- Repeat uploads (same `screenshot_id`) MUST return 200 with the
  existing record id, not an error. The installer retries on transient
  failures and depends on idempotent semantics.

### Rate limiting

- Per-PAT rate limiting recommended.
- Respect `Retry-After` on 429.

### Suspicious upload signals

If a single PAT submits many distinct `player_account_id` values in a
short window, that may be either legitimate (e.g. a streamer with test
accounts) or a token-leak case. Useful as a risk-control signal.

## Optional: URL scheme handoff

The installer registers the `bazaarplusplus://` URL scheme on the
user's machine. If the BazaarDB token page adds a "Send to
BazaarPlusPlus" button that opens

```
bazaarplusplus://link?token=<pat>&account=<display_name>
```

users skip the copy-paste step. The installer handles the deep link,
validates via `GET /api/auth/me`, and stores the token.

UX shortcut, not a requirement. Without it, users paste the PAT
manually and the integration works the same.

## Suggested: pending confirmation review flow

Consider a per-user pending queue: incoming uploads land in the queue,
and the BazaarDB account holder approves, edits, or discards each
entry from the BazaarDB UI before it becomes publicly visible.

This addresses three concerns at once:

- Mis-captured screenshots can be filtered before going public.
- If `player_account_id` was wrong at capture time (user was on a
  different in-game account), they can spot and discard.
- Acts as a safety valve if a PAT is leaked: the legitimate account
  holder sees unfamiliar uploads in their queue and can revoke the
  token plus clean up affected entries before they spread.

Purely a BazaarDB UX decision. The installer does not need to know
whether an upload was published immediately or queued for review, so
this can be added without any installer changes.

## Open questions

- Endpoint paths for token validation and screenshot upload.
- Whether `auto_uploaded` is wanted in the metadata, or whether you
  prefer to treat all uploads identically.
- Server-side rate limit thresholds and any specific 429 behavior
  beyond `Retry-After`.
- Whether you'd like to ship the URL scheme handoff button.
- Whether you'd like to ship a pending confirmation review flow.
