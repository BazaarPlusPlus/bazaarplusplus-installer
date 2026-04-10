# Home Shell And Stream Mode Design

## Goal

Evolve the current single-purpose installer into a small desktop utility with a stable home page and a dedicated `Stream Mode` area, while adding an OBS-facing local web service for live record display.

The product should support two very different user journeys without forcing them through the same screen every time:

1. Ordinary users who only need install, repair, and update workflows
2. Streamers who want a local overlay page backed by BazaarPlusPlus match data

## Scope

This design covers:

- Replacing the current installer-first entry page with an application home page
- Introducing top-level navigation for the app shell
- Moving the current install flow into a dedicated `Install & Repair` page
- Adding a `Stream Mode` page for local overlay service controls and debugging
- Running a local HTTP service inside the installer process for OBS browser sources
- Minimizing the app to the system tray when the live service is running

This design does not cover:

- Changing how the mod captures screenshots
- OCR or screenshot recognition logic
- Changing the mod's SQLite schema beyond defining the read boundary needed by the installer
- Remote web hosting, cloud sync, or multiplayer services
- Auto-starting the overlay service on app launch in the initial version

## Product Direction

The current app behaves like an installer with some extra utility pages. That is no longer a good fit once additional features start accumulating.

The new direction should treat the app as a BazaarPlusPlus desktop utility with installation as one feature area rather than the entire product identity.

Design principles:

- Default entry goes to a neutral home page, not an install workflow
- Installation remains prominent but no longer dominates the product
- Streaming features live under a dedicated `Stream Mode` area because most users do not need them
- Live overlay behavior should be robust without introducing a second installed companion app
- The installer process may remain running during streaming sessions

## Information Architecture

Top-level navigation should be:

- `Home`
- `Install & Repair`
- `Stream Mode`
- `Changelog`
- `About`

### Home

The home page is a mixed overview and navigation surface.

It should show:

- Current game detection state
- Whether BazaarPlusPlus is installed
- Installed version and bundled version when known
- Update availability summary if already detected
- Stream service status when relevant
- Clear entry cards or actions for the other major sections

The home page should not duplicate the full install workflow. Its job is to summarize state and route users into the correct task area.

### Install & Repair

This page should contain the current install workflow almost intact:

- Detect environment
- Select game path
- Install BazaarPlusPlus payload
- Repair legacy data
- Uninstall BazaarPlusPlus
- Handle Steam-related prompts and warnings

This remains the heavy operations page.

### Stream Mode

This page is the streamer-facing control surface.

Its first version should contain four primary blocks:

- Local service status
- OBS browser source URL
- Actions to copy the URL and open the preview page
- A small recent-record preview for debugging

The page should be clearly optional. Ordinary players should be able to ignore it entirely.

### Changelog

Reuse the recent changelog design and keep it as a read-only informational page.

### About

Reuse the existing about page.

## Stream Service Architecture

The OBS-facing service should run inside the Tauri backend, not as a separately installed companion application.

Reasoning:

- The user accepts keeping the installer process running during streaming sessions
- A second installed process would add packaging and support overhead without enough initial value
- The current app already has local filesystem context and Bazaar installation context
- Shipping one desktop app is simpler than shipping an app plus a managed background service

### Service lifecycle

Initial behavior should be:

1. App launches without starting the stream service automatically
2. User enters `Stream Mode`
3. User explicitly starts the service
4. Backend binds an available localhost port and reports the actual overlay URL
5. OBS loads the returned local page
6. If the main window is closed while service is running, the app hides to the tray instead of exiting
7. When the service is stopped, normal app exit behavior returns

The initial design should not auto-start the service on app launch.

## Port Selection Strategy

The service must not assume a fixed port is always available.

Recommended strategy:

- Define a preferred localhost port, for example `17654`
- Define a small reserved fallback range, for example `17654-17674`
- On start, try each port in order until binding succeeds
- Return the actual chosen port to the frontend
- If no port in the range is available, fail cleanly with a user-facing error

Constraints:

- Bind only to `127.0.0.1`
- Do not expose the service on the LAN in the initial version
- Do not hardcode the frontend to a specific port
- Tray actions such as `Copy OBS URL` must always use the currently active runtime port

If the preferred port is unavailable but a fallback is used, the UI should show that the port was switched automatically.

## Tray And Window Behavior

The app should only stay resident when it is actually useful.

### When stream service is not running

- Clicking the window close button should exit the app normally

### When stream service is running

- Clicking the window close button should prevent window destruction
- The main window should hide instead
- The process should remain alive
- The HTTP service should continue serving OBS
- A tray icon should remain available in the system notification area

### Initial tray menu

The first tray menu should expose:

- `Show Window`
- `Copy OBS URL`
- `Stop Stream Service`
- `Quit`

If the stream service is not running, `Copy OBS URL` and `Stop Stream Service` should be disabled or safely no-op with clear feedback.

## Data Source Boundary

The mod is responsible for producing data.

Known producer outputs:

- Screenshots written under `GameRoot/BazaarPlusPlus/ScreenShots`
- Match or record data written to a SQLite database

The installer should treat SQLite as the primary source of truth for live overlay rendering.

The screenshot directory may still be useful later for debug links, thumbnails, or manual review, but it should not be the primary data source for the first overlay implementation.

Reasoning:

- SQLite is structured and stable for query-based reading
- OBS overlay needs concise, deterministic data
- Polling SQLite is simpler and more reliable than scanning screenshots for meaning

## Data Access Model

The initial installer-side reader should be read-only.

Responsibilities:

- Discover the BazaarPlusPlus data directory from the detected game root
- Resolve the SQLite file path based on the mod's agreed output location
- Query the latest record and a short recent record list
- Map database rows into a frontend-safe API shape

Non-goals:

- Writing into the SQLite database
- Repairing or migrating schema from the installer
- Rebuilding data from screenshots

If the game path is missing or the SQLite file does not yet exist, the stream service should still start, but it should expose an empty-data state rather than crash.

## HTTP Surface

The service should expose both human-facing and machine-facing routes.

Initial routes:

- `GET /overlay`
  - The OBS browser source page
- `GET /api/records/latest`
  - Latest record payload for the overlay
- `GET /api/records/recent`
  - Small recent record list for app-side preview or later overlay variants
- `GET /health`
  - Lightweight status probe for diagnostics

The initial version should prefer simple polling over WebSocket or Server-Sent Events.

Reasoning:

- The data source is a local SQLite file, not a high-frequency event stream
- Polling every few seconds is sufficient for a live record board
- Polling reduces implementation and debugging complexity in both Rust and the overlay page

## Frontend Structure

Recommended route split:

- `src/routes/+page.svelte`
  - New `Home` page
- `src/routes/install/+page.svelte`
  - Current installer workflow moved here
- `src/routes/stream/+page.svelte`
  - New `Stream Mode` page
- Existing `about` and changelog routes remain separate

Recommended shared UI split:

- `src/lib/components/shell/*`
  - App shell, navigation, page header, home cards
- `src/lib/components/install/*`
  - Extracted install-specific UI where useful
- `src/lib/components/stream/*`
  - Service status, OBS URL card, recent preview, diagnostics

The install workflow should be migrated with minimal behavior change. The main structural change is route ownership and shared shell layout.

## Backend Structure

Recommended Rust module split:

- `src-tauri/src/commands/stream.rs`
  - Tauri commands for start, stop, and status
- `src-tauri/src/stream/mod.rs`
  - Service module entry point
- `src-tauri/src/stream/server.rs`
  - Listener setup, port binding, shutdown handling
- `src-tauri/src/stream/state.rs`
  - Runtime service state stored behind app-managed synchronization
- `src-tauri/src/stream/records.rs`
  - SQLite read helpers and record mapping
- `src-tauri/src/stream/http.rs`
  - HTTP route handlers and response formatting

This keeps install behavior and stream behavior from being mixed into the same command modules.

## Tauri Command Surface

The frontend should talk to the backend through explicit commands rather than inferring service state.

Initial command set:

- `start_stream_service`
- `stop_stream_service`
- `get_stream_service_status`
- `open_stream_overlay_preview` if needed, though the frontend may also open the returned URL directly

The service status payload should include at least:

- `running`
- `host`
- `port`
- `overlay_url`
- `using_fallback_port`
- `last_error`

## Overlay Behavior

The first overlay should optimize for clarity and robustness, not visual complexity.

Recommended first version:

- Display the latest record as the primary item
- Poll `GET /api/records/latest` periodically
- Handle empty state cleanly when no records exist yet
- Recover automatically if the SQLite data appears later after the service is already running

The app-side `Stream Mode` preview should be intentionally smaller and simpler than the OBS page. It exists for debugging and service verification, not as the main broadcast experience.

## Error Handling

The feature needs graceful degradation in several cases.

### Missing game path

- `Stream Mode` should explain that the game path is unknown
- Starting the service may still be allowed if path resolution can happen later, but the page should clearly show no data source is currently available

### Missing SQLite file

- Service can still run
- API returns empty or no-record payloads
- UI explains that no records are available yet

### Port range exhausted

- Service does not start
- Status remains stopped
- User sees a clear error that no local port in the reserved range could be bound

### SQLite read failure

- Service stays running
- API returns a safe error or empty-data response rather than crashing the process
- `Stream Mode` status should surface the last backend error

### Window close while service running

- Close event is intercepted
- Window hides to tray
- App keeps serving requests

### Quit from tray

- Service shuts down cleanly before process exit

## Testing And Verification

The implementation should use verification proportional to the touched surface.

Expected minimum verification for this work:

```sh
npm run check
```

Because this change affects Tauri behavior, packaging assumptions, and runtime service behavior, implementation should also run:

```sh
npm run prebuild-check
```

Recommended validation targets:

- Home route renders and navigation works
- Install workflow still behaves the same after being moved to a dedicated route
- `Stream Mode` can start and stop the local service
- Service chooses a fallback port when the preferred port is occupied
- OBS URL shown in the UI always matches the actual bound port
- Closing the window while service is running hides to tray instead of exiting
- Closing the window while service is stopped exits normally
- Empty SQLite state does not crash the service
- Overlay route and JSON endpoints return valid responses

Automated tests should focus on meaningful seams such as:

- Port-selection logic
- Stream service status transitions
- SQLite row mapping and empty-state handling
- Frontend state derivation for `Stream Mode`

The implementation does not need artificial tests that only assert source text or mock call order.

## Open Decisions Already Resolved

The following decisions are fixed by user direction:

- The app should grow beyond a one-time installer surface
- Top-level navigation should be `Home`, `Install & Repair`, `Stream Mode`, `Changelog`, and `About`
- `Home` should be a mixed overview and navigation page
- Streaming features belong under `Stream Mode`, not a top-level `Live Records` page
- The app may remain running during streaming sessions
- Clicking `X` while the stream service is running should hide the app to the system tray
- The app should use a runtime-selected localhost port instead of assuming a fixed port is free
- The mod provides screenshots and SQLite data; the installer should read from SQLite rather than parse screenshots
- The app-side stream preview should be a simplified debugging surface, not the primary broadcast layout

## Implementation Notes

When implementation starts, prioritize preserving current installer behavior by moving existing page logic with as little behavioral change as possible before layering on the new stream service.

The service and tray work should be added in a way that keeps normal non-streaming users on the simplest path: open app, use feature, close app, exit.
